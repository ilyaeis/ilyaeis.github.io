// ── Orchestrator ───────────────────────────────────────────────────
// Tap-driven state machine. Flight uses a Bezier curve from attractor
// tip to a pre-calculated next attractor center. No impulse physics.

import * as THREE from 'three';
import {
    ATTRACTORS, controls, camera, scene,
    createTrailSystem, addTrailToScene, clearTrail,
    pushPointWorld, updateTrailAttributes, updateTrailGlow,
    rk4Step, addJourneyTime, render, isPaused
} from './attractors.js';
import * as cam from './camera.js';
import { generateTextLines, generateRockWithLabel, generateFlag } from './strokeFont.js';

// ── Phase enum ─────────────────────────────────────────────────────
export const Phase = {
    INTRO: 0,
    TRANSITION_OUT: 1,
    ROCKET_HINT: 6,
    ROCKET_EXIT: 7,
    VORTEX: 2,
    FLIGHT_TO_TEXT: 8,
    TEXT_DRAW: 9,
    FLIGHT: 3,
    ATTRACTOR_DRAW: 4,
    LAUNCH_FROM_ATTRACTOR: 5,
    ROCK_FLIGHT: 10,
    ROCK_DRAW: 11
};

// ── State ──────────────────────────────────────────────────────────
let phase = Phase.INTRO;
let phaseTime = 0;
let attractorIndex = 0;
let tapPending = false;
let totalTime = 0;
let phaseFirstFrame = true;

let trail = null;

const worldPos = new THREE.Vector3();
const _vec3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _startPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();

// Frozen camera basis for vortex (captured once at vortex start)
const vortexRight = new THREE.Vector3();
const vortexUp = new THREE.Vector3();
const vortexFwd = new THREE.Vector3(); // camera forward — gives depth to the spiral

// Where the current attractor is centered in world space
const attractorOffset = new THREE.Vector3();

// Bezier curve control points for flight
const bezP0 = new THREE.Vector3(); // start
const bezP1 = new THREE.Vector3(); // control 1
const bezP2 = new THREE.Vector3(); // control 2
const bezP3 = new THREE.Vector3(); // end (next attractor center)

// Attractor integration state
let attractorState = [0, 0, 0];

// Text overlay state
let textPoints = null;      // pre-generated 2D point array
let textPointIdx = 0;       // index into textPoints
const textCenter = new THREE.Vector3();
const textRight = new THREE.Vector3();   // camera-aligned right axis
const textUp = new THREE.Vector3();      // camera-aligned up axis
const textDepartDir = new THREE.Vector3(); // saved departure direction
const textLastPoint = new THREE.Vector3();
let flightCameraDelay = 0;  // seconds to wait before camera follows flight
const textFacePos = new THREE.Vector3(); // reused for camera face-on target

// Constellation state
let constellationDone = false;
let rockIdx = 0;
let rockDataArray = [];     // { center: Vector3, points: [{x,y}], outlineCount }
let rockPoints = null;
let rockPointIdx = 0;
let greyRockLines = [];     // THREE.Line objects for grey previews
const constellationDir = new THREE.Vector3();
const rockRight = new THREE.Vector3();
const rockUp = new THREE.Vector3();
const rockFwd = new THREE.Vector3();
let rockFlightDuration = 0;

// ── Tuning ─────────────────────────────────────────────────────────

// Vortex — growing spiral whose plane precesses (tilts) each revolution
const VORTEX_GROWTH = 0.05;          // radial expansion rate
const VORTEX_R0 = 0.001;
const VORTEX_ANGULAR_SPEED = 12.0;   // spin speed (rad/s)
const VORTEX_PRECESS_DEG = 5.0;      // degrees the spiral plane tilts per full revolution
const VORTEX_POINTS_PER_FRAME = 16;
const VORTEX_TAP_DELAY = 1.5;

// Flight
const FLIGHT_DURATION = 4.0;        // 4 seconds of curved flight
const FLIGHT_DISTANCE = 10.0;       // fly far so previous attractor fully gone
const FLIGHT_POINTS_PER_FRAME = 30; // more points for denser trail
const BLEND_START = 0.80;           // at 80% of flight, start blending attractor in
const BLEND_RAMP = 0.20;            // blend over last 20% of flight

// Attractor draw
const ATTRACTOR_MIN_DRAW = 5.0;

// Text overlay
const TEXT_FLIGHT_DURATION = 2.5;     // flight to text center
const TEXT_POINTS_PER_FRAME = 170;    // drawing speed (high density letters)
const TEXT_SCALE = 0.22;              // world-space size of text (fits 3 lines in view)
const TEXT_LINGER_CAMERA = 1.0;       // camera stays on text this long after drawing
const TEXT_LINES = ['CREATIVE.', 'ADAPTIVE.', 'CURIOUS.'];

// Constellation (milestone rocks after Lorenz)
const ROCK_SCALE = 0.4;              // world units per 2D unit
const ROCK_DRAW_PTS = 110;           // points per frame when drawing rock + label
const ROCK_FLIGHT_SPEED = 2.5;       // world units per second
const MILESTONES = [
    { label: 'SECONDARY SCHOOL', sublabel: 'GYMNASIUM', sizeFactor: 1.0,  seed: 42, distance: 8.0 },
    { label: 'BACHELOR IN', sublabel: 'FINANCIAL ENGINEERING', sizeFactor: 0.55, seed: 73, distance: 7.0 },
    { label: 'R&D ENGINEER', sublabel: 'GIRAFFE360', sizeFactor: 0.35, seed: 17, distance: 5.0 },
];

