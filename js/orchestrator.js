// ── Orchestrator ───────────────────────────────────────────────────
// Tap-driven state machine over a pre-built static world (world.js).
// The trail is a short fading comet: it travels Bezier arcs between
// stops, swings past attractor "galaxies" (scenery), and at planar stops
// draws the element's trajectory once then loops around it while the
// user views. The trait text is the exception: it spirals and flies on.

import * as THREE from 'three';
import {
    controls, camera, scene,
    createTrailSystem, addTrailToScene, clearTrail,
    pushPointWorld, updateTrailAttributes, updateTrailGlow,
    addJourneyTime, render, isPaused, isMobile
} from './attractors.js';
import * as cam from './camera.js';
import * as intro from './intro3d.js';
import {
    buildWorld, stops, StopType, planePointToWorld, scenery, updateScenery, lightStop,
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
let skipRender = false;    // dev (?t=S): simulate() steps without drawing
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
let travelArc = [];        // arc-length table: [{ s, leg, lt }], s = 0..1 along the whole path
let travelDuration = 0;
let corkscrew = false;     // first flight spirals around its curve

// Scratch frames (flight arcs, corkscrew basis)
const _arcRight = new THREE.Vector3();
const _arcUp = new THREE.Vector3();
const _tan = new THREE.Vector3();

// View state
const textFacePos = new THREE.Vector3(); // face-on camera target
const faceCenter = new THREE.Vector3();  // stop center the face-align glides around
const faceSph = new THREE.Spherical(), _sph = new THREE.Spherical();
const faceR = { x: 0, v: 0 }, facePhi = { x: 0, v: 0 }, faceTheta = { x: 0, v: 0 }; // springs
let camAligned = false;    // once true, stop steering — user gets control
let userDragging = false;  // true while the user holds a rotate/zoom gesture
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
const CAM_PATH_WINDOW = 0.2;         // s: half-width of the path smoothing the camera follows
const CAM_PATH_SAMPLES = 9;          // path samples per frame for that smoothing
const TRAVEL_ARC_SAMPLES = 256;      // arc-length table samples per leg (even speed, no jump at leg joins)
const LAUNCH_FLASH = 0.8;            // extra HDR intensity leaving the intro

// Fly-by: a scenery galaxy within this corridor of the flight line (and
// not too near either end) becomes a via point the comet swings past
const VIA_BAND = [0.15, 0.85];       // projection range along the flight line
const VIA_MAX_PERP = 0.6;            // × flight distance
const VIA_RIM = 0.7;                 // via point sits at this × galaxy radius from its center
const VIA_JITTER = 0.8;              // random offset so it never dead-centers

// Corkscrew (replaces the old vortex stop) — the first flight spirals
// around its own curve, ramping in and out
const CORK_REVS = 3;                 // full revolutions over the flight
const CORK_RADIUS = 1.4;             // peak spiral radius (mid-flight)
const CORK_FOLLOW_DIST = 4.0;        // chase distance on the corkscrew launch so the spiral (CORK_RADIUS) stays in frame; <= controls.maxDistance

// Hover departures (text / rocks / landing): the first Bezier control
// point is where the comet would be HOVER_LOOKAHEAD seconds into its
// loop, so the exit flows out of the hover motion instead of kinking.
const HOVER_LOOKAHEAD = 5.0;         // seconds of loop motion to aim along

// Viewing
const FACE_ALIGN_TIME = 0.6;         // s: smooth time of the camera onto the face-on pose
const FACE_ALIGN_MAX_TURN = THREE.MathUtils.degToRad(70); // rad/s: glide speed cap around the stop
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

// Trait text — the only stop the comet leaves by itself: a quick trace
// lights the letters, then it spirals around the block long enough to
// read it, then flies on. No tap.
const TEXT_TRACE_DURATION = 1.5;     // seconds for the stroke pass (TRACE_DURATION elsewhere)
const TEXT_FIT_MARGIN = 1.4;         // camera backs off × the fit so the helix's front pass stays clear
const SPIRAL_DURATION = 3.5;         // seconds of helix after the trace
const SPIRAL_REVS = 2.5;             // turns over SPIRAL_DURATION
const SPIRAL_RADIUS_W = 1.2;         // × halfW along `right` (passes outside the letters)
const SPIRAL_DEPTH = 0.6;            // world units along `normal` (front/back pass)
const SPIRAL_CLIMB = 1.2;            // × blockHalfH: climbs from below the block to above it

const VIEW_TAP_DELAY = {
    [StopType.ROCK]: 2.0,            // the HTML panel takes ~0.9 s to appear
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
    const q = new URLSearchParams(location.search);
    const stopQ = Number(q.get('stop')), legQ = Number(q.get('leg'));
    if (q.has('stop') && Number.isInteger(stopQ) && stops[stopQ]) jumpTo(stopQ);
    else if (q.has('leg') && Number.isInteger(legQ) && legQ >= 1 && stops[legQ]) { jumpTo(legQ - 1); setupTravel(legQ, false); }
    else showTapPrompt();
    const tQ = Number(q.get('t'));
    if (q.has('t') && tQ > 0 && tQ <= 30) simulate(tQ);
}

// Dev only (?t=S): step the simulation S seconds before the first frame
// so headless screenshots can show a mid-flight / mid-spiral state.
function simulate(seconds) {
    skipRender = true;
    for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60);
    skipRender = false;
}

