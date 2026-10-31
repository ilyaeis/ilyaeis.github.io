// ── Portal ─────────────────────────────────────────────────────────
// An app behind a project stop (panel.portal, dimension.js). The comet dives
// through the viz centre, the camera dollies after it through the viz plane,
// the warp flash peaks, and the app overlay fades in. The main loop then
// idles (Phase.DIMENSION) until the overlay closes; PORTAL_OUT is the same
// way back. Time-based (dt-free), smootherstep: no jolt.
// The orchestrator owns the phase and calls in here (init, update); `J` is
// its small interface (see orchestrator.js init).

import * as THREE from 'three';
import { controls, camera, pushPointWorld, setBloomBoost } from './attractors.js';
import * as cam from './camera.js';
import * as tunnel from './tunnel.js';
import { stops } from './world.js';

// ── Tuning ─────────────────────────────────────────────────────────
const PORTAL_TIME = 1.6;             // s: the dive in, and the way back out
const PORTAL_DEPTH = 4;              // world units behind the viz plane: the comet's end point
const PORTAL_CAM_DEPTH = 0.6;        // ... the camera's end point (just through the plane)
const PORTAL_LOOK = 3;               // the camera looks this far ahead of itself, along the stop normal
const PORTAL_PEAK = 1.2;             // s into the dive: the warp flash is full here (and stays full)
const PORTAL_RISE = 0.8;             // s: the flash rises over this before the peak
const PORTAL_SHOW = 0.6;             // flash strength at which the overlay starts to fade in
const PORTAL_FALL = 0.9;             // s: on the way back the flash settles over this
const PORTAL_FADE = 0.4;             // s: reduced motion: no flight, the overlay just fades
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

let J = null;                    // the orchestrator interface
let auto = false;                // dev (?portal=1): enter after the view delay
let shown = false;               // the overlay was told to fade in
let w0 = 1;                      // flash strength at the start of PORTAL_OUT
let leg = null;                  // the comet's Bezier for this dive (in or out)
const camFrom = new THREE.Vector3(), lookFrom = new THREE.Vector3();
const camTo = new THREE.Vector3(), lookTo = new THREE.Vector3();
const _pCam = new THREE.Vector3(), _pLook = new THREE.Vector3();
const _v = new THREE.Vector3(), _vA = new THREE.Vector3(), _vB = new THREE.Vector3();

export function init(journey, devAuto) {
    J = journey;
    auto = devAuto;
    // Portal requests from the DOM: the panel button; dimension.js reports
    // the prefetch progress (it lights the rim) and the overlay's close
    window.addEventListener('journey:portal-request', () => enterPortal(true));
    window.addEventListener('journey:portal-exit', () => exitPortal());
    window.addEventListener('journey:portal-progress', (e) => {
        stops.find(st => st.id === e.detail?.id)?.viz?.rim?.setProgress(e.detail.p);
    });
}

// Dev (?portal=1): called in VIEW once the view delay is over; true = entered
export function devAutoEnter(stop) {
    if (!auto || !stop.portal) return false;
    auto = false;
    return enterPortal(true);
}

function emitPortal(phaseName) {
    const stop = J.stop;
    window.dispatchEvent(new CustomEvent('journey:portal', {
        detail: { phase: phaseName, id: stop.id, href: stop.portal.href, title: stop.portal.title ?? stop.id }
    }));
}

// The rim's hit ring, while viewing a portal stop (after the view delay); main.js raycasts it
export function getPortalHit() {
    const stop = J?.stop;
    if (!J || J.phase !== J.Phase.VIEW || !stop?.portal || J.phaseTime < J.viewDelay(stop)) return null;
    return stop.viz.rim.hit;
}
export function setPortalHover(v) { J?.stop?.viz?.rim?.setHover(v && J.phase === J.Phase.VIEW); }

// Enter the portal of the current stop. A hit on the rim waits for the view
// delay (as a tap does); the panel button (byButton) does not.
export function enterPortal(byButton = false) {
    const stop = J.stop;
    if (J.phase !== J.Phase.VIEW || !stop?.portal) return false;
    if (!byButton && J.phaseTime < J.viewDelay(stop)) return false;
    J.hideTapPrompt();
    J.emitStop('leave');
    stop.viz.rim.setHover(false);
    shown = false;
    emitPortal('enter');
    // The comet curves into the viz centre and on through the plane
    const { cometPos, cometDir } = J;
    leg = {
        p0: cometPos.clone(),
        p1: cometPos.clone().addScaledVector(cometDir, 0.8),
        p2: stop.center.clone().addScaledVector(stop.normal, PORTAL_DEPTH * 0.25),
        p3: stop.center.clone().addScaledVector(stop.normal, PORTAL_DEPTH)
    };
    // The camera dollies from where it is, through the viz plane, looking along the normal
    camFrom.copy(camera.position); lookFrom.copy(controls.target);
    camTo.copy(stop.center).addScaledVector(stop.normal, PORTAL_CAM_DEPTH);
    lookTo.copy(camTo).addScaledVector(stop.normal, PORTAL_LOOK);
    startCamera();
    J.enterPhase(J.Phase.PORTAL_IN);
    return true;
}