// Rocket hint
const ROCKET_FLY_DURATION = 1.2;   // matches CSS animation duration
const ROCKET_BUBBLE_SHOW = 0.5;    // bubble visible before auto-exit
const ROCKET_EXIT_DURATION = 1.3;  // JS Bezier loop + accelerate away

// DOM refs
let tapPromptEl = null;
let page1El = null;
let socialEl = null;
let rocketHintEl = null;

// ── Init ───────────────────────────────────────────────────────────
export function init() {
    tapPromptEl = document.querySelector('.tap-prompt');
    page1El = document.querySelector('.page-1');
    socialEl = document.querySelector('.social');
    rocketHintEl = document.getElementById('rocket-hint');
    trail = createTrailSystem();
    cam.init(controls);
    showTapPrompt();
}

export function onTap() { tapPending = true; }

function showTapPrompt() { if (tapPromptEl) tapPromptEl.classList.add('visible'); }
function hideTapPrompt() { if (tapPromptEl) tapPromptEl.classList.remove('visible'); }

function enterPhase(newPhase) {
    phase = newPhase;
    phaseTime = 0;
    phaseFirstFrame = true;
}

// ── Cubic Bezier evaluation ────────────────────────────────────────
function bezierPoint(t, out) {
    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;
    out.x = uuu * bezP0.x + 3 * uu * t * bezP1.x + 3 * u * tt * bezP2.x + ttt * bezP3.x;
    out.y = uuu * bezP0.y + 3 * uu * t * bezP1.y + 3 * u * tt * bezP2.y + ttt * bezP3.y;
    out.z = uuu * bezP0.z + 3 * uu * t * bezP1.z + 3 * u * tt * bezP2.z + ttt * bezP3.z;
    return out;
}

// ── Setup a flight curve from a start position + direction to a target ──
function setupFlightCurve(startPos, startDir, targetPos) {
    bezP0.copy(startPos);
    bezP3.copy(targetPos);

    // Control point 1: extend from start in the departure direction
    const dist = startPos.distanceTo(targetPos);
    bezP1.copy(startDir).normalize().multiplyScalar(dist * 0.4).add(startPos);

    // Control point 2: approach target gently from the flight direction
    // (pull back from target along the overall flight vector)
    _vec3.copy(targetPos).sub(startPos).normalize();
    bezP2.copy(_vec3).multiplyScalar(-dist * 0.3).add(targetPos);
}

// ── Attractor integration at offset ────────────────────────────────
function integrateAtOffset(attr, nPoints) {
    for (let i = 0; i < nPoints; i++) {
        attractorState = rk4Step(
            attr.derivatives,
            attractorState[0], attractorState[1], attractorState[2],
            attr.dt, attr.params
        );
        for (let j = 0; j < 3; j++) {
            if (Math.abs(attractorState[j]) > 150) {
                attractorState[j] *= 150 / Math.abs(attractorState[j]);
            }
            if (!isFinite(attractorState[j])) {
                attractorState = [...attr.initialCondition];
                break;
            }
        }
        pushPointWorld(trail,
            (attractorState[0] - attr.center[0]) * attr.scale + attractorOffset.x,
            (attractorState[1] - attr.center[1]) * attr.scale + attractorOffset.y,
            (attractorState[2] - attr.center[2]) * attr.scale + attractorOffset.z
        );
    }
}

// ── Update ─────────────────────────────────────────────────────────
export function update(dt) {
    if (isPaused()) return;
    totalTime += dt;
    addJourneyTime(dt);

    switch (phase) {
        case Phase.INTRO:           updateIntro(dt); break;
        case Phase.TRANSITION_OUT:  updateTransitionOut(dt); break;
        case Phase.ROCKET_HINT:     updateRocketHint(dt); break;
        case Phase.ROCKET_EXIT:     updateRocketExit(dt); break;
        case Phase.VORTEX:          updateVortex(dt); break;
        case Phase.FLIGHT_TO_TEXT:  updateFlightToText(dt); break;
        case Phase.TEXT_DRAW:       updateTextDraw(dt); break;
        case Phase.FLIGHT:          updateFlight(dt); break;
        case Phase.ATTRACTOR_DRAW:  updateAttractorDraw(dt); break;
        case Phase.LAUNCH_FROM_ATTRACTOR: updateLaunchFromAttractor(dt); break;
        case Phase.ROCK_FLIGHT: updateRockFlight(dt); break;
        case Phase.ROCK_DRAW:   updateRockDraw(dt); break;
    }

    phaseTime += dt;

    if (trail && trail.inScene) {
        updateTrailAttributes(trail);
        updateTrailGlow(trail, totalTime);
    }

    cam.update(dt, controls, camera, worldPos);
    render();
}

// ── INTRO ──────────────────────────────────────────────────────────
function updateIntro(dt) {
    if (tapPending) {
        tapPending = false;
        hideTapPrompt();
        enterPhase(Phase.TRANSITION_OUT);
    }
}