export function onTap() { tapPending = true; }

// Dev only (dev/camlog.html): step without drawing, and read the state
export function setSkipRender(v) { skipRender = v; }
export function devState() {
    return { phase, phaseTime, stopIndex, stopType: stops[stopIndex]?.type ?? -1, worldPos, cometPos };
}

// Tell the DOM (stopPanel.js) which stop the comet enters or leaves
function emitStop(phaseName) {
    const stop = stops[stopIndex];
    if (!stop) return;
    window.dispatchEvent(new CustomEvent('journey:stop', {
        detail: { phase: phaseName, index: stopIndex, type: stop.type, panel: stop.panel || null }
    }));
}

// Dev only: land the comet at stop n instantly (?stop=N, ?leg=N).
function jumpTo(n) {
    intro.hideRocket(); hideTapPrompt();
    stopIndex = n;
    const stop = stops[n];
    trail.fade = 1; trail.attractorIdx = stop.paletteIdx ?? 0; clearTrail(trail); addTrailToScene(trail);
    traceWorld(stop, 0, cometPos); worldPos.copy(stop.center);
    cam.setOrbitCenter(stop.center.x, stop.center.y, stop.center.z);
    controls.target.copy(stop.center);
    camera.position.copy(stop.center).addScaledVector(stop.normal, -fitFor(stop));
    cam.setScreenShift(stop.type === StopType.ROCK, true);
    enterView();
}

function showTapPrompt() { if (tapPromptEl) tapPromptEl.classList.add('visible'); }
function hideTapPrompt() { if (tapPromptEl) tapPromptEl.classList.remove('visible'); }

function enterPhase(newPhase) {
    phase = newPhase;
    phaseTime = 0;
    phaseFirstFrame = true;
    tapPending = false; // taps don't queue across phases — each stop wants its own
}

// Share of the viewport the rock may fill (the HTML panel takes the rest)
const ROCK_FIT_SIDE = 0.5;           // side layout: half the width
const ROCK_FIT_BOTTOM = 0.55;        // bottom layout: ~55% of the height

// ── Camera fit distance ────────────────────────────────────────────
// Distance at which a 2D point set (scaled to world units, centered on
// the orbit target) fits inside the camera view, with a small margin.
function computeFitDistance(points, scale, availW = 1, availH = 1) {
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
    const fit = 1.25 * Math.max((h / 2) / (tanV * availH), (w / 2) / (tanV * camera.aspect * availW));
    return THREE.MathUtils.clamp(fit, controls.minDistance, controls.maxDistance);
}

