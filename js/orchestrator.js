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
import * as intro from './intro3d.js';
import { generateTextLines, generateRockWithLabel } from './strokeFont.js';

// ── Phase enum ─────────────────────────────────────────────────────
export const Phase = {
    INTRO: 0,
    TRANSITION_OUT: 1,
    ROCKET_HINT: 6,
    ROCKET_EXIT: 7,
    ROCKET_STREAK: 12,
    VORTEX: 2,
    FLIGHT_TO_TEXT: 8,
    TEXT_DRAW: 9,
    FLIGHT: 3,
    ATTRACTOR_DRAW: 4,
    LAUNCH_FROM_ATTRACTOR: 5,
    ROCK_FLIGHT: 10,
    ROCK_DRAW: 11,
    FLIGHT_TO_LANDING: 13,
    LANDING_DRAW: 14,
    LANDING_LINGER: 15
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

// Rocket streak — the trail line the rocket transforms into.
// Quadratic Bezier: dashes straight toward P1, then bends to P2.
const streakStart = new THREE.Vector3();
const streakDir = new THREE.Vector3();
const streakP1 = new THREE.Vector3();     // randomly placed mid point
const streakP2 = new THREE.Vector3();     // randomly placed end point
const vortexCenter = new THREE.Vector3(); // where the streak stops and the spiral grows

// Scratch frame for random flight arcs
const _arcRight = new THREE.Vector3();
const _arcUp = new THREE.Vector3();

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
let drawAcc = 0;            // fractional point budget (dt-based drawing speed)
const textCenter = new THREE.Vector3();
const textRight = new THREE.Vector3();   // camera-aligned right axis
const textUp = new THREE.Vector3();      // camera-aligned up axis
const textDepartDir = new THREE.Vector3(); // saved departure direction
const textLastPoint = new THREE.Vector3();
let flightCameraDelay = 0;  // seconds to wait before camera follows flight
const textFacePos = new THREE.Vector3(); // reused for camera face-on target
let camAligned = false;     // once true, stop steering — user gets zoom/rotate
let userDragging = false;   // true while the user holds a rotate/zoom gesture

// Landing state (contact stop after the full attractor tour)
let landingDone = false;
let mailPlane = null;       // invisible hit-plane over the contact text

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
const TEXT_POINTS_PER_SEC = 10200;    // drawing speed (≈170 pts/frame at 60 fps)
const TEXT_SCALE = 0.22;              // world-space size of text (fits 3 lines in view)
const TEXT_LINGER_CAMERA = 1.0;       // camera stays on text this long after drawing
const TEXT_LINES = ['CREATIVE.', 'ADAPTIVE.', 'CURIOUS.'];

// Stroke intensity — letter strokes render bold (>1 feeds the bloom),
// pen-travel strokes (letter connectors, retraces) render faint
const STROKE_INTENSITY = 1.5;
const LINK_INTENSITY = 0.35;

// Constellation (milestone rocks after Lorenz)
const ROCK_SCALE = 0.4;              // world units per 2D unit
const ROCK_POINTS_PER_SEC = 6600;    // drawing speed (≈110 pts/frame at 60 fps)
const ROCK_FLIGHT_SPEED = 2.5;       // world units per second
// offRight/offUp scatter each rock perpendicular to the flight line
// (triangle layout, not a straight row)
const MILESTONES = [
    { label: 'GYMNASIUM', sublabel: 'RIGA', sizeFactor: 1.0,  seed: 42, distance: 8.0, offRight: -1.5, offUp:  0.8 },
    { label: 'BACHELOR IN', sublabel: 'FINANCIAL ENGINEERING', sizeFactor: 0.55, seed: 73, distance: 7.0, offRight:  1.8, offUp:  0.3 },
    { label: 'GIRAFFE360', sublabel: null,  sizeFactor: 0.35, seed: 17, distance: 5.0, offRight: -0.5, offUp: -1.2 },
];

// Landing (contact stop) — after every attractor has been visited once,
// the next launch flies to a traced contact card instead of looping.
// main.js raycasts the invisible mail plane and opens mailto: on click.
export const CONTACT_EMAIL = 'ilya.safronos@gmail.com';
const LANDING_LINES = ['GET IN TOUCH', CONTACT_EMAIL];
const LANDING_TAP_DELAY = 1.5;       // linger before the tap prompt returns

// Rocket hint (3D rocket — see intro3d.js)
const ROCKET_LAND_DURATION = intro.LAND_DURATION; // glide from idle loops to the bubble spot
const ROCKET_MORPH_DURATION = intro.CHARGE_DURATION; // charge-up + smear

// Rocket streak — the line shoots forward fast, decelerating
// exponentially into the point where the vortex spiral grows
const STREAK_SPEED = 16.0;      // initial speed, world units/s
const STREAK_LENGTH = 4.5;      // total distance covered as it slows
const STREAK_DURATION = 1.4;    // seconds until the spiral takes over
const STREAK_SUBSTEPS = 24;     // trail points per frame along the streak
const STREAK_FLASH = 0.8;       // extra HDR intensity while at full speed
const VORTEX_VIEW_DIST = 1.2;   // camera settle distance from the spiral

// DOM refs
let tapPromptEl = null;
let rocketHintEl = null;

// ── Init ───────────────────────────────────────────────────────────
export function init() {
    tapPromptEl = document.querySelector('.tap-prompt');
    rocketHintEl = document.getElementById('rocket-hint');
    trail = createTrailSystem();
    intro.init(scene, camera);
    cam.init(controls);
    // The moment the user grabs the view, stop any in-progress camera
    // auto-alignment so it doesn't fight the drag
    controls.addEventListener('start', () => {
        userDragging = true;
        if (!camAligned) {
            camAligned = true;
            if (phase === Phase.VORTEX) {
                controls.autoRotateSpeed = ATTRACTORS[0].camera.azimuthSpeed;
            }
        }
    });
    controls.addEventListener('end', () => { userDragging = false; });
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

// ── Camera fit distance ────────────────────────────────────────────
// Distance at which a drawn 2D point set (scaled to world units, centered
// on the orbit target) fits inside the camera view, with a small margin.
function computeFitDistance(points, scale) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    // Content may be off-center (e.g. rock labels hang below) — size around origin
    const w = 2 * Math.max(Math.abs(minX), Math.abs(maxX)) * scale;
    const h = 2 * Math.max(Math.abs(minY), Math.abs(maxY)) * scale;
    const tanV = Math.tan(camera.fov * Math.PI / 360);
    const fit = 1.25 * Math.max((h / 2) / tanV, (w / 2) / (tanV * camera.aspect));
    return THREE.MathUtils.clamp(fit, controls.minDistance, controls.maxDistance);
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

// Sub-stepped trail points along the active Bezier between prevT and t
function drawBezierSegment(prevT, t) {
    for (let i = 0; i < FLIGHT_POINTS_PER_FRAME; i++) {
        const subT = prevT + (t - prevT) * (i / FLIGHT_POINTS_PER_FRAME);
        bezierPoint(subT, _vec3);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }
}

// ── 2D plane → world space ─────────────────────────────────────────
// Map a flat stroke-font point onto a world-space plane spanned by a
// right/up basis around a center.
function planePointToWorld(out, center, right, up, scale, p) {
    return out.set(
        center.x + (p.x * right.x + p.y * up.x) * scale,
        center.y + (p.x * right.y + p.y * up.y) * scale,
        center.z + (p.x * right.z + p.y * up.z) * scale
    );
}

// Push the next dt-budgeted batch of 2D stroke points mapped onto a
// plane. Bold letter strokes bloom, pen-travel links render faint.
// Returns the new index into points.
function drawStrokePoints(points, idx, pointsPerSec, dt, center, right, up, scale) {
    drawAcc += pointsPerSec * dt;
    const budget = Math.floor(drawAcc);
    drawAcc -= budget;
    const end = Math.min(idx + budget, points.length);
    for (let i = idx; i < end; i++) {
        const p = points[i];
        trail.pointIntensity = p.c === 0 ? LINK_INTENSITY : STROKE_INTENSITY;
        planePointToWorld(_vec3, center, right, up, scale, p);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }
    return end;
}

// ── Face-on camera alignment ───────────────────────────────────────
// Aim the camera at a drawn point set: compute the face-on position
// (beginFaceAlign, once per phase) then ease toward it each frame
// (stepFaceAlign) until arrival — unless the user already took over.
function beginFaceAlign(center, dir, points, scale) {
    const dist = computeFitDistance(points, scale);
    textFacePos.copy(center).addScaledVector(dir, -dist);
    camAligned = userDragging; // user already in control → don't steer
}

// Returns true on the frame the camera arrives (settles)
function stepFaceAlign(dt, speed = 2.5) {
    if (camAligned) return false;
    camera.position.lerp(textFacePos, 1 - Math.exp(-speed * dt));
    if (camera.position.distanceToSquared(textFacePos) < 0.0025) {
        camAligned = true;
        return true;
    }
    return false;
}

// ── Attractor departure ────────────────────────────────────────────
// Direction the attractor point is heading + its tip in world space
function getAttractorDeparture(dirOut, posOut) {
    const attr = ATTRACTORS[attractorIndex];
    const s = attractorState;
    const derivs = attr.derivatives(s[0], s[1], s[2], attr.params);
    dirOut.set(
        derivs[0] * attr.scale,
        derivs[1] * attr.scale,
        derivs[2] * attr.scale
    ).normalize();
    posOut.set(
        (s[0] - attr.center[0]) * attr.scale + attractorOffset.x,
        (s[1] - attr.center[1]) * attr.scale + attractorOffset.y,
        (s[2] - attr.center[2]) * attr.scale + attractorOffset.z
    );
}

// ── Random helpers for flight-path variety ─────────────────────────
function rand(min, max) { return min + Math.random() * (max - min); }
function randSign() { return Math.random() < 0.5 ? -1 : 1; }

// ── Setup a flight curve from a start position + direction to a target ──
// Every transition swoops like the meteor flights: the control points
// get random perpendicular offsets so no two flights arc the same way.
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

    // Random sideways arc — perpendicular frame around the flight vector
    _arcRight.crossVectors(_vec3, camera.up);
    if (_arcRight.lengthSq() < 1e-6) _arcRight.set(1, 0, 0);
    _arcRight.normalize();
    _arcUp.crossVectors(_arcRight, _vec3).normalize();
    const sign = randSign();
    bezP1.addScaledVector(_arcRight, sign * dist * rand(0.15, 0.3));
    bezP1.addScaledVector(_arcUp, randSign() * dist * rand(0.05, 0.15));
    bezP2.addScaledVector(_arcRight, -sign * dist * rand(0.1, 0.2));
    bezP2.addScaledVector(_arcUp, randSign() * dist * rand(0.04, 0.1));
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
    intro.update(dt, totalTime);

    switch (phase) {
        case Phase.INTRO:           updateIntro(dt); break;
        case Phase.TRANSITION_OUT:  updateTransitionOut(dt); break;
        case Phase.ROCKET_HINT:     updateRocketHint(dt); break;
        case Phase.ROCKET_EXIT:     updateRocketExit(dt); break;
        case Phase.ROCKET_STREAK:   updateRocketStreak(dt); break;
        case Phase.VORTEX:          updateVortex(dt); break;
        case Phase.FLIGHT_TO_TEXT:  updateFlightToText(dt); break;
        case Phase.TEXT_DRAW:       updateTextDraw(dt); break;
        case Phase.FLIGHT:          updateFlight(dt); break;
        case Phase.ATTRACTOR_DRAW:  updateAttractorDraw(dt); break;
        case Phase.LAUNCH_FROM_ATTRACTOR: updateLaunchFromAttractor(dt); break;
        case Phase.ROCK_FLIGHT: updateRockFlight(dt); break;
        case Phase.ROCK_DRAW:   updateRockDraw(dt); break;
        case Phase.FLIGHT_TO_LANDING: updateFlightToLanding(dt); break;
        case Phase.LANDING_DRAW:      updateLandingDraw(dt); break;
        case Phase.LANDING_LINGER:    updateLandingLinger(dt); break;
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
        // 3D text fades and shrinks away; LinkedIn icon glides to corner
        intro.startExit();
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
        // Center rocket + bubble on screen; the hint element anchors
        // the bubble, the 3D rocket lands just to its left
        const rocketW = 60; // ~3D rocket on screen, px
        const totalW = rocketW + 16 + bubbleW;
        const landLeft = (window.innerWidth - totalW) / 2;
        rocketHintEl.style.setProperty('--land-left', (landLeft + rocketW + 16) + 'px');
        intro.setRocketLanding(landLeft + rocketW / 2, window.innerHeight / 2);
    }

    // Once the rocket has landed, show the bubble
    if (phaseTime >= ROCKET_LAND_DURATION && !rocketHintEl.classList.contains('arrived')) {
        rocketHintEl.classList.add('arrived');
        showTapPrompt();
    }

    // Wait for tap after bubble is visible
    const canAdvance = phaseTime >= ROCKET_LAND_DURATION + 0.5;
    if (tapPending && canAdvance) {
        tapPending = false;
        hideTapPrompt();
        enterPhase(Phase.ROCKET_EXIT);
    }
}

// ── ROCKET_EXIT (3D rocket charges up, smears into a line) ────────
function updateRocketExit(dt) {
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        rocketHintEl.classList.remove('arrived'); // bubble away
        intro.setRocketCharging();
    }

    if (phaseTime >= ROCKET_MORPH_DURATION) {
        // The rocket has smeared into a line — hand off to the trail,
        // starting exactly at the stretched rocket's tip
        intro.getRocketTipWorld(streakStart);
        intro.hideRocket();

        // Shoot forward into the scene drifting right — on screen this
        // continues the rocket's straight horizontal dash
        camera.getWorldDirection(streakDir);
        _vec3.crossVectors(streakDir, camera.up).normalize();
        streakDir.addScaledVector(_vec3, 0.55).normalize();

        // Two randomly placed points shape the streak's path (quadratic
        // Bezier): P1 sits straight ahead so the launch dash stays true,
        // P2 pulls the tail into a random curve where the spiral grows
        streakP1.copy(streakStart)
            .addScaledVector(streakDir, STREAK_LENGTH * rand(0.45, 0.6));
        streakP2.copy(streakStart).addScaledVector(streakDir, STREAK_LENGTH);
        streakP2.addScaledVector(_vec3, randSign() * STREAK_LENGTH * rand(0.15, 0.35));
        streakP2.addScaledVector(camera.up, randSign() * STREAK_LENGTH * rand(0.1, 0.25));

        trail.attractorIdx = 0;
        trail.fade = 1;
        clearTrail(trail);
        addTrailToScene(trail);
        pushPointWorld(trail, streakStart.x, streakStart.y, streakStart.z);

        cam.setMode(cam.Mode.FOLLOW, controls);
        enterPhase(Phase.ROCKET_STREAK);
    }
}