// ── TRANSITION_OUT ─────────────────────────────────────────────────
function updateTransitionOut(dt) {
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        page1El.classList.add('fade-out');

        const firstRect = socialEl.getBoundingClientRect();
        socialEl.classList.add('corner');
        const lastRect = socialEl.getBoundingClientRect();
        const dx = firstRect.left - lastRect.left;
        const dy = firstRect.top - lastRect.top;
        socialEl.style.transform = `translate(${dx}px, ${dy}px)`;
        socialEl.getBoundingClientRect();
        socialEl.style.transition = 'transform 0.6s ease';
        socialEl.style.transform = 'translate(0, 0)';
        socialEl.addEventListener('transitionend', function cleanup() {
            socialEl.removeEventListener('transitionend', cleanup);
            socialEl.style.transition = '';
            socialEl.style.transform = '';
        });
    }

    if (phaseTime >= 0.8) {
        enterPhase(Phase.ROCKET_HINT);
    }
}

// ── ROCKET_HINT ───────────────────────────────────────────────────
function updateRocketHint(dt) {
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        // Measure bubble to compute landing position
        const bubble = rocketHintEl.querySelector('.rocket-bubble');
        // Temporarily make visible to measure
        rocketHintEl.style.visibility = 'visible';
        rocketHintEl.style.opacity = '0';
        bubble.style.opacity = '1';
        const bubbleW = bubble.offsetWidth;
        bubble.style.opacity = '';
        rocketHintEl.style.visibility = '';
        rocketHintEl.style.opacity = '';
        // Center rocket + bubble on screen
        const rocketW = 32; // ~2rem
        const totalW = rocketW + 48 + bubbleW; // icon + 3rem gap + bubble
        const landLeft = (window.innerWidth - totalW) / 2;
        rocketHintEl.style.setProperty('--land-left', landLeft + 'px');
        rocketHintEl.classList.add('flying');
    }

    // After flight animation completes, show the bubble
    if (phaseTime >= ROCKET_FLY_DURATION && !rocketHintEl.classList.contains('arrived')) {
        rocketHintEl.classList.add('arrived');
    }

    // Consume any stray taps during rocket
    if (tapPending) tapPending = false;

    // Auto-advance after bubble shown briefly
    if (phaseTime >= ROCKET_FLY_DURATION + ROCKET_BUBBLE_SHOW) {
        enterPhase(Phase.ROCKET_EXIT);
    }
}

// ── ROCKET_EXIT (JS Bezier-driven loop + accelerate away) ────────
// Bezier control points in screen pixels, set on first frame
let rocketBezP0 = { x: 0, y: 0 };
let rocketBezP1 = { x: 0, y: 0 };
let rocketBezP2 = { x: 0, y: 0 };
let rocketBezP3 = { x: 0, y: 0 };

function rocketBezierPoint(t) {
    const u = 1 - t;
    return {
        x: u*u*u * rocketBezP0.x + 3*u*u*t * rocketBezP1.x + 3*u*t*t * rocketBezP2.x + t*t*t * rocketBezP3.x,
        y: u*u*u * rocketBezP0.y + 3*u*u*t * rocketBezP1.y + 3*u*t*t * rocketBezP2.y + t*t*t * rocketBezP3.y
    };
}

function rocketBezierTangent(t) {
    const u = 1 - t;
    return {
        x: 3*u*u*(rocketBezP1.x - rocketBezP0.x) + 6*u*t*(rocketBezP2.x - rocketBezP1.x) + 3*t*t*(rocketBezP3.x - rocketBezP2.x),
        y: 3*u*u*(rocketBezP1.y - rocketBezP0.y) + 6*u*t*(rocketBezP2.y - rocketBezP1.y) + 3*t*t*(rocketBezP3.y - rocketBezP2.y)
    };
}

function updateRocketExit(dt) {
    const vw = window.innerWidth / 100;
    const vh = window.innerHeight / 100;

    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        rocketHintEl.classList.remove('arrived', 'flying');
        void rocketHintEl.offsetWidth;
        rocketHintEl.classList.add('exiting');

        // Read current landing position
        const landLeft = parseFloat(rocketHintEl.style.getPropertyValue('--land-left')) || (50 * vw - 80);
        const landBottom = 50 * vh;

        // Bezier: small loop then swoop off-screen bottom-left with acceleration
        rocketBezP0 = { x: landLeft, y: landBottom };
        rocketBezP1 = { x: landLeft + 8 * vw, y: landBottom + 12 * vh };  // up-right (loop top)
        rocketBezP2 = { x: landLeft + 4 * vw, y: landBottom - 15 * vh };  // down-right (loop bottom)
        rocketBezP3 = { x: -80, y: -80 };                                  // off-screen bottom-left
    }

    // Ease-in (cubic) for acceleration effect
    const rawT = Math.min(phaseTime / ROCKET_EXIT_DURATION, 1);
    const t = rawT * rawT * rawT;

    const pos = rocketBezierPoint(t);
    const tan = rocketBezierTangent(t);

    // Position
    rocketHintEl.style.left = pos.x + 'px';
    rocketHintEl.style.bottom = pos.y + 'px';

    // Rotation from tangent (angle relative to up-right)
    const angle = Math.atan2(tan.x, tan.y) * (180 / Math.PI) - 45;
    const iconEl = rocketHintEl.querySelector('.rocket-icon');
    if (iconEl) iconEl.style.transform = `rotate(${-angle}deg)`;

    // Fade out in last 30%
    const opacity = rawT > 0.7 ? 1 - (rawT - 0.7) / 0.3 : 1;
    rocketHintEl.style.opacity = opacity;

    if (rawT >= 1) {
        rocketHintEl.classList.remove('exiting');
        rocketHintEl.style.visibility = 'hidden';
        rocketHintEl.style.opacity = '';
        rocketHintEl.style.left = '';
        rocketHintEl.style.bottom = '';
        if (iconEl) iconEl.style.transform = '';

        // Set up vortex
        worldPos.set(0, 0, 0);
        attractorOffset.set(0, 0, 0);
        trail.attractorIdx = 0;
        trail.fade = 1;
        clearTrail(trail);
        addTrailToScene(trail);
        pushPointWorld(trail, 0, 0, 0);
        enterPhase(Phase.VORTEX);
    }
}