// Camera distance the chase camera trails at on arrival, so it can
// pre-compose the scene during the flight: face-on, backed off by the fit
// distance (rocks leave room for the panel, text backs off for the helix).
function fitFor(stop) {
    if (stop.type === StopType.TEXT) {
        return Math.min(controls.maxDistance, computeFitDistance(stop.points2d, stop.scale) * TEXT_FIT_MARGIN);
    }
    if (stop.type !== StopType.ROCK) return computeFitDistance(stop.points2d, stop.scale);
    const [w, h] = cam.isPanelSideLayout() ? [ROCK_FIT_SIDE, 1] : [1, ROCK_FIT_BOTTOM];
    return computeFitDistance(stop.points2d, stop.scale, w, h);
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

// ── Whole-path evaluation (by arc length) ──────────────────────────
// gt is the share of the path length, so the comet speed depends only on
// the time ease: no speed jump where two legs join, no Bezier speed bumps.
function buildArcTable() {
    travelArc = [{ s: 0, leg: 0, lt: 0 }];
    let len = 0;
    travelLegs.forEach((leg, i) => {
        legPoint(leg, 0, _vB);
        for (let k = 1; k <= TRAVEL_ARC_SAMPLES; k++) {
            legPoint(leg, k / TRAVEL_ARC_SAMPLES, _vA);
            len += _vA.distanceTo(_vB);
            _vB.copy(_vA);
            travelArc.push({ s: len, leg: i, lt: k / TRAVEL_ARC_SAMPLES });
        }
    });
    for (const e of travelArc) e.s /= len || 1;
}

function travelPoint(gt, out) {
    gt = THREE.MathUtils.clamp(gt, 0, 1);
    let lo = 0, hi = travelArc.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (travelArc[mid].s < gt) lo = mid; else hi = mid;
    }
    const a = travelArc[lo], b = travelArc[hi];
    const f = b.s > a.s ? (gt - a.s) / (b.s - a.s) : 0;
    // Leg join: the next leg starts at local t = 0
    const lt = a.leg === b.leg ? a.lt + (b.lt - a.lt) * f : b.lt * f;
    return legPoint(travelLegs[b.leg], lt, out);
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
// offsets so no two flights arc the same way. keepStartDir leaves p1 on
// the start direction, so a chained leg joins without a kink.
function buildLeg(startPos, startDir, targetPos, keepStartDir = false, pull = 0.4, arc = 1) {
    const leg = {
        p0: startPos.clone(),
        p1: new THREE.Vector3(),
        p2: new THREE.Vector3(),
        p3: targetPos.clone()
    };

    // Control point 1: extend from start in the departure direction
    const dist = startPos.distanceTo(targetPos);
    leg.p1.copy(startDir).normalize().multiplyScalar(dist * pull).add(startPos);

    // Control point 2: approach target gently from the flight direction
    _vec3.copy(targetPos).sub(startPos).normalize();
    leg.p2.copy(_vec3).multiplyScalar(-dist * 0.3).add(targetPos);

    // Random sideways arc — perpendicular frame around the flight vector
    _arcRight.crossVectors(_vec3, camera.up);
    if (_arcRight.lengthSq() < 1e-6) _arcRight.set(1, 0, 0);
    _arcRight.normalize();
    _arcUp.crossVectors(_arcRight, _vec3).normalize();
    const sign = randSign();
    const p1Arc = keepStartDir ? 0 : 1;
    leg.p1.addScaledVector(_arcRight, p1Arc * sign * dist * arc * rand(0.15, 0.3));
    leg.p1.addScaledVector(_arcUp, p1Arc * randSign() * dist * arc * rand(0.05, 0.15));
    leg.p2.addScaledVector(_arcRight, -sign * dist * arc * rand(0.1, 0.2));
    leg.p2.addScaledVector(_arcUp, randSign() * dist * arc * rand(0.04, 0.1));
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

// First leg of a flight: hover stops swoop out of their loop motion.
function buildFirstLeg(target) {
    const fromStop = stopIndex >= 0 ? stops[stopIndex] : null;
    if (fromStop?.type === StopType.TEXT) return buildLeg(cometPos, cometDir, target); // leave along the helix tangent
    if (fromStop && !tracing) {
        loopPos(fromStop, loopT + HOVER_LOOKAHEAD, _future);
        return buildHoverLeg(cometPos, _future, target);
    }
    // Mid-trace: depart along the live heading
    return buildLeg(cometPos, cometDir, target);
}

// ── Fly-by pick ────────────────────────────────────────────────────
// A scenery galaxy sitting near the corridor between the comet and its
// target (not too close to either end) becomes a via point. Returns the
// galaxy.
function pickViaScenery(from, to) {
    _vA.subVectors(to, from);
    const abLenSq = _vA.lengthSq();
    if (abLenSq < 1e-6) return null;
    const abLen = Math.sqrt(abLenSq);

    let best = null;
    let bestPerp = VIA_MAX_PERP * abLen;
    for (const g of scenery) {
        const s = (_vB.subVectors(g.center, from).dot(_vA)) / abLenSq;
        if (s < VIA_BAND[0] || s > VIA_BAND[1]) continue;
        _vec3.copy(from).addScaledVector(_vA, s); // closest point on the line
        const perp = _vec3.distanceTo(g.center);
        if (perp < bestPerp) {
            bestPerp = perp;
            best = g;
        }
    }
    return best;
}

// ── Face-on camera alignment ───────────────────────────────────────
// Aim the camera at a planar stop: compute the face-on position once,
// then glide toward it each frame until arrival — unless the user
// already took over. The glide moves in spherical coordinates around
// the stop (distance, elevation, azimuth), so the camera swings around
// the side and never cuts over the top or through the stop.
function beginFaceAlign(stop) {
    const dist = fitFor(stop);
    faceCenter.copy(stop.center);
    textFacePos.copy(faceCenter).addScaledVector(stop.normal, -dist);
    faceSph.setFromVector3(_vec3.subVectors(textFacePos, faceCenter));
    _sph.setFromVector3(_vec3.subVectors(camera.position, faceCenter));
    faceR.x = _sph.radius; facePhi.x = _sph.phi; faceTheta.x = _sph.theta;
    // Start with the camera's current motion (no speed jump on arrival)
    const v = cam.cameraVel, sp = Math.sin(_sph.phi), cp = Math.cos(_sph.phi);
    const st = Math.sin(_sph.theta), ct = Math.cos(_sph.theta), r = Math.max(_sph.radius, 1e-3);
    faceR.v = v.x * sp * st + v.y * cp + v.z * sp * ct;
    facePhi.v = (v.x * cp * st - v.y * sp + v.z * cp * ct) / r;
    faceTheta.v = sp > 1e-3 ? (v.x * ct - v.z * st) / (r * sp) : 0;
    camAligned = userDragging; // user already in control → don't steer
}

// Returns true on the frame the camera arrives (settles)
function stepFaceAlign(dt) {
    if (camAligned) return false;
    // Shortest way round in azimuth
    let dTheta = faceSph.theta - faceTheta.x;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    cam.smoothDampScalar(faceR, faceSph.radius, FACE_ALIGN_TIME, dt);
    cam.smoothDampScalar(facePhi, faceSph.phi, FACE_ALIGN_TIME, dt, FACE_ALIGN_MAX_TURN);
    cam.smoothDampScalar(faceTheta, faceTheta.x + dTheta, FACE_ALIGN_TIME, dt, FACE_ALIGN_MAX_TURN);
    _sph.set(faceR.x, facePhi.x, faceTheta.x);
    camera.position.setFromSpherical(_sph).add(faceCenter);
    if (camera.position.distanceToSquared(textFacePos) < 0.0025) {
        camAligned = true;
        return true;
    }
    return false;
}

// ── Travel setup ───────────────────────────────────────────────────
function setupTravel(destIdx, withCorkscrew) {
    const dest = stops[destIdx];
    emitStop('leave'); // before stopIndex moves to the destination

    // Aim at the FIRST stroke point so the comet flies straight into the
    // start of the trajectory (no spoke through the center) and begins
    // tracing from there.
    traceWorld(dest, 0, _targetPos);

    // Swing past a scenery galaxy when one sits near the flight line.
    // The flight starts from the comet's *actual* head — cometPos — not
    // the stop center, so the trail flows on instead of snapping back.
    const via = pickViaScenery(cometPos, _targetPos);
    travelLegs = [];
    if (via) {
        // Near edge of the galaxy, not its center: the closest point on the
        // flight line, pushed back out to the rim on that side
        _vA.subVectors(_targetPos, cometPos);
        const s = _vB.subVectors(via.center, cometPos).dot(_vA) / _vA.lengthSq();
        _vec3.copy(cometPos).addScaledVector(_vA, s);
        const viaPos = _vec3.sub(via.center).normalize()
            .multiplyScalar(via.radius * VIA_RIM).add(via.center).clone()
            .add(new THREE.Vector3(
            rand(-VIA_JITTER, VIA_JITTER),
            rand(-VIA_JITTER, VIA_JITTER),
            rand(-VIA_JITTER, VIA_JITTER)
        ));
        const leg1 = buildFirstLeg(viaPos);
        // Depart the via along leg1's arrival tangent — smooth join
        _vec3.subVectors(leg1.p3, leg1.p2).normalize();
        travelLegs.push(leg1, buildLeg(viaPos, _vec3, _targetPos, true));
    } else {
        travelLegs.push(buildFirstLeg(_targetPos));
    }

    // Time proportional to chord length
    let total = 0;
    for (const l of travelLegs) total += l.p0.distanceTo(l.p3);
    buildArcTable();
    travelDuration = THREE.MathUtils.clamp(total / TRAVEL_SPEED, TRAVEL_MIN, TRAVEL_MAX);
    corkscrew = withCorkscrew;

    // Comet glows in the destination's palette
    trail.attractorIdx = dest.paletteIdx ?? 0;

    stopIndex = destIdx;
    worldPos.copy(cometPos); // the camera hand-off starts from the real head, not the stop center
    cam.setMode(cam.Mode.FOLLOW, controls);
    // Pre-compose the destination so the camera is already framed on arrival
    cam.setFollowDistance(withCorkscrew ? Math.max(fitFor(dest), CORK_FOLLOW_DIST) : fitFor(dest));
    cam.setScreenShift(dest.type === StopType.ROCK);
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
    updateScenery(dt);

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

    cam.update(dt, controls, camera, worldPos, cometDir);
    if (!skipRender) render();
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

// Point the camera follows: the path averaged over ±CAM_PATH_WINDOW s
// (triangle weights), so tight bends do not whip the camera sideways.
// The window eases to zero at both ends (smoothstep, no kink), so the
// flight starts and ends exactly on the path.
function cameraAnchor(time, out) {
    const edge = Math.max(0, Math.min(time, travelDuration - time));
    const w = CAM_PATH_WINDOW * travelEase(Math.min(edge / (2 * CAM_PATH_WINDOW), 1));
    out.set(0, 0, 0);
    let sum = 0;
    for (let k = 0; k < CAM_PATH_SAMPLES; k++) {
        const s = 2 * (k + 1) / (CAM_PATH_SAMPLES + 1) - 1; // inside -1..1
        const wt = 1 - Math.abs(s);
        travelPoint(travelEase(THREE.MathUtils.clamp((time + s * w) / travelDuration, 0, 1)), _vB);
        out.addScaledVector(_vB, wt);
        sum += wt;
    }
    return out.divideScalar(sum);
}

// ── TRAVEL (Bezier arc to the next stop) ───────────────────────────
function updateTravel(dt) {
    // Eased path parameter so motion accelerates and decelerates instead
    // of jumping to constant speed the instant the comet departs.
    // phaseTime is the start of this frame; draw up to its end
    const t = travelEase(Math.min((phaseTime + dt) / travelDuration, 1));
    const prevT = travelEase(Math.min(phaseTime / travelDuration, 1));

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

    // Camera follows the base path (not the spiral), smoothed over time
    travelPoint(t, cometPos); // the head's true position, for the next leg
    cameraAnchor(phaseTime + dt, worldPos);
    travelTangent(t, cometDir);

    if (t >= 1) {
        enterView();
        stepFaceAlign(dt); // the camera keeps moving on the hand-off frame
    }
}

// ── VIEW (camera orbits the stop; comet rides or loops) ────────────
function enterView() {
    const stop = stops[stopIndex];

    cam.setMode(cam.Mode.ORBIT, controls);
    cam.setOrbitCenter(stop.center.x, stop.center.y, stop.center.z);

    controls.autoRotateSpeed = 0;
    beginFaceAlign(stop);
    loopT = 0;
    tracing = true;    // draw the element's trajectory once before looping
    traceCursor = 0;
    traceAcc = 0;

    emitStop('enter');
    enterPhase(Phase.VIEW);
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
function tracePlanar(stop, dt, duration = TRACE_DURATION, maxPerFrame = TRACE_MAX_PER_FRAME) {
    const n = stop.points2d.length;
    traceAcc += (n / duration) * dt;
    let budget = Math.min(Math.floor(traceAcc), maxPerFrame);
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

// Helix around the text block: axis = `up`, climbing bottom to top over
// SPIRAL_DURATION; wide along `right`, shallow along `normal` so the pass
// in front of the text is never on top of the camera.
function helixPos(stop, u, out) {
    const s = THREE.MathUtils.clamp(u / SPIRAL_DURATION, 0, 1);
    const ang = SPIRAL_REVS * 2 * Math.PI * s;
    return out.copy(stop.center)
        .addScaledVector(stop.up, stop.blockMid + stop.blockHalfH * SPIRAL_CLIMB * (2 * s - 1))
        .addScaledVector(stop.right, Math.max(stop.halfW * SPIRAL_RADIUS_W, 0.6) * Math.sin(ang))
        .addScaledVector(stop.normal, SPIRAL_DEPTH * Math.cos(ang));
}

// Lazy Lissajous loop around a planar stop, sized to its bounds.
function loopPos(stop, u, out) {
    if (stop.type === StopType.TEXT) return helixPos(stop, u, out);
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

    // Face the stop during the first moments, then hand the camera
    // back so the user can zoom/rotate freely
    const isText = stop.type === StopType.TEXT;
    if (stepFaceAlign(dt) && stop.type === StopType.ROCK) controls.autoRotateSpeed = 0.3;
    if (tracing) {
        tracePlanar(stop, dt, isText ? TEXT_TRACE_DURATION : TRACE_DURATION); // draw the trajectory once, then loop
        if (isText) lightStop(stop, traceCursor);
    } else {
        loopPlanar(stop, dt);
        loopPosSettled(stop, loopT, cometPos); // comet head rides the orbit
    }

    worldPos.copy(stop.center); // camera stays stable
    if (isText) {                      // no tap: spiral, then fly on
        if (!tracing && loopT >= SPIRAL_DURATION) setupTravel(stopIndex + 1, false);
        return;
    }

    const delay = VIEW_TAP_DELAY[stop.type];
    if (phaseTime >= delay) showTapPrompt();

    if (tapPending && phaseTime >= delay) {
        tapPending = false;
        hideTapPrompt();

        const next = stopIndex === stops.length - 1 ? 1 : stopIndex + 1; // after the landing, back to the first rock
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