// ── ROCKET_STREAK (line shoots forward fast, then slows down) ─────

// Quadratic Bezier through streakStart → P1 → P2
function streakPos(u, out) {
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    out.set(
        a * streakStart.x + b * streakP1.x + c * streakP2.x,
        a * streakStart.y + b * streakP1.y + c * streakP2.y,
        a * streakStart.z + b * streakP1.z + c * streakP2.z
    );
    return out;
}

function updateRocketStreak(dt) {
    // Exponential deceleration: v(t) = V0·e^(−kt) maps onto the curve
    // parameter, so the line dashes fast and eases into the bend
    const k = STREAK_SPEED / STREAK_LENGTH;
    const t = Math.min(phaseTime, STREAK_DURATION);
    const prevT = Math.max(0, t - dt);

    for (let i = 1; i <= STREAK_SUBSTEPS; i++) {
        const st = prevT + (t - prevT) * (i / STREAK_SUBSTEPS);
        const decay = Math.exp(-k * st);
        // Brilliant while at full speed, settling to normal as it slows
        trail.pointIntensity = 1 + STREAK_FLASH * decay;
        streakPos(1 - decay, _vec3);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }

    streakPos(1 - Math.exp(-k * t), worldPos);

    if (phaseTime >= STREAK_DURATION) {
        trail.pointIntensity = 1.0;
        // Arrival tangent of the curve — the spiral faces back along it
        streakDir.copy(streakP2).sub(streakP1).normalize();
        vortexCenter.copy(worldPos);
        attractorOffset.copy(vortexCenter);

        cam.setMode(cam.Mode.ORBIT, controls);
        cam.setOrbitCenter(vortexCenter.x, vortexCenter.y, vortexCenter.z);
        controls.autoRotateSpeed = 0; // restored once the camera settles
        enterPhase(Phase.VORTEX);
    }
}