// ── VORTEX ─────────────────────────────────────────────────────────
function updateVortex(dt) {
    // Capture camera basis ONCE on first frame
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        camera.getWorldDirection(vortexFwd);
        vortexRight.crossVectors(vortexFwd, camera.up).normalize();
        vortexUp.crossVectors(vortexRight, vortexFwd).normalize();
    }

    const t = phaseTime;
    const prevT = Math.max(0, t - dt);

    // Growing spiral whose plane precesses around the forward axis.
    // The base right/up vectors rotate by a small angle each revolution.
    // precessionAngle = (theta / 2*PI) * PRECESS_DEG in radians
    const precessRate = VORTEX_PRECESS_DEG * Math.PI / 180; // rad per revolution

    function spiralPos(st) {
        const theta = VORTEX_ANGULAR_SPEED * st;
        const r = VORTEX_R0 + VORTEX_GROWTH * st;
        // How many revolutions so far → cumulative precession angle
        const precess = (theta / (2 * Math.PI)) * precessRate;
        // Rotate right/up around forward by precession angle
        const cosP = Math.cos(precess);
        const sinP = Math.sin(precess);
        // Rotated basis: right' = cos(p)*right + sin(p)*fwd
        //                up stays the same (precession tilts the plane)
        const rx = cosP * vortexRight.x + sinP * vortexFwd.x;
        const ry = cosP * vortexRight.y + sinP * vortexFwd.y;
        const rz = cosP * vortexRight.z + sinP * vortexFwd.z;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        return [
            r * (cosT * rx + sinT * vortexUp.x),
            r * (cosT * ry + sinT * vortexUp.y),
            r * (cosT * rz + sinT * vortexUp.z)
        ];
    }

    for (let i = 0; i < VORTEX_POINTS_PER_FRAME; i++) {
        const frac = i / VORTEX_POINTS_PER_FRAME;
        const subT = prevT + (t - prevT) * frac;
        const p = spiralPos(subT);
        pushPointWorld(trail, p[0], p[1], p[2]);
    }

    const pos = spiralPos(t);
    worldPos.set(pos[0], pos[1], pos[2]);

    if (phaseTime >= VORTEX_TAP_DELAY) showTapPrompt();

    if (tapPending && phaseTime >= VORTEX_TAP_DELAY) {
        tapPending = false;
        hideTapPrompt();

        // Departure direction: finite difference
        const eps = 0.001;
        const p0 = spiralPos(t - eps);
        const p1 = spiralPos(t + eps);
        _dir.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();

        // Save direction for later flight to attractor
        textDepartDir.copy(_dir);

        // Text center: halfway to where the attractor will be
        textCenter.copy(worldPos).addScaledVector(_dir, FLIGHT_DISTANCE * 0.5);

        // Set up Bezier from vortex tip to text center
        setupFlightCurve(worldPos, _dir, textCenter);

        // Pre-generate text points (3 lines with return curves)
        const { points } = generateTextLines(TEXT_LINES);
        textPoints = points;
        textPointIdx = 0;

        trail.attractorIdx = attractorIndex; // use Lorenz palette for text
        trail.drawTime = 0;

        cam.setMode(cam.Mode.FOLLOW, controls);
        enterPhase(Phase.FLIGHT_TO_TEXT);
    }
}

// ── FLIGHT_TO_TEXT (Bezier to text center, no attractor blend) ─────
function updateFlightToText(dt) {
    const t = Math.min(phaseTime / TEXT_FLIGHT_DURATION, 1);
    const prevT = Math.max(0, (phaseTime - dt) / TEXT_FLIGHT_DURATION);

    for (let i = 0; i < FLIGHT_POINTS_PER_FRAME; i++) {
        const frac = i / FLIGHT_POINTS_PER_FRAME;
        const subT = prevT + (t - prevT) * frac;
        bezierPoint(subT, _vec3);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }

    bezierPoint(t, worldPos);

    if (t >= 1) {
        // Orient text plane perpendicular to the flight path
        _dir.copy(textDepartDir);
        textRight.crossVectors(_dir, camera.up).normalize();
        textUp.crossVectors(textRight, _dir).normalize();

        // Camera orbits text center with no rotation
        cam.setMode(cam.Mode.ORBIT, controls);
        cam.setOrbitCenter(textCenter.x, textCenter.y, textCenter.z);
        controls.autoRotateSpeed = 0;

        enterPhase(Phase.TEXT_DRAW);
    }
}

