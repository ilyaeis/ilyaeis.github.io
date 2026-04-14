// ── Camera Controller ──────────────────────────────────────────────
// All transitions are smooth: slow start → accelerate → settle.
// ORBIT: smoothly converges to orbit center.
// FOLLOW: delay, then slow→fast lerp to track flying point.
// Switching between modes always uses smooth blending.

import * as THREE from 'three';

export const Mode = { ORBIT: 0, FOLLOW: 1 };

let currentMode = Mode.ORBIT;
const orbitCenter = new THREE.Vector3(0, 0, 0);

// Transition timing
const FOLLOW_DELAY = 0.5;       // wait before camera starts moving
const FOLLOW_RAMP = 2.5;        // seconds to ramp to full follow speed
const FOLLOW_LERP_START = 0.3;  // very slow at start
const FOLLOW_LERP_END = 6.0;    // full tracking speed

const ORBIT_RAMP = 2.0;         // seconds to ramp to full orbit convergence
const ORBIT_LERP_START = 0.5;   // slow settle into orbit
const ORBIT_LERP_END = 6.0;     // full convergence

let modeTimer = 0; // time since last mode switch

export function init(controls) {
    controls.target.set(0, 0, 0);
    currentMode = Mode.ORBIT;
    modeTimer = 10; // already settled
}

export function setMode(mode, controls) {
    if (mode === currentMode) return;
    currentMode = mode;
    modeTimer = 0;
    controls.autoRotate = (mode === Mode.ORBIT);
}

export function setOrbitCenter(x, y, z) {
    orbitCenter.set(x, y, z);
}

// Slow→fast easing curve
function easeSpeed(t, start, end) {
    const e = t * t * (3 - 2 * t); // smoothstep: slow start, accelerate, gentle end
    return start + (end - start) * e;
}

export function update(dt, controls, camera, pointPosition) {
    modeTimer += dt;

    if (currentMode === Mode.FOLLOW) {
        if (modeTimer > FOLLOW_DELAY && pointPosition) {
            const rampT = Math.min((modeTimer - FOLLOW_DELAY) / FOLLOW_RAMP, 1);
            const speed = easeSpeed(rampT, FOLLOW_LERP_START, FOLLOW_LERP_END);
            controls.target.lerp(pointPosition, Math.min(1, speed * dt));
        }
    } else {
        // ORBIT: also ramp up smoothly (slow→fast settle)
        const rampT = Math.min(modeTimer / ORBIT_RAMP, 1);
        const speed = easeSpeed(rampT, ORBIT_LERP_START, ORBIT_LERP_END);
        controls.target.lerp(orbitCenter, Math.min(1, speed * dt));
    }

    controls.update();
}