// ── VORTEX ─────────────────────────────────────────────────────────
function updateVortex(dt) {
    // Build spiral basis ONCE on first frame — the spiral plane faces
    // back along the streak, where the camera is gliding in from
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        vortexFwd.copy(streakDir);
        vortexRight.crossVectors(vortexFwd, camera.up).normalize();
        vortexUp.crossVectors(vortexRight, vortexFwd).normalize();

        textFacePos.copy(vortexCenter).addScaledVector(streakDir, -VORTEX_VIEW_DIST);
        camAligned = userDragging; // user already in control → don't steer
    }

    // Camera chases the streak's end point, then hands control back
    if (stepFaceAlign(dt, 2.0)) {
        controls.autoRotateSpeed = ATTRACTORS[0].camera.azimuthSpeed;
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
            vortexCenter.x + r * (cosT * rx + sinT * vortexUp.x),
            vortexCenter.y + r * (cosT * ry + sinT * vortexUp.y),
            vortexCenter.z + r * (cosT * rz + sinT * vortexUp.z)
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
        drawAcc = 0;

        trail.attractorIdx = attractorIndex; // use Lorenz palette for text
        trail.drawTime = 0;

        cam.setMode(cam.Mode.FOLLOW, controls);
        enterPhase(Phase.FLIGHT_TO_TEXT);
    }
}