// ── TEXT_DRAW (trace "CREATIVE" with camera aligning during draw) ──
function updateTextDraw(dt) {
    // Compute face-on camera target on first frame
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        const dist = camera.position.distanceTo(textCenter);
        textFacePos.copy(textCenter).addScaledVector(textDepartDir, -dist);
    }

    // Smoothly align camera to face text DURING drawing
    const camSpeed = 2.0;
    const camFactor = 1 - Math.exp(-camSpeed * dt);
    camera.position.lerp(textFacePos, camFactor);

    // All points drawn → launch to attractor
    if (!textPoints || textPointIdx >= textPoints.length) {
        trail.colorFreezeIdx = trail.pointCount;

        if (textPoints && textPoints.length > 0) {
            const lp = textPoints[textPoints.length - 1];
            textLastPoint.set(
                textCenter.x + (lp.x * textRight.x + lp.y * textUp.x) * TEXT_SCALE,
                textCenter.y + (lp.x * textRight.y + lp.y * textUp.y) * TEXT_SCALE,
                textCenter.z + (lp.x * textRight.z + lp.y * textUp.z) * TEXT_SCALE
            );
        } else {
            textLastPoint.copy(textCenter);
        }

        attractorOffset.copy(textCenter).addScaledVector(textDepartDir, FLIGHT_DISTANCE);

        const attr = ATTRACTORS[attractorIndex];
        attractorState = [...attr.initialCondition];
        trail.attractorIdx = attractorIndex;
        trail.drawTime = 0;

        setupFlightCurve(textLastPoint, textDepartDir, attractorOffset);
        worldPos.copy(textLastPoint);

        flightCameraDelay = TEXT_LINGER_CAMERA;
        enterPhase(Phase.FLIGHT);
        return;
    }

    // Push the next batch of text points
    const end = Math.min(textPointIdx + TEXT_POINTS_PER_FRAME, textPoints.length);
    for (let i = textPointIdx; i < end; i++) {
        const p = textPoints[i];
        pushPointWorld(trail,
            textCenter.x + (p.x * textRight.x + p.y * textUp.x) * TEXT_SCALE,
            textCenter.y + (p.x * textRight.y + p.y * textUp.y) * TEXT_SCALE,
            textCenter.z + (p.x * textRight.z + p.y * textUp.z) * TEXT_SCALE
        );
    }
    textPointIdx = end;

    worldPos.copy(textCenter);
}

// ── FLIGHT (Bezier curve with attractor blend-in at end) ───────────
function updateFlight(dt) {
    // Delayed camera follow (after text phase — camera lingers on text)
    if (flightCameraDelay > 0 && phaseTime >= flightCameraDelay) {
        cam.setMode(cam.Mode.FOLLOW, controls);
        flightCameraDelay = 0;
    }

    const t = Math.min(phaseTime / FLIGHT_DURATION, 1);
    const prevT = Math.max(0, (phaseTime - dt) / FLIGHT_DURATION);

    // Push points along the Bezier curve
    for (let i = 0; i < FLIGHT_POINTS_PER_FRAME; i++) {
        const frac = i / FLIGHT_POINTS_PER_FRAME;
        const subT = prevT + (t - prevT) * frac;
        bezierPoint(subT, _vec3);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }

    // Camera follows the curve tip
    bezierPoint(t, worldPos);

    // Blend attractor in during the last portion of the flight
    if (t >= BLEND_START) {
        const blend = (t - BLEND_START) / BLEND_RAMP; // 0→1
        const eased = blend * blend * (3 - 2 * blend); // smoothstep
        const attr = ATTRACTORS[attractorIndex];
        const nPoints = Math.floor(10 + 250 * eased);
        integrateAtOffset(attr, nPoints);
    }

    // Flight complete → fully in attractor
    if (t >= 1) {
        worldPos.copy(attractorOffset);
        cam.setMode(cam.Mode.ORBIT, controls);
        cam.setOrbitCenter(attractorOffset.x, attractorOffset.y, attractorOffset.z);
        const attr = ATTRACTORS[attractorIndex];
        controls.autoRotateSpeed = attr.camera.azimuthSpeed;
        enterPhase(Phase.ATTRACTOR_DRAW);
    }
}

// ── ATTRACTOR_DRAW ─────────────────────────────────────────────────
function updateAttractorDraw(dt) {
    const attr = ATTRACTORS[attractorIndex];
    const rampT = Math.min((phaseTime + trail.drawTime) / 5, 1);
    const nPoints = Math.floor(50 + 250 * rampT);
    integrateAtOffset(attr, nPoints);

    worldPos.copy(attractorOffset); // camera stays stable

    if (phaseTime >= ATTRACTOR_MIN_DRAW) showTapPrompt();

    if (tapPending && phaseTime >= ATTRACTOR_MIN_DRAW) {
        tapPending = false;
        hideTapPrompt();
        if (attractorIndex === 0 && !constellationDone) {
            setupConstellation();
            enterPhase(Phase.ROCK_FLIGHT);
        } else {
            enterPhase(Phase.LAUNCH_FROM_ATTRACTOR);
        }
    }
}

