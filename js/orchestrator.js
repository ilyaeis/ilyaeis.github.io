// ── Orchestrator ───────────────────────────────────────────────────
// Tap-driven state machine over a pre-built static world (world.js).
// The trail is a short fading comet: it travels Bezier arcs between
// stops, rides attractor curves and loops around planar stops while
// the user views. Scenes light up (reveal sweep) as the comet arrives.

import * as THREE from 'three';
import {
    ATTRACTORS, controls, camera, scene,
    createTrailSystem, addTrailToScene, clearTrail,
    pushPointWorld, updateTrailAttributes, updateTrailGlow,
    rk4Step, addJourneyTime, render, isPaused, isMobile
} from './attractors.js';
import * as cam from './camera.js';
import * as intro from './intro3d.js';
import {
    buildWorld, updateWorld, lightStop, stops, StopType,
    getMailPlane as mailPlaneFromWorld, CONTACT_EMAIL
} from './world.js';

export { CONTACT_EMAIL };

// ── Phase enum ─────────────────────────────────────────────────────
export const Phase = {
    INTRO: 0,
    TRANSITION_OUT: 1,
    ROCKET_HINT: 2,
    ROCKET_EXIT: 3,
    TRAVEL: 4,
    VIEW: 5
};

// ── State ──────────────────────────────────────────────────────────
let phase = Phase.INTRO;
let phaseTime = 0;
let phaseFirstFrame = true;
let tapPending = false;
let totalTime = 0;

let trail = null;          // the comet
let stopIndex = -1;        // VIEW: current stop · TRAVEL: destination

const worldPos = new THREE.Vector3();   // what the FOLLOW camera tracks
const cometDir = new THREE.Vector3(1, 0, 0); // comet heading (departures)

const _vec3 = new THREE.Vector3();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _startPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();

// Travel Bezier
const bezP0 = new THREE.Vector3();
const bezP1 = new THREE.Vector3();
const bezP2 = new THREE.Vector3();
const bezP3 = new THREE.Vector3();
let travelDuration = 0;
let corkscrew = false;     // first flight spirals around its curve

// Scratch frames (flight arcs, corkscrew basis)
const _arcRight = new THREE.Vector3();
const _arcUp = new THREE.Vector3();
const _tan = new THREE.Vector3();

// View state
const textFacePos = new THREE.Vector3(); // face-on camera target
let camAligned = false;    // once true, stop steering — user gets control
let userDragging = false;  // true while the user holds a rotate/zoom gesture
let rideS = [0, 0, 0];     // attractor ride integration state
let drawAcc = 0;           // fractional point budget (dt-based)
let loopT = 0;             // planar-stop loop parameter

// ── Tuning ─────────────────────────────────────────────────────────
const COMET_CAPACITY = isMobile ? 600 : 1200;

// Travel
const TRAVEL_SPEED = 2.5;            // world units per second
const TRAVEL_MIN = 2.0;              // seconds
const TRAVEL_MAX = 5.0;
const TRAVEL_POINTS_PER_FRAME = 30;  // comet substeps along the Bezier
const REVEAL_AT = 0.65;              // travel fraction that lights the stop
const LAUNCH_FLASH = 0.8;            // extra HDR intensity leaving the intro

// Corkscrew (replaces the old vortex stop) — the first flight spirals
// around its own curve, ramping in and out
const CORK_REVS = 3;                 // full revolutions over the flight
const CORK_RADIUS = 1.1;             // peak spiral radius (mid-flight)

// Viewing
const RIDE_POINTS_PER_SEC = 12000;   // comet speed along attractor curves
const RIDE_MAX_PER_FRAME = 500;
const LOOP_SUBSTEPS = 8;             // comet substeps on planar-stop loops
const VIEW_TAP_DELAY = {
    [StopType.TEXT]: 2.0,
    [StopType.ATTRACTOR]: 3.0,
    [StopType.ROCK]: 1.5,
    [StopType.LANDING]: 1.5
};

