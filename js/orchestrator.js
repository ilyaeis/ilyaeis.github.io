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
import { generateTextLines } from './strokeFont.js';

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
    LAUNCH_FROM_ATTRACTOR: 5
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
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
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
const TEXT_POINTS_PER_FRAME = 35;     // drawing speed (3 reps ≈ 10k points → ~5s draw)
const TEXT_SCALE = 0.22;              // world-space size of text (fits 3 lines in view)
const TEXT_LINGER_CAMERA = 1.0;       // camera stays on text this long after drawing
const TEXT_LINES = ['CREATIVE.', 'ADAPTIVE.', 'CURIOUS.'];

// Rocket hint
const ROCKET_FLY_DURATION = 3.0;   // matches CSS animation duration
const ROCKET_EXIT_DURATION = 2.5;  // smooth loop + fly away

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
        // Rocket icon is ~2rem wide, bubble starts at left:3rem from rocket
        const rocketW = 32; // ~2rem
        const needed = rocketW + 48 + bubbleW + 16; // icon + 3rem gap + bubble + padding
        const halfScreen = window.innerWidth / 2;
        const fromRight = Math.max(needed, halfScreen);
        const landLeft = window.innerWidth - fromRight;
        rocketHintEl.style.setProperty('--land-left', landLeft + 'px');
        rocketHintEl.classList.add('flying');
    }

    // After flight animation completes, show the bubble
    if (phaseTime >= ROCKET_FLY_DURATION && !rocketHintEl.classList.contains('arrived')) {
        rocketHintEl.classList.add('arrived');
        showTapPrompt();
    }

    // Wait for tap after bubble is visible
    const canAdvance = phaseTime >= ROCKET_FLY_DURATION + 0.5;
    if (tapPending && canAdvance) {
        tapPending = false;
        hideTapPrompt();
        enterPhase(Phase.ROCKET_EXIT);
    }
}

// ── ROCKET_EXIT ───────────────────────────────────────────────────
function updateRocketExit(dt) {
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        rocketHintEl.classList.remove('arrived', 'flying');
        void rocketHintEl.offsetWidth;
        rocketHintEl.classList.add('exiting');
    }

    if (phaseTime >= ROCKET_EXIT_DURATION) {
        rocketHintEl.classList.remove('exiting');
        rocketHintEl.style.visibility = 'hidden';
        rocketHintEl.style.opacity = '';

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

// ── TEXT_DRAW (trace "CREATIVE" then launch to attractor) ─────────
function updateTextDraw(dt) {
    // All points drawn → set up flight to attractor
    if (!textPoints || textPointIdx >= textPoints.length) {
        // Freeze current trail colors before switching to attractor flight
        trail.colorFreezeIdx = trail.pointCount;

        // Remember last text point in world space
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

        // Place Lorenz attractor further along the original departure direction
        attractorOffset.copy(textCenter).addScaledVector(textDepartDir, FLIGHT_DISTANCE);

        const attr = ATTRACTORS[attractorIndex];
        attractorState = [...attr.initialCondition];
        trail.attractorIdx = attractorIndex;
        trail.drawTime = 0;

        // Bezier from last text point to attractor center
        setupFlightCurve(textLastPoint, textDepartDir, attractorOffset);
        worldPos.copy(textLastPoint);

        // Camera stays on text for TEXT_LINGER_CAMERA seconds, then follows
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

    // Camera stays centered on text
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
        enterPhase(Phase.LAUNCH_FROM_ATTRACTOR);
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