// ── LAUNCH_FROM_ATTRACTOR ──────────────────────────────────────────
function updateLaunchFromAttractor(dt) {
    const attr = ATTRACTORS[attractorIndex];
    const s = attractorState;

    // Get the direction the attractor point was last heading
    const derivs = attr.derivatives(s[0], s[1], s[2], attr.params);
    _dir.set(
        derivs[0] * attr.scale,
        derivs[1] * attr.scale,
        derivs[2] * attr.scale
    ).normalize();

    // Start position = attractor tip in world space
    _startPos.set(
        (s[0] - attr.center[0]) * attr.scale + attractorOffset.x,
        (s[1] - attr.center[1]) * attr.scale + attractorOffset.y,
        (s[2] - attr.center[2]) * attr.scale + attractorOffset.z
    );

    // Target = fly FLIGHT_DISTANCE away in the departure direction
    _targetPos.copy(_startPos).addScaledVector(_dir, FLIGHT_DISTANCE);

    // Freeze existing trail colors before switching palette
    trail.colorFreezeIdx = trail.pointCount;

    // Set up the next attractor
    attractorIndex = (attractorIndex + 1) % ATTRACTORS.length;
    attractorOffset.copy(_targetPos);
    const nextAttr = ATTRACTORS[attractorIndex];
    attractorState = [...nextAttr.initialCondition];
    trail.attractorIdx = attractorIndex;
    trail.drawTime = 0;

    // Build the Bezier curve
    setupFlightCurve(_startPos, _dir, _targetPos);
    worldPos.copy(_startPos);

    flightCameraDelay = 0; // no delay for normal attractor transitions
    cam.setMode(cam.Mode.FOLLOW, controls);
    enterPhase(Phase.FLIGHT);
}

// ── CONSTELLATION: setup ──────────────────────────────────────────
function setupConstellation() {
    const attr = ATTRACTORS[attractorIndex];
    const s = attractorState;

    // Departure direction from attractor tip
    const derivs = attr.derivatives(s[0], s[1], s[2], attr.params);
    constellationDir.set(
        derivs[0] * attr.scale,
        derivs[1] * attr.scale,
        derivs[2] * attr.scale
    ).normalize();

    // Start position = attractor tip in world space
    _startPos.set(
        (s[0] - attr.center[0]) * attr.scale + attractorOffset.x,
        (s[1] - attr.center[1]) * attr.scale + attractorOffset.y,
        (s[2] - attr.center[2]) * attr.scale + attractorOffset.z
    );

    // Freeze trail colors
    trail.colorFreezeIdx = trail.pointCount;

    // Orient rock plane perpendicular to flight direction
    rockRight.crossVectors(constellationDir, camera.up).normalize();
    rockUp.crossVectors(rockRight, constellationDir).normalize();
    rockFwd.crossVectors(rockRight, rockUp).normalize();

    // Pre-generate all rock data — triangle layout (not a straight line)
    // Offsets perpendicular to flight direction for each rock
    const triOffsets = [
        { right: -1.5, up:  0.8 },   // top-left
        { right:  1.8, up:  0.3 },   // right
        { right: -0.5, up: -1.2 },   // bottom-left
    ];
    rockDataArray = [];
    let cumDist = 0;
    for (let mi = 0; mi < MILESTONES.length; mi++) {
        const ms = MILESTONES[mi];
        cumDist += ms.distance;
        const off = triOffsets[mi];
        const center = _startPos.clone()
            .addScaledVector(constellationDir, cumDist)
            .addScaledVector(rockRight, off.right)
            .addScaledVector(rockUp, off.up);
        const { points, outlineCount } = generateRockWithLabel(
            ms.sizeFactor, ms.seed, ms.label, ms.sublabel
        );
        // Find topmost outline point for flag anchor
        let maxY = -Infinity;
        for (let i = 0; i < outlineCount; i++) {
            if (points[i].y > maxY) maxY = points[i].y;
        }
        // Find the point closest to the top with the most positive x (visible side)
        let topIdx = 0;
        for (let i = 0; i < outlineCount; i++) {
            if (points[i].y > maxY - 0.05 * ms.sizeFactor && points[i].x > points[topIdx].x) {
                topIdx = i;
            }
        }
        const anchor = points[topIdx];
        const { points: flagPts } = generateFlag(
            anchor.x, anchor.y, anchor.z || 0, ms.sizeFactor * 0.3
        );
        rockDataArray.push({ center, points, outlineCount, flagPoints: flagPts });
    }

    // Create grey preview outlines for all rocks
    greyRockLines = [];
    for (const rd of rockDataArray) {
        const pts = rd.points;
        const n = rd.outlineCount;
        const positions = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const p = pts[i];
            const pz = p.z || 0;
            positions[i * 3]     = rd.center.x + (p.x * rockRight.x + p.y * rockUp.x + pz * rockFwd.x) * ROCK_SCALE;
            positions[i * 3 + 1] = rd.center.y + (p.x * rockRight.y + p.y * rockUp.y + pz * rockFwd.y) * ROCK_SCALE;
            positions[i * 3 + 2] = rd.center.z + (p.x * rockRight.z + p.y * rockUp.z + pz * rockFwd.z) * ROCK_SCALE;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({
            color: 0x444444, transparent: true, opacity: 0.3
        });
        const line = new THREE.Line(geo, mat);
        line.frustumCulled = false;
        scene.add(line);
        greyRockLines.push(line);
    }

    // Set up flight to first rock (curved)
    rockIdx = 0;
    rockFlightDuration = MILESTONES[0].distance / ROCK_FLIGHT_SPEED;
    setupCurvedRockFlight(_startPos, rockDataArray[0].center, 0);
    worldPos.copy(_startPos);

    cam.setMode(cam.Mode.FOLLOW, controls);
}