// Rocket hint (3D rocket — see intro3d.js)
const ROCKET_LAND_DURATION = intro.LAND_DURATION;
const ROCKET_MORPH_DURATION = intro.CHARGE_DURATION;

// DOM refs
let tapPromptEl = null;
let rocketHintEl = null;

// ── Init ───────────────────────────────────────────────────────────
export function init() {
    tapPromptEl = document.querySelector('.tap-prompt');
    rocketHintEl = document.getElementById('rocket-hint');
    trail = createTrailSystem(COMET_CAPACITY);
    buildWorld(scene); // the dim world exists from frame one
    intro.init(scene, camera);
    cam.init(controls);
    // The moment the user grabs the view, stop any in-progress camera
    // auto-alignment so it doesn't fight the drag
    controls.addEventListener('start', () => {
        userDragging = true;
        camAligned = true;
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
    tapPending = false; // taps don't queue across phases — each stop wants its own
}

// ── Camera fit distance ────────────────────────────────────────────
// Distance at which a 2D point set (scaled to world units, centered on
// the orbit target) fits inside the camera view, with a small margin.
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

function bezierTangent(t, out) {
    bezierPoint(Math.min(t + 0.005, 1), _vA);
    bezierPoint(Math.max(t - 0.005, 0), _vB);
    return out.subVectors(_vA, _vB).normalize();
}

// ── Random helpers for flight-path variety ─────────────────────────
function rand(min, max) { return min + Math.random() * (max - min); }
function randSign() { return Math.random() < 0.5 ? -1 : 1; }

// ── Setup a flight curve from a start position + direction to a target ──
// Every transition swoops: the control points get random perpendicular
// offsets so no two flights arc the same way.
function setupFlightCurve(startPos, startDir, targetPos) {
    bezP0.copy(startPos);
    bezP3.copy(targetPos);

    // Control point 1: extend from start in the departure direction
    const dist = startPos.distanceTo(targetPos);
    bezP1.copy(startDir).normalize().multiplyScalar(dist * 0.4).add(startPos);

    // Control point 2: approach target gently from the flight direction
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

// ── Face-on camera alignment ───────────────────────────────────────
// Aim the camera at a planar stop: compute the face-on position once,
// then ease toward it each frame until arrival — unless the user
// already took over.
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

// ── Attractor-space → world (comet riding a static curve) ─────────
function rideTipWorld(stop, s, out) {
    const attr = ATTRACTORS[stop.attractorIdx];
    return out.set(
        (s[0] - attr.center[0]) * attr.scale + stop.center.x,
        (s[1] - attr.center[1]) * attr.scale + stop.center.y,
        (s[2] - attr.center[2]) * attr.scale + stop.center.z
    );
}

// ── Travel setup ───────────────────────────────────────────────────
function setupTravel(destIdx, withCorkscrew) {
    const dest = stops[destIdx];

    // Attractor stops: aim at the curve tip so the comet lands ON the
    // curve and keeps riding; planar stops: fly through the center.
    if (dest.type === StopType.ATTRACTOR) {
        rideTipWorld(dest, dest.rideState, _targetPos);
    } else {
        _targetPos.copy(dest.center);
    }

    setupFlightCurve(worldPos, cometDir, _targetPos);
    const dist = worldPos.distanceTo(_targetPos);
    travelDuration = THREE.MathUtils.clamp(dist / TRAVEL_SPEED, TRAVEL_MIN, TRAVEL_MAX);
    corkscrew = withCorkscrew;

    // Comet glows in the destination's palette (planar stops are Lorenz)
    trail.attractorIdx = dest.attractorIdx ?? 0;

    stopIndex = destIdx;
    cam.setMode(cam.Mode.FOLLOW, controls);
    enterPhase(Phase.TRAVEL);
}

// Spiral offset around the curve tangent — radius ramps in and out so
// the corkscrew starts and ends exactly on the curve
function applyCorkscrew(t, point) {
    bezierTangent(t, _tan);
    _arcRight.crossVectors(_tan, camera.up);
    if (_arcRight.lengthSq() < 1e-6) _arcRight.set(1, 0, 0);
    _arcRight.normalize();
    _arcUp.crossVectors(_arcRight, _tan).normalize();
    const env = CORK_RADIUS * Math.sin(Math.PI * t);
    const ang = CORK_REVS * 2 * Math.PI * t;
    point.addScaledVector(_arcRight, env * Math.cos(ang));
    point.addScaledVector(_arcUp, env * Math.sin(ang));
}

// ── Update ─────────────────────────────────────────────────────────
export function update(dt) {
    if (isPaused()) return;
    totalTime += dt;
    addJourneyTime(dt);
    intro.update(dt, totalTime);

    switch (phase) {
        case Phase.INTRO:          updateIntro(dt); break;
        case Phase.TRANSITION_OUT: updateTransitionOut(dt); break;
        case Phase.ROCKET_HINT:    updateRocketHint(dt); break;
        case Phase.ROCKET_EXIT:    updateRocketExit(dt); break;
        case Phase.TRAVEL:         updateTravel(dt); break;
        case Phase.VIEW:           updateView(dt); break;
    }

    phaseTime += dt;

    updateWorld(dt); // reveal sweeps

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

// ── ROCKET_EXIT (3D rocket charges up, smears into the comet) ─────
function updateRocketExit(dt) {
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        rocketHintEl.classList.remove('arrived'); // bubble away
        intro.setRocketCharging();
    }

    if (phaseTime >= ROCKET_MORPH_DURATION) {
        // The rocket has smeared into a line — hand off to the comet,
        // starting exactly at the stretched rocket's tip
        intro.getRocketTipWorld(_startPos);
        intro.hideRocket();

        // Launch forward into the scene drifting right — on screen this
        // continues the rocket's straight horizontal dash
        camera.getWorldDirection(cometDir);
        _vec3.crossVectors(cometDir, camera.up).normalize();
        cometDir.addScaledVector(_vec3, 0.55).normalize();

        trail.fade = 1;
        clearTrail(trail);
        addTrailToScene(trail);
        pushPointWorld(trail, _startPos.x, _startPos.y, _startPos.z);
        worldPos.copy(_startPos);

        // First flight: corkscrew out to the trait text
        setupTravel(0, true);
    }
}

// ── TRAVEL (Bezier arc to the next stop) ───────────────────────────
function updateTravel(dt) {
    const t = Math.min(phaseTime / travelDuration, 1);
    const prevT = Math.max(0, (phaseTime - dt) / travelDuration);

    for (let i = 1; i <= TRAVEL_POINTS_PER_FRAME; i++) {
        const subT = prevT + (t - prevT) * (i / TRAVEL_POINTS_PER_FRAME);
        bezierPoint(subT, _vec3);
        if (corkscrew) {
            applyCorkscrew(subT, _vec3);
            // Brilliant launch flash, settling as the spiral unwinds
            trail.pointIntensity = 1 + LAUNCH_FLASH * Math.max(0, 1 - subT * 3);
        }
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }
    trail.pointIntensity = 1.0;

    // Camera follows the smooth base curve, not the spiral
    bezierPoint(t, worldPos);
    bezierTangent(t, cometDir);

    // Light the destination so the sweep finishes as the comet arrives
    if (t >= REVEAL_AT) lightStop(stops[stopIndex]);

    if (t >= 1) enterView();
}

// ── VIEW (camera orbits the stop; comet rides or loops) ────────────
function enterView() {
    const stop = stops[stopIndex];

    cam.setMode(cam.Mode.ORBIT, controls);
    cam.setOrbitCenter(stop.center.x, stop.center.y, stop.center.z);

    if (stop.type === StopType.ATTRACTOR) {
        controls.autoRotateSpeed = ATTRACTORS[stop.attractorIdx].camera.azimuthSpeed;
        rideS = [...stop.rideState];
        drawAcc = 0;
    } else {
        controls.autoRotateSpeed = 0;
        beginFaceAlign(stop.center, stop.normal, stop.points2d, stop.scale);
        loopT = 0;
    }

    enterPhase(Phase.VIEW);
}

// Comet rides the attractor: live RK4 along the same dynamics that
// produced the static curve, so the bright head retraces its shape
function rideAttractor(stop, dt) {
    const attr = ATTRACTORS[stop.attractorIdx];
    drawAcc += RIDE_POINTS_PER_SEC * dt;
    let budget = Math.min(Math.floor(drawAcc), RIDE_MAX_PER_FRAME);
    drawAcc -= budget;

    for (let i = 0; i < budget; i++) {
        rideS = rk4Step(attr.derivatives, rideS[0], rideS[1], rideS[2], attr.dt, attr.params);
        for (let j = 0; j < 3; j++) {
            if (Math.abs(rideS[j]) > 150) rideS[j] *= 150 / Math.abs(rideS[j]);
            if (!isFinite(rideS[j])) { rideS = [...attr.initialCondition]; break; }
        }
        rideTipWorld(stop, rideS, _vec3);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }

    // Heading = attractor flow direction (used when departing)
    const d = attr.derivatives(rideS[0], rideS[1], rideS[2], attr.params);
    cometDir.set(d[0], d[1], d[2]).normalize();
}

// Lazy Lissajous loop around a planar stop, sized to its bounds.
// All sin terms are zero at u=0 so the comet departs the stop center
// smoothly right after flying through it.
function loopPos(stop, u, out) {
    const w = Math.max(stop.halfW * 1.25, 0.4);
    const h = Math.max(stop.halfH * 1.6, 0.3);
    out.copy(stop.center)
        .addScaledVector(stop.right, w * Math.sin(0.7 * u))
        .addScaledVector(stop.up, h * Math.sin(1.3 * u))
        .addScaledVector(stop.normal, 0.35 * Math.sin(0.9 * u));
    return out;
}

function loopPlanar(stop, dt) {
    const prevU = loopT;
    loopT += dt;
    for (let i = 1; i <= LOOP_SUBSTEPS; i++) {
        loopPos(stop, prevU + (loopT - prevU) * (i / LOOP_SUBSTEPS), _vec3);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }
    // Heading = loop tangent (used when departing)
    loopPos(stop, loopT + 0.02, _vA);
    loopPos(stop, loopT - 0.02, _vB);
    cometDir.subVectors(_vA, _vB).normalize();
}

function updateView(dt) {
    const stop = stops[stopIndex];

    if (stop.type === StopType.ATTRACTOR) {
        rideAttractor(stop, dt);
    } else {
        // Face the stop during the first moments, then hand the camera
        // back so the user can zoom/rotate freely
        if (stepFaceAlign(dt) && stop.type === StopType.ROCK) {
            controls.autoRotateSpeed = 0.3;
        }
        loopPlanar(stop, dt);
    }

    worldPos.copy(stop.center); // camera stays stable

    const delay = VIEW_TAP_DELAY[stop.type];
    if (phaseTime >= delay) showTapPrompt();

    if (tapPending && phaseTime >= delay) {
        tapPending = false;
        hideTapPrompt();

        // Attractor stops remember the ride tip so the next visit's
        // approach lands back on the curve where the comet left it
        if (stop.type === StopType.ATTRACTOR) stop.rideState = [...rideS];

        // After the landing, the tour loops back to the first attractor
        const next = stopIndex === stops.length - 1 ? 1 : stopIndex + 1;
        setupTravel(next, false);
    }
}

// ── Landing mail hit-plane ─────────────────────────────────────────
// Built by world.js; clickable only while viewing the contact landing
export function getMailPlane() {
    const stop = stops[stopIndex];
    if (phase !== Phase.VIEW || !stop || stop.type !== StopType.LANDING) return null;
    return mailPlaneFromWorld();
}
