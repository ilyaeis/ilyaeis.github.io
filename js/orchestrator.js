// ── Orchestrator ───────────────────────────────────────────────────
// Tap-driven state machine over a pre-built static world (world.js).
// The trail is a short fading comet: it travels Bezier arcs between
// stops, rides attractor curves, and at planar stops draws the element's
// trajectory once then loops around it while the user views.

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
    buildWorld, stops, StopType, planePointToWorld,
    getMailPlane as mailPlaneFromWorld, CONTACT_EMAIL
} from './world.js';

export { CONTACT_EMAIL };

// ── Phase enum ─────────────────────────────────────────────────────
export const Phase = {
    INTRO: 0,
    ROCKET_EXIT: 1,   // first tap: the rocket morphs into the comet in place
    TRAVEL: 2,
    VIEW: 3
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
const cometPos = new THREE.Vector3();   // the comet head's true position (Bezier start)
const cometDir = new THREE.Vector3(1, 0, 0); // comet heading (departures)

const _vec3 = new THREE.Vector3();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _startPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _future = new THREE.Vector3();
const _loopOffset = new THREE.Vector3(); // trajectory-end → orbit settle offset

// Travel path — one or two chained cubic Bezier legs. Two legs appear
// when a third scene sits near the corridor between stops: the comet
// flies straight through it on the way.
let travelLegs = [];       // [{ p0, p1, p2, p3 }]
let travelFracs = [];      // cumulative end fraction of each leg (by length)
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
let tracing = false;       // VIEW: comet is drawing the element's strokes once
let traceCursor = 0;       // index into the stop's stroke points
let traceAcc = 0;          // fractional stroke-point budget (dt-based)

// ── Tuning ─────────────────────────────────────────────────────────
const COMET_CAPACITY = isMobile ? 600 : 1200;

// Travel — stops are 30-50 units apart now, so the comet moves fast
const TRAVEL_SPEED = 9.0;            // world units per second
const TRAVEL_MIN = 2.5;              // seconds
const TRAVEL_MAX = 7.0;
const TRAVEL_POINTS_PER_FRAME = 30;  // comet substeps along the path
const LAUNCH_FLASH = 0.8;            // extra HDR intensity leaving the intro

// Fly-through: a stop within this corridor of the flight line (and not
// too near either end) becomes a via point the comet passes through
const VIA_BAND = [0.2, 0.8];         // projection range along the flight line
const VIA_MAX_PERP = 0.5;            // × flight distance
const VIA_JITTER = 0.8;              // random offset so it never dead-centers

// Corkscrew (replaces the old vortex stop) — the first flight spirals
// around its own curve, ramping in and out
const CORK_REVS = 3;                 // full revolutions over the flight
const CORK_RADIUS = 1.4;             // peak spiral radius (mid-flight)

// Hover departures (text / rocks / landing): the first Bezier control
// point is where the comet would be HOVER_LOOKAHEAD seconds into its
// loop, so the exit flows out of the hover motion instead of kinking.
const HOVER_LOOKAHEAD = 5.0;         // seconds of loop motion to aim along

// Viewing
const RIDE_POINTS_PER_SEC = 12000;   // comet speed along attractor curves
const RIDE_MAX_PER_FRAME = 500;
const LOOP_SUBSTEPS = 8;             // comet substeps on planar-stop loops
const LOOP_SETTLE_RATE = 1.5;        // how fast the fly-off eases onto the orbit

// Trace — on arriving at a text / rock / landing, the comet first draws
// the element's own stroke trajectory ONCE (the same points that drew
// it), then settles into the viewing loop. Bold letter strokes (c=1)
// glow; faint connectors (c=0) stay dim — matching the static geometry.
const TRACE_DURATION = 3.0;          // seconds for the single trajectory pass
const TRACE_MAX_PER_FRAME = 300;     // stroke-point budget cap per frame
const TRACE_STROKE_INTENSITY = 1.4;  // bold strokes (c=1) → HDR/bloom
const TRACE_LINK_INTENSITY = 0.4;    // faint pen-travel strokes (c=0)

const VIEW_TAP_DELAY = {
    [StopType.TEXT]: 2.0,
    [StopType.ATTRACTOR]: 3.0,
    [StopType.ROCK]: 1.5,
    [StopType.LANDING]: 1.5
};

// Rocket → comet morph duration (3D rocket — see intro3d.js)
const ROCKET_MORPH_DURATION = intro.CHARGE_DURATION;

// DOM refs
let tapPromptEl = null;

// ── Init ───────────────────────────────────────────────────────────
export function init() {
    tapPromptEl = document.querySelector('.tap-prompt');
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

// ── Arrival camera offset ──────────────────────────────────────────
// The camera→target offset the chase camera should settle into as it
// reaches a stop, so it can pre-compose the scene during the flight:
//   · planar stops → face-on, backed off by the fit distance
//   · attractors   → the orbit pose (radius/elevation) from its table
function computeArrivalOffset(dest, out) {
    if (dest.type === StopType.ATTRACTOR) {
        const c = ATTRACTORS[dest.attractorIdx].camera;
        const horiz = c.radius * Math.cos(c.elevation);
        return out.set(0, c.radius * Math.sin(c.elevation), horiz); // azimuth 0; auto-rotate takes over
    }
    const dist = computeFitDistance(dest.points2d, dest.scale);
    return out.copy(dest.normal).multiplyScalar(-dist);
}

// ── Cubic Bezier evaluation (single leg) ───────────────────────────
function legPoint(leg, t, out) {
    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;
    out.x = uuu * leg.p0.x + 3 * uu * t * leg.p1.x + 3 * u * tt * leg.p2.x + ttt * leg.p3.x;
    out.y = uuu * leg.p0.y + 3 * uu * t * leg.p1.y + 3 * u * tt * leg.p2.y + ttt * leg.p3.y;
    out.z = uuu * leg.p0.z + 3 * uu * t * leg.p1.z + 3 * u * tt * leg.p2.z + ttt * leg.p3.z;
    return out;
}

// ── Whole-path evaluation (legs chained by length fraction) ────────
function travelPoint(gt, out) {
    let i = 0;
    while (i < travelLegs.length - 1 && gt > travelFracs[i]) i++;
    const start = i === 0 ? 0 : travelFracs[i - 1];
    const lt = THREE.MathUtils.clamp((gt - start) / (travelFracs[i] - start), 0, 1);
    return legPoint(travelLegs[i], lt, out);
}

function travelTangent(gt, out) {
    travelPoint(Math.min(gt + 0.004, 1), _vA);
    travelPoint(Math.max(gt - 0.004, 0), _vB);
    return out.subVectors(_vA, _vB).normalize();
}

// ── Random helpers for flight-path variety ─────────────────────────
function rand(min, max) { return min + Math.random() * (max - min); }
function randSign() { return Math.random() < 0.5 ? -1 : 1; }

// ── Build one flight leg from a start position + direction to a target ──
// Every transition swoops: the control points get random perpendicular
// offsets so no two flights arc the same way.
function buildLeg(startPos, startDir, targetPos) {
    const leg = {
        p0: startPos.clone(),
        p1: new THREE.Vector3(),
        p2: new THREE.Vector3(),
        p3: targetPos.clone()
    };

    // Control point 1: extend from start in the departure direction
    const dist = startPos.distanceTo(targetPos);
    leg.p1.copy(startDir).normalize().multiplyScalar(dist * 0.4).add(startPos);

    // Control point 2: approach target gently from the flight direction
    _vec3.copy(targetPos).sub(startPos).normalize();
    leg.p2.copy(_vec3).multiplyScalar(-dist * 0.3).add(targetPos);

    // Random sideways arc — perpendicular frame around the flight vector
    _arcRight.crossVectors(_vec3, camera.up);
    if (_arcRight.lengthSq() < 1e-6) _arcRight.set(1, 0, 0);
    _arcRight.normalize();
    _arcUp.crossVectors(_arcRight, _vec3).normalize();
    const sign = randSign();
    leg.p1.addScaledVector(_arcRight, sign * dist * rand(0.15, 0.3));
    leg.p1.addScaledVector(_arcUp, randSign() * dist * rand(0.05, 0.15));
    leg.p2.addScaledVector(_arcRight, -sign * dist * rand(0.1, 0.2));
    leg.p2.addScaledVector(_arcUp, randSign() * dist * rand(0.04, 0.1));
    return leg;
}

// ── Hover departure leg ────────────────────────────────────────────
// A smoother exit from a stop the comet is looping around. The four
// control points:
//   p0 — where the comet is right now (cometPos)
//   p1 — where it would be HOVER_LOOKAHEAD seconds on, so the departure
//        tangent continues the loop motion (no kink)
//   p3 — the destination
//   p2 — on the sphere whose diameter is p1→p3, so the bend at the
//        control point is ~90° (Thales), pushed out in a random
//        perpendicular direction so no two exits arc the same way.
function buildHoverLeg(p0, p1, p3) {
    const leg = {
        p0: p0.clone(),
        p1: p1.clone(),
        p2: new THREE.Vector3(),
        p3: p3.clone()
    };

    _vA.addVectors(p1, p3).multiplyScalar(0.5);   // sphere center (mid of p1,p3)
    _vB.subVectors(p3, p1);                        // diameter axis
    const r = 0.5 * _vB.length();                  // radius → exactly 90° at p2
    _vB.normalize();

    // Random unit direction perpendicular to the axis
    _arcRight.crossVectors(_vB, camera.up);
    if (_arcRight.lengthSq() < 1e-6) _arcRight.crossVectors(_vB, _vec3.set(1, 0, 0));
    _arcRight.normalize();
    _arcUp.crossVectors(_vB, _arcRight).normalize();
    const ang = rand(0, Math.PI * 2);
    leg.p2.copy(_vA)
        .addScaledVector(_arcRight, r * Math.cos(ang))
        .addScaledVector(_arcUp, r * Math.sin(ang));
    return leg;
}

// First leg of a flight: hover stops swoop out of their loop motion;
// attractor stops depart along the live flow direction.
function buildFirstLeg(target) {
    const fromStop = stopIndex >= 0 ? stops[stopIndex] : null;
    if (fromStop && fromStop.type !== StopType.ATTRACTOR && !tracing) {
        loopPos(fromStop, loopT + HOVER_LOOKAHEAD, _future);
        return buildHoverLeg(cometPos, _future, target);
    }
    // Mid-trace (or attractor): depart along the live heading
    return buildLeg(cometPos, cometDir, target);
}

// ── Fly-through pick ───────────────────────────────────────────────
// A stop sitting near the corridor between the comet and its target
// (not too close to either end) becomes a via point — the comet
// passes through that scene instead of flying around it.
function pickViaStop(destIdx, from, to) {
    _vA.subVectors(to, from);
    const abLenSq = _vA.lengthSq();
    if (abLenSq < 1e-6) return null;
    const abLen = Math.sqrt(abLenSq);

    let best = null;
    let bestPerp = VIA_MAX_PERP * abLen;
    for (let k = 0; k < stops.length; k++) {
        if (k === destIdx || k === stopIndex) continue;
        const c = stops[k].center;
        const s = (_vB.subVectors(c, from).dot(_vA)) / abLenSq;
        if (s < VIA_BAND[0] || s > VIA_BAND[1]) continue;
        _vec3.copy(from).addScaledVector(_vA, s); // closest point on the line
        const perp = _vec3.distanceTo(c);
        if (perp < bestPerp) {
            bestPerp = perp;
            best = stops[k];
        }
    }
    return best;
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
    // curve and keeps riding; planar stops: aim at the FIRST stroke point
    // so the comet flies straight into the start of the trajectory (no
    // spoke through the center) and begins tracing from there.
    if (dest.type === StopType.ATTRACTOR) {
        rideTipWorld(dest, dest.rideState, _targetPos);
    } else {
        traceWorld(dest, 0, _targetPos);
    }

    // Route through a third scene when one sits near the flight line
    // (checked before stopIndex moves to the destination). The flight
    // starts from the comet's *actual* head — cometPos — not the stop
    // center, so the trail flows on instead of snapping back.
    const via = pickViaStop(destIdx, cometPos, _targetPos);
    travelLegs = [];
    if (via) {
        const viaPos = via.center.clone().add(new THREE.Vector3(
            rand(-VIA_JITTER, VIA_JITTER),
            rand(-VIA_JITTER, VIA_JITTER),
            rand(-VIA_JITTER, VIA_JITTER)
        ));
        const leg1 = buildFirstLeg(viaPos);
        // Depart the via along leg1's arrival tangent — smooth join
        _vec3.subVectors(leg1.p3, leg1.p2).normalize();
        travelLegs.push(leg1, buildLeg(viaPos, _vec3, _targetPos));
    } else {
        travelLegs.push(buildFirstLeg(_targetPos));
    }

    // Time + leg fractions proportional to chord length
    let total = 0;
    const lens = travelLegs.map(l => {
        const len = l.p0.distanceTo(l.p3);
        total += len;
        return len;
    });
    travelFracs = [];
    let acc = 0;
    for (const len of lens) {
        acc += len / total;
        travelFracs.push(acc);
    }
    travelDuration = THREE.MathUtils.clamp(total / TRAVEL_SPEED, TRAVEL_MIN, TRAVEL_MAX);
    corkscrew = withCorkscrew;

    // Comet glows in the destination's palette
    trail.attractorIdx = dest.paletteIdx ?? 0;

    stopIndex = destIdx;
    cam.setMode(cam.Mode.FOLLOW, controls);
    // Pre-compose the destination so the camera is already framed on arrival
    cam.setFollowAim(computeArrivalOffset(dest, _vec3));
    enterPhase(Phase.TRAVEL);
}

// Spiral offset around the curve tangent — radius ramps in and out so
// the corkscrew starts and ends exactly on the curve
function applyCorkscrew(t, point) {
    travelTangent(t, _tan);
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
        case Phase.ROCKET_EXIT:    updateRocketExit(dt); break;
        case Phase.TRAVEL:         updateTravel(dt); break;
        case Phase.VIEW:           updateView(dt); break;
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
// First tap: everything stays exactly where it is — only the rocket
// reacts, accelerating from its current idle spot into the comet streak.
function updateIntro(dt) {
    if (tapPending) {
        tapPending = false;
        hideTapPrompt();
        enterPhase(Phase.ROCKET_EXIT);
    }
}

// ── ROCKET_EXIT (the rocket accelerates in place, smears into the comet) ─
function updateRocketExit(dt) {
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        intro.setRocketCharging();
        // Start the comet trail right away so a glowing line draws straight
        // out of the accelerating rocket. As the rocket fades, the line is
        // what remains — then it flies off into the journey.
        trail.fade = 1;
        trail.attractorIdx = stops[0].paletteIdx ?? 0;
        clearTrail(trail);
        addTrailToScene(trail);
        intro.getRocketTipWorld(_startPos);
        pushPointWorld(trail, _startPos.x, _startPos.y, _startPos.z);
        cometPos.copy(_startPos);
    }

    // Trace the line from the rocket's tip as it accelerates forward
    intro.getRocketTipWorld(_vec3);
    pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    cometPos.copy(_vec3);

    // Keep the view framed on the rocket (not the text at the origin), so
    // the transformation stays centered on screen — the letters slide off
    // as the camera eases over and the forming streak trails behind it.
    cam.setOrbitCenter(_vec3.x, _vec3.y, _vec3.z);

    if (phaseTime >= ROCKET_MORPH_DURATION) {
        // Hand off: the comet continues from the tip along the same heading
        intro.getRocketDirWorld(cometDir);
        intro.hideRocket();
        worldPos.copy(_vec3);

        // First flight: corkscrew out to the trait text
        setupTravel(0, true);
    }
}

// Ease-in/ease-out along the flight: the comet starts from rest, builds
// speed, then settles into the stop — smoothstep on the path parameter.
function travelEase(x) { return x * x * (3 - 2 * x); }

// ── TRAVEL (Bezier arc to the next stop) ───────────────────────────
function updateTravel(dt) {
    // Eased path parameter so motion accelerates and decelerates instead
    // of jumping to constant speed the instant the comet departs.
    const t = travelEase(Math.min(phaseTime / travelDuration, 1));
    const prevT = travelEase(Math.max(0, (phaseTime - dt) / travelDuration));

    for (let i = 1; i <= TRAVEL_POINTS_PER_FRAME; i++) {
        const subT = prevT + (t - prevT) * (i / TRAVEL_POINTS_PER_FRAME);
        travelPoint(subT, _vec3);
        if (corkscrew) {
            applyCorkscrew(subT, _vec3);
            // Brilliant launch flash, settling as the spiral unwinds
            trail.pointIntensity = 1 + LAUNCH_FLASH * Math.max(0, 1 - subT * 3);
        }
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }
    trail.pointIntensity = 1.0;

    // Camera follows the smooth base path, not the spiral
    travelPoint(t, worldPos);
    travelTangent(t, cometDir);
    cometPos.copy(worldPos); // keep the head position current for the next leg

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
        tracing = false;
    } else {
        controls.autoRotateSpeed = 0;
        beginFaceAlign(stop.center, stop.normal, stop.points2d, stop.scale);
        loopT = 0;
        tracing = true;    // draw the element's trajectory once before looping
        traceCursor = 0;
        traceAcc = 0;
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

// World position of a planar stop's stroke point at a given index
// (clamped into range), mapped through the stop's plane basis.
function traceWorld(stop, idx, out) {
    const pts = stop.points2d;
    const i = THREE.MathUtils.clamp(idx, 0, pts.length - 1);
    return planePointToWorld(out, stop.center, stop.right, stop.up, stop.scale, pts[i]);
}

// Draw the element's own trajectory once: walk its stroke points in
// order at a speed that completes one full pass in TRACE_DURATION. Bold
// letter strokes (c=1) glow; faint connectors (c=0) stay dim. When the
// last point is reached, hand off to the viewing loop.
function tracePlanar(stop, dt) {
    const n = stop.points2d.length;
    traceAcc += (n / TRACE_DURATION) * dt;
    let budget = Math.min(Math.floor(traceAcc), TRACE_MAX_PER_FRAME);
    traceAcc -= budget;

    for (let i = 0; i < budget && traceCursor < n - 1; i++) {
        traceCursor++;
        const p = stop.points2d[traceCursor];
        trail.pointIntensity = p.c === 1 ? TRACE_STROKE_INTENSITY : TRACE_LINK_INTENSITY;
        planePointToWorld(_vec3, stop.center, stop.right, stop.up, stop.scale, p);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }
    trail.pointIntensity = 1.0;

    // Comet head + local stroke tangent (heading used if departing mid-trace)
    traceWorld(stop, traceCursor, cometPos);
    traceWorld(stop, traceCursor + 2, _vA);
    traceWorld(stop, traceCursor - 2, _vB);
    cometDir.subVectors(_vA, _vB);
    if (cometDir.lengthSq() < 1e-9) cometDir.set(1, 0, 0);
    cometDir.normalize();

    if (traceCursor >= n - 1) {
        // Hand off to the orbit, flying off the last stroke: seed the loop
        // at the trajectory end (cometPos) and let it settle onto the loop.
        tracing = false;
        loopT = 0;
        _loopOffset.subVectors(cometPos, loopPos(stop, 0, _vec3)); // end − center
    }
}

// Lazy Lissajous loop around a planar stop, sized to its bounds.
function loopPos(stop, u, out) {
    const w = Math.max(stop.halfW * 1.25, 0.4);
    const h = Math.max(stop.halfH * 1.6, 0.3);
    out.copy(stop.center)
        .addScaledVector(stop.right, w * Math.sin(0.7 * u))
        .addScaledVector(stop.up, h * Math.sin(1.3 * u))
        .addScaledVector(stop.normal, 0.35 * Math.sin(0.9 * u));
    return out;
}

// The orbit the comet actually rides: the Lissajous plus a settle offset
// that decays from the trajectory end (set when tracing finishes) so the
// comet flies off the last stroke and eases onto the loop — instead of
// snapping back through the center. The offset vanishes within ~2s.
function loopPosSettled(stop, u, out) {
    loopPos(stop, u, out);
    const decay = Math.exp(-LOOP_SETTLE_RATE * u);
    if (decay > 1e-3) out.addScaledVector(_loopOffset, decay);
    return out;
}

function loopPlanar(stop, dt) {
    const prevU = loopT;
    loopT += dt;
    for (let i = 1; i <= LOOP_SUBSTEPS; i++) {
        loopPosSettled(stop, prevU + (loopT - prevU) * (i / LOOP_SUBSTEPS), _vec3);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }
    // Heading = loop tangent (used when departing)
    loopPosSettled(stop, loopT + 0.02, _vA);
    loopPosSettled(stop, loopT - 0.02, _vB);
    cometDir.subVectors(_vA, _vB).normalize();
}

function updateView(dt) {
    const stop = stops[stopIndex];

    if (stop.type === StopType.ATTRACTOR) {
        rideAttractor(stop, dt);
        rideTipWorld(stop, rideS, cometPos); // comet head rides the curve
    } else {
        // Face the stop during the first moments, then hand the camera
        // back so the user can zoom/rotate freely
        if (stepFaceAlign(dt) && stop.type === StopType.ROCK) {
            controls.autoRotateSpeed = 0.3;
        }
        if (tracing) {
            tracePlanar(stop, dt); // draw the trajectory once, then loop
        } else {
            loopPlanar(stop, dt);
            loopPosSettled(stop, loopT, cometPos); // comet head rides the orbit
        }
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