// ── Curved Bezier for rock-to-rock flights ────────────────────────
function setupCurvedRockFlight(startPos, targetPos, curveIdx) {
    bezP0.copy(startPos);
    bezP3.copy(targetPos);

    const dist = startPos.distanceTo(targetPos);
    const sign = (curveIdx % 2 === 0) ? 1 : -1;

    // P1: depart forward with sideways arc
    bezP1.copy(constellationDir).multiplyScalar(dist * 0.35).add(startPos);
    bezP1.addScaledVector(rockRight, sign * dist * 0.3);
    bezP1.addScaledVector(rockUp, dist * 0.12);

    // P2: approach target from opposite side
    _vec3.copy(targetPos).sub(startPos).normalize();
    bezP2.copy(_vec3).multiplyScalar(-dist * 0.3).add(targetPos);
    bezP2.addScaledVector(rockRight, -sign * dist * 0.15);
    bezP2.addScaledVector(rockUp, -dist * 0.08);
}

// ── ROCK_FLIGHT (Bezier to next rock) ─────────────────────────────
function updateRockFlight(dt) {
    const t = Math.min(phaseTime / rockFlightDuration, 1);
    const prevT = Math.max(0, (phaseTime - dt) / rockFlightDuration);

    for (let i = 0; i < FLIGHT_POINTS_PER_FRAME; i++) {
        const frac = i / FLIGHT_POINTS_PER_FRAME;
        const subT = prevT + (t - prevT) * frac;
        bezierPoint(subT, _vec3);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }

    bezierPoint(t, worldPos);

    if (t >= 1) {
        // Arrived at rock
        const rd = rockDataArray[rockIdx];
        rockPoints = rd.points;
        rockPointIdx = 0;

        // Camera orbits rock center
        cam.setMode(cam.Mode.ORBIT, controls);
        cam.setOrbitCenter(rd.center.x, rd.center.y, rd.center.z);
        controls.autoRotateSpeed = 0.3;

        enterPhase(Phase.ROCK_DRAW);
    }
}