// ── FLIGHT_TO_TEXT (Bezier to text center, no attractor blend) ─────
// Shared by the trait text (after vortex) and the contact landing.
function flightToTextPlane(dt, nextPhase) {
    const t = Math.min(phaseTime / TEXT_FLIGHT_DURATION, 1);
    const prevT = Math.max(0, (phaseTime - dt) / TEXT_FLIGHT_DURATION);

    drawBezierSegment(prevT, t);
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

        enterPhase(nextPhase);
    }
}

function updateFlightToText(dt) { flightToTextPlane(dt, Phase.TEXT_DRAW); }

// ── TEXT_DRAW (trace "CREATIVE" with camera aligning during draw) ──
function updateTextDraw(dt) {
    // Smoothly align camera to face text DURING drawing, then hand
    // control back so the user can zoom/rotate freely
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        beginFaceAlign(textCenter, textDepartDir, textPoints, TEXT_SCALE);
    }
    stepFaceAlign(dt);

    // All points drawn → launch to attractor
    if (textPointIdx >= textPoints.length) {
        trail.colorFreezeIdx = trail.pointCount;
        trail.pointIntensity = 1.0;

        if (textPoints.length > 0) {
            const lp = textPoints[textPoints.length - 1];
            planePointToWorld(textLastPoint, textCenter, textRight, textUp, TEXT_SCALE, lp);
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

    // Push the next batch of text points (dt-based, frame-rate independent)
    textPointIdx = drawStrokePoints(textPoints, textPointIdx, TEXT_POINTS_PER_SEC, dt,
        textCenter, textRight, textUp, TEXT_SCALE);

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

    // Push points along the Bezier curve; camera follows the tip
    drawBezierSegment(prevT, t);
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
        if (ATTRACTORS[attractorIndex].milestones && !constellationDone) {
            setupConstellation();
            enterPhase(Phase.ROCK_FLIGHT);
        } else if (attractorIndex === ATTRACTORS.length - 1 && !landingDone) {
            // Full tour complete — fly to the contact landing instead of looping
            setupLanding();
            enterPhase(Phase.FLIGHT_TO_LANDING);
        } else {
            enterPhase(Phase.LAUNCH_FROM_ATTRACTOR);
        }
    }
}