// Close the dimension (dimension.js: back button, Esc, browser Back): back out to VIEW
export function exitPortal() {
    const P = J.Phase;
    if (J.phase !== P.DIMENSION && J.phase !== P.PORTAL_IN) return false;
    const stop = J.stop;
    w0 = J.phase === P.DIMENSION ? 1 : flash(J.phaseTime);
    leg = {
        p0: J.cometPos.clone(),
        p1: J.cometPos.clone().addScaledVector(stop.normal, -PORTAL_DEPTH * 0.4),
        p2: stop.center.clone().addScaledVector(stop.normal, 1),
        p3: J.traceWorld(stop, 0, new THREE.Vector3())      // the viz centre: the re-trace starts there
    };
    camFrom.copy(camera.position); lookFrom.copy(controls.target);
    lookTo.copy(stop.center);
    camTo.copy(stop.center).addScaledVector(stop.normal, -J.fitFor(stop));
    startCamera();
    cam.setScreenShift(J.hasPanel(stop));
    J.enterPhase(P.PORTAL_OUT);
    return true;
}

function startCamera() {
    if (reduceMotion) return;          // the camera stays; the overlay just fades
    cam.setArrival(null, null, 0);
    cam.setMode(cam.Mode.FOLLOW, controls);
    cam.setRail(camFrom, lookFrom, 1);
    cam.setScreenShift(false);
}

// Flash strength on the way in: rises to the peak, then stays full (the overlay covers it)
function flash(t) { return THREE.MathUtils.smoothstep(t, PORTAL_PEAK - PORTAL_RISE, PORTAL_PEAK); }

// Per frame in PORTAL_IN (goingIn) and PORTAL_OUT
export function update(dt, goingIn) {
    const P = J.Phase, t = J.phaseTime + dt;
    if (reduceMotion) {
        if (goingIn && !shown) { shown = true; emitPortal('show'); }
        if (t >= PORTAL_FADE) goingIn ? J.enterPhase(P.DIMENSION) : J.enterView();
        return;
    }
    const x = Math.min(t / PORTAL_TIME, 1), prevX = Math.min(J.phaseTime / PORTAL_TIME, 1);
    const ss = THREE.MathUtils.smootherstep;
    const w = goingIn ? flash(t) : w0 * (1 - THREE.MathUtils.smoothstep(t, 0, PORTAL_FALL));
    const { trail, cometPos, cometDir } = J;
    // the comet: its leg, eased (it starts and ends at rest)
    trail.pointIntensity = 1 + J.WARP_COMET * w;
    const e0 = ss(prevX, 0, 1), e1 = ss(x, 0, 1);
    for (let i = 1; i <= J.TRAVEL_POINTS_PER_FRAME; i++) {
        J.legPoint(leg, e0 + (e1 - e0) * i / J.TRAVEL_POINTS_PER_FRAME, _v);
        pushPointWorld(trail, _v.x, _v.y, _v.z);
    }
    trail.pointIntensity = 1.0;
    J.legPoint(leg, e1, cometPos);
    J.legPoint(leg, Math.min(e1 + 0.01, 1), _vA);
    J.legPoint(leg, Math.max(e1 - 0.01, 0), _vB);
    if (_vA.distanceToSquared(_vB) > 1e-10) cometDir.subVectors(_vA, _vB).normalize();
    J.worldPos.copy(cometPos);
    // the camera: a straight dolly (rail pose), smootherstep in time
    _pCam.lerpVectors(camFrom, camTo, e1);
    _pLook.lerpVectors(lookFrom, lookTo, e1);
    cam.setRail(_pCam, _pLook, 1);
    // the warp flash (as at the tunnel mouths)
    setBloomBoost(w);
    camera.fov = J.baseFov + J.WARP_FOV * w;
    camera.updateProjectionMatrix();
    tunnel.setRush(w);
    tunnel.updateStreaks(dt, cometPos, cometDir, w);
    if (goingIn && !shown && w >= PORTAL_SHOW) { shown = true; emitPortal('show'); }
    if (x < 1) return;
    if (goingIn) { J.enterPhase(P.DIMENSION); return; }
    // back in VIEW: the flash is over; the panel and the re-trace come back
    setBloomBoost(0);
    camera.fov = J.baseFov; camera.updateProjectionMatrix();
    tunnel.setRush(0); tunnel.updateStreaks(0, cometPos, cometDir, 0);
    J.enterView();
    J.stepFaceAlign(dt);
}