// ── ROCK_DRAW (trace rock outline + label, camera aligns during) ──
function updateRockDraw(dt) {
    const rd = rockDataArray[rockIdx];

    // Compute face-on camera target on first frame
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        const dist = camera.position.distanceTo(rd.center);
        textFacePos.copy(rd.center).addScaledVector(constellationDir, -dist);
    }

    // Smoothly align camera to face rock DURING drawing
    const camSpeed = 2.5;
    const camFactor = 1 - Math.exp(-camSpeed * dt);
    camera.position.lerp(textFacePos, camFactor);

    // Fade grey preview as colored outline is drawn
    if (greyRockLines[rockIdx]) {
        if (rockPointIdx < rd.outlineCount) {
            const progress = rockPointIdx / rd.outlineCount;
            greyRockLines[rockIdx].material.opacity = 0.3 * (1 - progress);
        } else {
            scene.remove(greyRockLines[rockIdx]);
            greyRockLines[rockIdx].geometry.dispose();
            greyRockLines[rockIdx].material.dispose();
            greyRockLines[rockIdx] = null;
        }
    }

    // All rock+label points drawn → draw flag, then advance
    if (!rockPoints || rockPointIdx >= rockPoints.length) {
        // Draw red flag in a single frame (small point set)
        if (rd.flagPoints && !rd.flagDrawn) {
            // Freeze rock+label colors before drawing flag
            trail.colorFreezeIdx = trail.pointCount;

            // Transition from last rock/label point to flag base
            const lastPt = rockPoints[rockPoints.length - 1];
            const fp = rd.flagPoints[0];
            const transN = 6;
            for (let j = 1; j <= transN; j++) {
                const t = j / transN;
                pushPointWorld(trail,
                    rd.center.x + (((1 - t) * lastPt.x + t * fp.x) * rockRight.x + ((1 - t) * lastPt.y + t * fp.y) * rockUp.x + ((1 - t) * (lastPt.z || 0) + t * (fp.z || 0)) * rockFwd.x) * ROCK_SCALE,
                    rd.center.y + (((1 - t) * lastPt.x + t * fp.x) * rockRight.y + ((1 - t) * lastPt.y + t * fp.y) * rockUp.y + ((1 - t) * (lastPt.z || 0) + t * (fp.z || 0)) * rockFwd.y) * ROCK_SCALE,
                    rd.center.z + (((1 - t) * lastPt.x + t * fp.x) * rockRight.z + ((1 - t) * lastPt.y + t * fp.y) * rockUp.z + ((1 - t) * (lastPt.z || 0) + t * (fp.z || 0)) * rockFwd.z) * ROCK_SCALE
                );
            }

            // Push all flag points
            const flagStartIdx = trail.pointCount;
            for (const p of rd.flagPoints) {
                const pz = p.z || 0;
                pushPointWorld(trail,
                    rd.center.x + (p.x * rockRight.x + p.y * rockUp.x + pz * rockFwd.x) * ROCK_SCALE,
                    rd.center.y + (p.x * rockRight.y + p.y * rockUp.y + pz * rockFwd.y) * ROCK_SCALE,
                    rd.center.z + (p.x * rockRight.z + p.y * rockUp.z + pz * rockFwd.z) * ROCK_SCALE
                );
            }

            // Color all flag + transition points red
            const redStart = flagStartIdx - transN;
            for (let i = redStart; i < trail.pointCount; i++) {
                const i3 = i * 3;
                trail.colors[i3] = 1.0;
                trail.colors[i3 + 1] = 0.12;
                trail.colors[i3 + 2] = 0.08;
            }

            // Freeze everything including flag
            trail.colorFreezeIdx = trail.pointCount;
            rd.flagDrawn = true;
            return;
        }

        trail.colorFreezeIdx = trail.pointCount;
        rockIdx++;

        if (rockIdx < rockDataArray.length) {
            // Curved flight to next rock
            const prevRock = rockDataArray[rockIdx - 1];
            const lastFlag = prevRock.flagPoints[prevRock.flagPoints.length - 1];
            const lfz = lastFlag.z || 0;
            _startPos.set(
                prevRock.center.x + (lastFlag.x * rockRight.x + lastFlag.y * rockUp.x + lfz * rockFwd.x) * ROCK_SCALE,
                prevRock.center.y + (lastFlag.x * rockRight.y + lastFlag.y * rockUp.y + lfz * rockFwd.y) * ROCK_SCALE,
                prevRock.center.z + (lastFlag.x * rockRight.z + lastFlag.y * rockUp.z + lfz * rockFwd.z) * ROCK_SCALE
            );

            rockFlightDuration = MILESTONES[rockIdx].distance / ROCK_FLIGHT_SPEED;
            setupCurvedRockFlight(_startPos, rockDataArray[rockIdx].center, rockIdx);
            worldPos.copy(_startPos);

            cam.setMode(cam.Mode.FOLLOW, controls);
            enterPhase(Phase.ROCK_FLIGHT);
        } else {
            // All rocks done — fly to next attractor
            constellationDone = true;

            // Clean up remaining grey rocks
            for (const gl of greyRockLines) {
                if (gl) { scene.remove(gl); gl.geometry.dispose(); gl.material.dispose(); }
            }
            greyRockLines = [];

            // Advance to next attractor (Rössler)
            attractorIndex = (attractorIndex + 1) % ATTRACTORS.length;
            const nextAttr = ATTRACTORS[attractorIndex];
            attractorState = [...nextAttr.initialCondition];
            trail.attractorIdx = attractorIndex;
            trail.drawTime = 0;

            // Depart from last drawn flag point
            const lastRock = rockDataArray[rockDataArray.length - 1];
            const lp = lastRock.flagPoints[lastRock.flagPoints.length - 1];
            const lpz2 = lp.z || 0;
            _startPos.set(
                lastRock.center.x + (lp.x * rockRight.x + lp.y * rockUp.x + lpz2 * rockFwd.x) * ROCK_SCALE,
                lastRock.center.y + (lp.x * rockRight.y + lp.y * rockUp.y + lpz2 * rockFwd.y) * ROCK_SCALE,
                lastRock.center.z + (lp.x * rockRight.z + lp.y * rockUp.z + lpz2 * rockFwd.z) * ROCK_SCALE
            );

            attractorOffset.copy(_startPos).addScaledVector(constellationDir, FLIGHT_DISTANCE);
            setupFlightCurve(_startPos, constellationDir, attractorOffset);
            worldPos.copy(_startPos);

            flightCameraDelay = 0;
            cam.setMode(cam.Mode.FOLLOW, controls);
            enterPhase(Phase.FLIGHT);
        }
        return;
    }

    // Push rock + label points this frame
    const end = Math.min(rockPointIdx + ROCK_DRAW_PTS, rockPoints.length);
    for (let i = rockPointIdx; i < end; i++) {
        const p = rockPoints[i];
        const pz = p.z || 0;
        pushPointWorld(trail,
            rd.center.x + (p.x * rockRight.x + p.y * rockUp.x + pz * rockFwd.x) * ROCK_SCALE,
            rd.center.y + (p.x * rockRight.y + p.y * rockUp.y + pz * rockFwd.y) * ROCK_SCALE,
            rd.center.z + (p.x * rockRight.z + p.y * rockUp.z + pz * rockFwd.z) * ROCK_SCALE
        );
    }
    rockPointIdx = end;

    worldPos.copy(rd.center);
}