// ── LAUNCH_FROM_ATTRACTOR ──────────────────────────────────────────
function updateLaunchFromAttractor(dt) {
    getAttractorDeparture(_dir, _startPos);

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
    getAttractorDeparture(constellationDir, _startPos);

    // Freeze trail colors
    trail.colorFreezeIdx = trail.pointCount;

    // Orient rock plane perpendicular to flight direction
    rockRight.crossVectors(constellationDir, camera.up).normalize();
    rockUp.crossVectors(rockRight, constellationDir).normalize();

    // Pre-generate all rock data — each milestone's right/up offsets
    // scatter the rocks around the flight line (triangle layout)
    rockDataArray = [];
    let cumDist = 0;
    for (const ms of MILESTONES) {
        cumDist += ms.distance;
        const center = _startPos.clone()
            .addScaledVector(constellationDir, cumDist)
            .addScaledVector(rockRight, ms.offRight)
            .addScaledVector(rockUp, ms.offUp);
        const { points, outlineCount } = generateRockWithLabel(
            ms.sizeFactor, ms.seed, ms.label, ms.sublabel
        );
        rockDataArray.push({ center, points, outlineCount });
    }

    // Create grey preview outlines for all rocks
    greyRockLines = [];
    for (const rd of rockDataArray) {
        const n = rd.outlineCount;
        const positions = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            planePointToWorld(_vec3, rd.center, rockRight, rockUp, ROCK_SCALE, rd.points[i]);
            positions[i * 3]     = _vec3.x;
            positions[i * 3 + 1] = _vec3.y;
            positions[i * 3 + 2] = _vec3.z;
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

    drawBezierSegment(prevT, t);
    bezierPoint(t, worldPos);

    if (t >= 1) {
        // Arrived at rock
        const rd = rockDataArray[rockIdx];
        rockPoints = rd.points;
        rockPointIdx = 0;
        drawAcc = 0;

        // Camera orbits rock center
        cam.setMode(cam.Mode.ORBIT, controls);
        cam.setOrbitCenter(rd.center.x, rd.center.y, rd.center.z);
        controls.autoRotateSpeed = 0.3;

        enterPhase(Phase.ROCK_DRAW);
    }
}

// Remove + dispose one grey preview line
function removeGreyRock(i) {
    const gl = greyRockLines[i];
    if (!gl) return;
    scene.remove(gl);
    gl.geometry.dispose();
    gl.material.dispose();
    greyRockLines[i] = null;
}

// ── ROCK_DRAW (trace rock outline + label, camera aligns during) ──
function updateRockDraw(dt) {
    const rd = rockDataArray[rockIdx];

    // Smoothly align camera to face rock DURING drawing, then hand
    // control back so the user can zoom/rotate freely
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        beginFaceAlign(rd.center, constellationDir, rd.points, ROCK_SCALE);
    }
    stepFaceAlign(dt);

    // Fade grey preview as colored outline is drawn
    if (greyRockLines[rockIdx]) {
        if (rockPointIdx < rd.outlineCount) {
            const progress = rockPointIdx / rd.outlineCount;
            greyRockLines[rockIdx].material.opacity = 0.3 * (1 - progress);
        } else {
            removeGreyRock(rockIdx);
        }
    }

    // All points drawn → advance
    if (rockPointIdx >= rockPoints.length) {
        trail.colorFreezeIdx = trail.pointCount;
        trail.pointIntensity = 1.0;

        // Depart from the last drawn point of this rock
        planePointToWorld(_startPos, rd.center, rockRight, rockUp, ROCK_SCALE,
            rockPoints[rockPoints.length - 1]);
        rockIdx++;

        if (rockIdx < rockDataArray.length) {
            // Curved flight to next rock
            rockFlightDuration = MILESTONES[rockIdx].distance / ROCK_FLIGHT_SPEED;
            setupCurvedRockFlight(_startPos, rockDataArray[rockIdx].center, rockIdx);
            worldPos.copy(_startPos);

            cam.setMode(cam.Mode.FOLLOW, controls);
            enterPhase(Phase.ROCK_FLIGHT);
        } else {
            // All rocks done — fly to next attractor
            constellationDone = true;

            // Clean up remaining grey rocks
            for (let i = 0; i < greyRockLines.length; i++) removeGreyRock(i);
            greyRockLines = [];

            // Advance to next attractor (Rössler)
            attractorIndex = (attractorIndex + 1) % ATTRACTORS.length;
            const nextAttr = ATTRACTORS[attractorIndex];
            attractorState = [...nextAttr.initialCondition];
            trail.attractorIdx = attractorIndex;
            trail.drawTime = 0;

            attractorOffset.copy(_startPos).addScaledVector(constellationDir, FLIGHT_DISTANCE);
            setupFlightCurve(_startPos, constellationDir, attractorOffset);
            worldPos.copy(_startPos);

            flightCameraDelay = 0;
            cam.setMode(cam.Mode.FOLLOW, controls);
            enterPhase(Phase.FLIGHT);
        }
        return;
    }

    // Push rock + label points this frame (dt-based, frame-rate independent)
    rockPointIdx = drawStrokePoints(rockPoints, rockPointIdx, ROCK_POINTS_PER_SEC, dt,
        rd.center, rockRight, rockUp, ROCK_SCALE);

    worldPos.copy(rd.center);
}

