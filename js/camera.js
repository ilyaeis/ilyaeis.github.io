// ── Camera Controller ──────────────────────────────────────────────
// ORBIT: the target eases onto a fixed center (stops); the user may drag.
// FOLLOW: a chase camera. It sits behind the comet along the smoothed
//   travel direction, a little above it, and looks at a point just ahead
//   of the comet. Only exponential smoothing with one rate — no ramps,
//   no captured offsets — so the comet is always near screen center.
import * as THREE from 'three';

export const Mode = { ORBIT: 0, FOLLOW: 1 };

// ── Tuning ─────────────────────────────────────────────────────────
const ORBIT_RATE = 3.0;        // 1/s: target convergence onto the orbit center
const FOLLOW_RATE = 2.5;       // 1/s: smoothing of chase direction, distance and the hand-off offset
const FOLLOW_UP = 0.18;        // camera height above the path, × chase distance
const FOLLOW_AHEAD = 0.35;     // look point ahead of the comet, × chase distance

let currentMode = Mode.ORBIT;
const orbitCenter = new THREE.Vector3();

// Chase state
const chaseDir = new THREE.Vector3(0, 0, -1); // smoothed travel direction
let chaseDist = 2.5, chaseDistTarget = 2.5;   // current / wanted distance behind the comet
const lookOffset = new THREE.Vector3();       // target − comet at hand-off; decays to zero
let chaseFresh = false;                       // first FOLLOW frame: seed from the current view
const _v = new THREE.Vector3();

// ── Screen shift (HTML panel room) ─────────────────────────────────
// Pushes the scene center toward the left (side layout) or the top
// (bottom layout) so an HTML panel can sit beside the stop. Pure
// projection offset (camera.setViewOffset): orbit target and user
// rotation still pivot on the stop center.
// Keep PANEL_SIDE_QUERY identical to the media query in css/style.css.
export const PANEL_SIDE_QUERY = '(min-width: 700px) and (orientation: landscape)';
const SHIFT_SIDE_X = 0.25;      // rock center at 25% of width
const SHIFT_BOTTOM_Y = 0.18;    // rock center at ~32% of height
const SHIFT_RATE = 1.8;         // ease rate (1/s): ramps during the flight
let shiftTarget = 0, shiftNow = 0;
export function setScreenShift(on, immediate = false) { shiftTarget = on ? 1 : 0; if (immediate) shiftNow = shiftTarget; }
export function isPanelSideLayout() { return window.matchMedia(PANEL_SIDE_QUERY).matches; }

export function init(controls) { controls.target.set(0, 0, 0); currentMode = Mode.ORBIT; }

export function setMode(mode, controls) {
    if (mode === currentMode) return;
    currentMode = mode;
    controls.autoRotate = (mode === Mode.ORBIT);
    if (mode === Mode.FOLLOW) chaseFresh = true;
}

export function setOrbitCenter(x, y, z) { orbitCenter.set(x, y, z); }

// How far behind the comet the chase camera trails. Pass the destination's
// fit distance so the arrival pose already matches the stop's framing.
// Must stay within controls.minDistance..maxDistance (OrbitControls clamps).
export function setFollowDistance(d) { chaseDistTarget = d; }

export function update(dt, controls, camera, cometPos, cometDir) {
    if (currentMode === Mode.FOLLOW) {
        const k = 1 - Math.exp(-FOLLOW_RATE * dt);
        if (chaseFresh) {
            // Seamless hand-off: start from the view the user is looking at
            chaseFresh = false;
            chaseDir.subVectors(controls.target, camera.position);
            chaseDist = Math.max(chaseDir.length(), 1e-3);
            chaseDir.normalize();
            lookOffset.subVectors(controls.target, cometPos);
        }
        _v.copy(chaseDir).lerp(cometDir, k);
        if (_v.lengthSq() > 1e-6) chaseDir.copy(_v).normalize(); // skip the exact 180° case
        chaseDist += (chaseDistTarget - chaseDist) * k;
        lookOffset.multiplyScalar(1 - k);

        controls.target.copy(cometPos).addScaledVector(chaseDir, FOLLOW_AHEAD * chaseDist).add(lookOffset);
        camera.position.copy(controls.target)
            .addScaledVector(chaseDir, -chaseDist)
            .addScaledVector(camera.up, FOLLOW_UP * chaseDist);
    } else {
        controls.target.lerp(orbitCenter, 1 - Math.exp(-ORBIT_RATE * dt));
    }

    shiftNow += (shiftTarget - shiftNow) * (1 - Math.exp(-SHIFT_RATE * dt));
    if (shiftNow < 0.002 && shiftTarget === 0) {
        if (camera.view?.enabled) camera.clearViewOffset();
    } else {
        const W = window.innerWidth, H = window.innerHeight, side = isPanelSideLayout();
        camera.setViewOffset(W, H, side ? shiftNow * SHIFT_SIDE_X * W : 0,
                                   side ? 0 : shiftNow * SHIFT_BOTTOM_Y * H, W, H);
    }

    controls.update();
}
