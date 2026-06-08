// ── Camera Controller ──────────────────────────────────────────────
// All transitions are smooth: slow start → accelerate → settle.
// ORBIT: smoothly converges to orbit center.
// FOLLOW: a chase camera — it captures its offset to the comet once,
//   then *translates* with the comet (target + camera move together)
//   so the comet stays put on screen and the world streaks by. It never
//   pivots in place, which is what caused the rapid 360s.
// Switching between modes always uses smooth blending.

import * as THREE from 'three';

export const Mode = { ORBIT: 0, FOLLOW: 1 };

let currentMode = Mode.ORBIT;
const orbitCenter = new THREE.Vector3(0, 0, 0);

// Transition timing
const FOLLOW_DELAY = 0.15;      // brief beat before the chase eases in
const FOLLOW_RAMP = 2.5;        // seconds to ramp to full follow speed
const FOLLOW_LERP_START = 0.3;  // very slow at start
const FOLLOW_LERP_END = 6.0;    // full tracking speed

const ORBIT_RAMP = 2.0;         // seconds to ramp to full orbit convergence
const ORBIT_LERP_START = 0.5;   // slow settle into orbit
const ORBIT_LERP_END = 6.0;     // full convergence

let modeTimer = 0; // time since last mode switch

// Chase-camera offset: the camera→comet vector captured when FOLLOW
// begins. It trails at this offset, but while flying it eases toward the
// next scene's framing (followAim) so the camera is already composed
// before the comet arrives — no re-frame snap at the destination.
const followOffset = new THREE.Vector3();
let followOffsetCaptured = false;
const followAim = new THREE.Vector3();
let hasFollowAim = false;

const AIM_LERP_START = 0.15;    // ease the re-frame in gently…
const AIM_LERP_END = 2.0;       // …then settle the new framing well before arrival

// Scratch for the offset slerp (direction rotated, distance lerped —
// keeps the camera a safe distance even if the next scene is behind it).
const _curDir = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _qFull = new THREE.Quaternion();
const _qStep = new THREE.Quaternion();

// Tell the chase camera the offset it should hold once it reaches the
// next scene (camera position relative to the orbit target). Pass null
// to keep the captured offset unchanged.
export function setFollowAim(offset) {
    if (offset) { followAim.copy(offset); hasFollowAim = true; }
    else hasFollowAim = false;
}

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
    if (mode === Mode.FOLLOW) followOffsetCaptured = false; // re-grab on first frame
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
        // Capture the viewing offset the instant we start chasing, so the
        // camera keeps the same relative position as it trails the comet.
        if (!followOffsetCaptured) {
            followOffset.subVectors(camera.position, controls.target);
            followOffsetCaptured = true;
        }
        if (modeTimer > FOLLOW_DELAY && pointPosition) {
            const rampT = Math.min((modeTimer - FOLLOW_DELAY) / FOLLOW_RAMP, 1);
            const speed = easeSpeed(rampT, FOLLOW_LERP_START, FOLLOW_LERP_END);
            controls.target.lerp(pointPosition, Math.min(1, speed * dt));

            // Gradually rotate the trailing offset toward the destination's
            // framing — the camera composes the next scene mid-flight.
            if (hasFollowAim) {
                const f = Math.min(1, easeSpeed(rampT, AIM_LERP_START, AIM_LERP_END) * dt);
                const curLen = followOffset.length();
                const aimLen = followAim.length();
                if (curLen > 1e-6 && aimLen > 1e-6) {
                    _curDir.copy(followOffset).divideScalar(curLen);
                    _aimDir.copy(followAim).divideScalar(aimLen);
                    _qFull.setFromUnitVectors(_curDir, _aimDir); // shortest arc, robust at 180°
                    _qStep.identity().slerp(_qFull, f);
                    _curDir.applyQuaternion(_qStep);
                    followOffset.copy(_curDir).multiplyScalar(curLen + (aimLen - curLen) * f);
                }
            }

            // Move the camera rigidly with the target — pure translation
            // plus the eased offset, so the view can't whip around.
            camera.position.copy(controls.target).add(followOffset);
        }
    } else {
        // ORBIT: also ramp up smoothly (slow→fast settle)
        const rampT = Math.min(modeTimer / ORBIT_RAMP, 1);
        const speed = easeSpeed(rampT, ORBIT_LERP_START, ORBIT_LERP_END);
        controls.target.lerp(orbitCenter, Math.min(1, speed * dt));
    }

    controls.update();
}