// ── LANDING: setup (contact stop after the last attractor) ────────
function setupLanding() {
    getAttractorDeparture(_dir, _startPos);
    textDepartDir.copy(_dir);

    // Contact card center: halfway along a normal flight hop
    textCenter.copy(_startPos).addScaledVector(_dir, FLIGHT_DISTANCE * 0.5);
    setupFlightCurve(_startPos, _dir, textCenter);

    const { points } = generateTextLines(LANDING_LINES);
    textPoints = points;
    textPointIdx = 0;
    drawAcc = 0;

    // Freeze attractor colors; the contact text comes home to the
    // Lorenz palette the journey started with
    trail.colorFreezeIdx = trail.pointCount;
    trail.attractorIdx = 0;
    trail.drawTime = 0;

    worldPos.copy(_startPos);
    cam.setMode(cam.Mode.FOLLOW, controls);
}

// ── FLIGHT_TO_LANDING (same swoop as the trait text) ──────────────
function updateFlightToLanding(dt) { flightToTextPlane(dt, Phase.LANDING_DRAW); }

// ── LANDING_DRAW (trace "GET IN TOUCH" + email) ────────────────────
function updateLandingDraw(dt) {
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        beginFaceAlign(textCenter, textDepartDir, textPoints, TEXT_SCALE);
    }
    stepFaceAlign(dt);

    // All points drawn → place the clickable mail plane and linger
    if (textPointIdx >= textPoints.length) {
        trail.colorFreezeIdx = trail.pointCount;
        trail.pointIntensity = 1.0;

        const lp = textPoints[textPoints.length - 1];
        planePointToWorld(textLastPoint, textCenter, textRight, textUp, TEXT_SCALE, lp);

        createMailPlane();
        enterPhase(Phase.LANDING_LINGER);
        return;
    }

    textPointIdx = drawStrokePoints(textPoints, textPointIdx, TEXT_POINTS_PER_SEC, dt,
        textCenter, textRight, textUp, TEXT_SCALE);

    worldPos.copy(textCenter);
}

// ── LANDING_LINGER (wait for tap, then resume the attractor loop) ──
function updateLandingLinger(dt) {
    worldPos.copy(textCenter);

    if (phaseTime >= LANDING_TAP_DELAY) showTapPrompt();

    if (tapPending && phaseTime >= LANDING_TAP_DELAY) {
        tapPending = false;
        hideTapPrompt();
        landingDone = true;
        removeMailPlane();

        // Resume the loop from the top (Lorenz)
        attractorIndex = 0;
        const attr = ATTRACTORS[attractorIndex];
        attractorState = [...attr.initialCondition];
        trail.attractorIdx = attractorIndex;
        trail.drawTime = 0;

        attractorOffset.copy(textCenter).addScaledVector(textDepartDir, FLIGHT_DISTANCE);
        setupFlightCurve(textLastPoint, textDepartDir, attractorOffset);
        worldPos.copy(textLastPoint);

        flightCameraDelay = 0;
        cam.setMode(cam.Mode.FOLLOW, controls);
        enterPhase(Phase.FLIGHT);
    }
}

// ── Landing mail hit-plane ─────────────────────────────────────────
// Invisible plane covering the traced contact text; main.js raycasts
// it for cursor feedback and opens mailto:CONTACT_EMAIL on click.
function createMailPlane() {
    // Cover only the email line (bold strokes in the lower half of the
    // block) — taps on "GET IN TOUCH" or empty space still advance
    let blockMinY = Infinity, blockMaxY = -Infinity;
    for (const p of textPoints) {
        if (p.y < blockMinY) blockMinY = p.y;
        if (p.y > blockMaxY) blockMaxY = p.y;
    }
    const midY = (blockMinY + blockMaxY) / 2;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of textPoints) {
        if (p.c !== 1 || p.y >= midY) continue;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    const geo = new THREE.PlaneGeometry(
        (maxX - minX) * TEXT_SCALE * 1.1,
        (maxY - minY) * TEXT_SCALE * 1.3
    );
    const mat = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    });
    mailPlane = new THREE.Mesh(geo, mat);
    planePointToWorld(mailPlane.position, textCenter, textRight, textUp, TEXT_SCALE,
        { x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    // Face back along the approach direction (where the camera settles)
    _vec3.copy(textDepartDir).negate();
    mailPlane.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(textRight, textUp, _vec3)
    );
    scene.add(mailPlane);
}

function removeMailPlane() {
    if (!mailPlane) return;
    scene.remove(mailPlane);
    mailPlane.geometry.dispose();
    mailPlane.material.dispose();
    mailPlane = null;
}

// Clickable only while the contact landing is on screen
export function getMailPlane() { return mailPlane; }
