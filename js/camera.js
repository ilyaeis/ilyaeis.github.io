// ── Camera Controller ──────────────────────────────────────────────
// ORBIT: the target eases onto a fixed center (stops); the user may drag.
// FOLLOW: a chase camera. It sits behind the comet along the smoothed
//   travel direction, a little above it, and looks at a point just ahead
//   of the comet, so the comet is always near screen center.
// Smoothness: every eased value is a critically damped spring (smoothDamp),
// so speed never jumps. The heading turns as yaw and pitch springs with a
// capped speed, and the pitch stays off the poles. Mode hand-offs keep the
// current pose and velocity and blend out the difference, so nothing snaps
// when the phase changes.
import * as THREE from 'three';

export const Mode = { ORBIT: 0, FOLLOW: 1 };

// ── Tuning ─────────────────────────────────────────────────────────
const ORBIT_TIME = 0.5;        // s: smooth time of the target onto the orbit center
const FOLLOW_UP = 0.18;        // camera height above the path, × chase distance
const FOLLOW_AHEAD = 0.35;     // look point ahead of the comet, × chase distance
const DIST_TIME = 0.6;         // s: smooth time of the chase distance
const DIST_MAX_SPEED = 2.0;    // u/s: a big change (rock -> wide project frame) eases in, so the hand-off blend does not swing the view
const HANDOFF_TIME = 0.6;      // s: smooth time of the blend from the old view into the chase pose
const TURN_TIME = 0.8;         // s: smooth time of the heading (yaw and pitch)
const TURN_MAX_SPEED = THREE.MathUtils.degToRad(55);  // rad/s: yaw / pitch speed cap
const MAX_CHASE_PITCH = THREE.MathUtils.degToRad(50); // the chase view never looks steeper up/down (no spin near the pole)

let currentMode = Mode.ORBIT;
const orbitCenter = new THREE.Vector3();
const targetVel = new THREE.Vector3();        // ORBIT target spring velocity

// Chase state
const chaseDir = new THREE.Vector3(0, 0, -1); // smoothed travel direction (from yaw, pitch)
const yaw = { x: 0, v: 0 }, pitch = { x: 0, v: 0 }; // heading springs (rad)
const dist = { x: 2.5, v: 0 };                // chase distance spring
let chaseDistTarget = 2.5;                    // wanted distance behind the comet
const camErr = new THREE.Vector3(), camErrVel = new THREE.Vector3();   // hand-off blend (camera)
const lookErr = new THREE.Vector3(), lookErrVel = new THREE.Vector3(); // hand-off blend (target)
// The blend errors chase a goal that itself eases to zero (two springs in a
// row), so the blend starts with zero acceleration: no jolt at departures
// from wide stops, where the orbit pose is far from the chase pose.
const camErrGoal = new THREE.Vector3(), camErrGoalVel = new THREE.Vector3();
const lookErrGoal = new THREE.Vector3(), lookErrGoalVel = new THREE.Vector3();
let chaseFresh = false;                       // first FOLLOW frame: seed from the current view
// Arrival: over the end of a flight the chase pose blends into the stop's
// VIEW pose (look at the stop centre, camera at the face-on spot), so the
// focus never jumps from the comet to the stop when the flight ends.
const arrive = { w: 0, target: new THREE.Vector3(), pos: new THREE.Vector3() };
// Rail (indoor flights): a pose that rides the comet's own path (orchestrator),
// so the camera stays in the free space the comet flies through (doorways).
// Blended over the chase pose by w, before the arrival blend.
const rail = { w: 0, target: new THREE.Vector3(), pos: new THREE.Vector3() };

// Measured pose velocity (for hand-offs)
export const cameraVel = new THREE.Vector3(); // read-only outside
const lookVel = new THREE.Vector3();
const lastCam = new THREE.Vector3(), lastLook = new THREE.Vector3();
let hasLast = false;

const _v = new THREE.Vector3(), _axis = new THREE.Vector3();
const _look = new THREE.Vector3(), _cam = new THREE.Vector3();
const ZERO = new THREE.Vector3();

// ── Critically damped spring (Unity-style SmoothDamp) ──────────────
// Exact enough at any dt; the velocity is continuous by construction.
function dampFactor(smoothTime, dt) {
    const w = 2 / smoothTime, x = w * dt;
    return { w, e: 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x) };
}
// maxSpeed (optional) caps the speed, as in Unity
export function smoothDampScalar(state, target, smoothTime, dt, maxSpeed = Infinity) {
    const { w, e } = dampFactor(smoothTime, dt);
    const maxChange = maxSpeed * smoothTime;
    const change = THREE.MathUtils.clamp(state.x - target, -maxChange, maxChange);
    target = state.x - change;
    const temp = (state.v + w * change) * dt;
    state.v = (state.v - w * temp) * e;
    state.x = target + (change + temp) * e;
}
export function smoothDampVec(cur, target, vel, smoothTime, dt) {
    const { w, e } = dampFactor(smoothTime, dt);
    _v.subVectors(cur, target);                              // change
    _axis.copy(vel).addScaledVector(_v, w).multiplyScalar(dt); // temp
    vel.addScaledVector(_axis, -w).multiplyScalar(e);
    cur.copy(target).add(_v.add(_axis).multiplyScalar(e));
}

// Heading as yaw (about world up) and pitch. Yaw is kept when the
// direction is almost vertical, so a steep dive does not spin the view.
function seedHeading(dir) {
    if (dir.x * dir.x + dir.z * dir.z > 1e-4) yaw.x = Math.atan2(dir.x, dir.z);
    pitch.x = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)), -MAX_CHASE_PITCH, MAX_CHASE_PITCH);
    yaw.v = pitch.v = 0;
    headingToDir();
}
function turnHeading(dir, dt) {
    let goalYaw = yaw.x;
    if (dir.x * dir.x + dir.z * dir.z > 0.0025) goalYaw = Math.atan2(dir.x, dir.z);
    const dYaw = Math.atan2(Math.sin(goalYaw - yaw.x), Math.cos(goalYaw - yaw.x)); // shortest way round
    const goalPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)), -MAX_CHASE_PITCH, MAX_CHASE_PITCH);
    smoothDampScalar(yaw, yaw.x + dYaw, TURN_TIME, dt, TURN_MAX_SPEED);
    smoothDampScalar(pitch, goalPitch, TURN_TIME, dt, TURN_MAX_SPEED);
    headingToDir();
}
function headingToDir() {
    const c = Math.cos(pitch.x);
    chaseDir.set(c * Math.sin(yaw.x), Math.sin(pitch.x), c * Math.cos(yaw.x));
}

// ── Screen shift (HTML panel room) ─────────────────────────────────
// Pushes the scene center toward the left (side layout) or the top
// (bottom layout) so an HTML panel can sit beside the stop. Pure
// projection offset (camera.setViewOffset): orbit target and user
// rotation still pivot on the stop center.
// Keep PANEL_SIDE_QUERY identical to the media query in css/style.css.
export const PANEL_SIDE_QUERY = '(min-width: 700px) and (orientation: landscape)';
const SHIFT_SIDE_X = 0.25;      // rock center at 25% of width
const SHIFT_BOTTOM_Y = 0.18;    // rock center at ~32% of height
const SHIFT_TIME = 0.8;         // s: smooth time; ramps during the flight
let shiftTarget = 0;
const shift = { x: 0, v: 0 };
export function setScreenShift(on, immediate = false) {
    shiftTarget = on ? 1 : 0;
    if (immediate) { shift.x = shiftTarget; shift.v = 0; }
}
export function isPanelSideLayout() { return window.matchMedia(PANEL_SIDE_QUERY).matches; }

export function init(controls) { controls.target.set(0, 0, 0); currentMode = Mode.ORBIT; }

export function setMode(mode, controls) {
    if (mode === currentMode) return;
    currentMode = mode;
    controls.autoRotate = (mode === Mode.ORBIT);
    if (mode === Mode.FOLLOW) chaseFresh = true;
    else targetVel.copy(lookVel); // ORBIT: the target keeps its motion and eases onto the center
}

// Dev only (dev/camlog.html)
export function devState() { return { mode: currentMode, chaseDist: dist.x, chaseDistTarget, shift: shift.x }; }

export function setOrbitCenter(x, y, z) { orbitCenter.set(x, y, z); }

// w = 0..1 (the caller eases it); target = stop centre, pos = VIEW camera spot
export function setRail(pos, target, w) {
    rail.w = w;
    if (pos) rail.pos.copy(pos);
    if (target) rail.target.copy(target);
}

export function setArrival(target, pos, w) {
    arrive.w = w;
    if (target) arrive.target.copy(target);
    if (pos) arrive.pos.copy(pos);
}

// How far behind the comet the chase camera trails. Pass the destination's
// fit distance so the arrival pose already matches the stop's framing.
// Must stay within controls.minDistance..maxDistance (OrbitControls clamps).
export function setFollowDistance(d) { chaseDistTarget = d; }

// Chase pose for the current heading and distance (no hand-off blend)
function chasePose(cometPos, camera) {
    _look.copy(cometPos).addScaledVector(chaseDir, FOLLOW_AHEAD * dist.x);
    _cam.copy(_look).addScaledVector(chaseDir, -dist.x).addScaledVector(camera.up, FOLLOW_UP * dist.x);
}

export function update(dt, controls, camera, cometPos, cometDir) {
    if (dt <= 0) return;
    if (currentMode === Mode.FOLLOW) {
        if (chaseFresh) {
            // Hand-off: start from the view the user is looking at
            _v.subVectors(controls.target, camera.position);
            dist.x = Math.max(_v.length(), 1e-3);
            dist.v = 0;
            seedHeading(_v.normalize()); // pitch is clamped; the blend below absorbs the change
        } else {
            turnHeading(cometDir, dt);
            smoothDampScalar(dist, chaseDistTarget, DIST_TIME, dt, DIST_MAX_SPEED);
        }
        chasePose(cometPos, camera);
        if (chaseFresh) {
            // Keep the current pose and its velocity; blend the difference out.
            // The pose already moved this frame, so the blend starts next frame.
            chaseFresh = false;
            camErr.subVectors(camera.position, _cam);
            lookErr.subVectors(controls.target, _look);
            camErrVel.copy(cameraVel);
            lookErrVel.copy(lookVel);
            camErrGoal.copy(camErr); camErrGoalVel.set(0, 0, 0);
            lookErrGoal.copy(lookErr); lookErrGoalVel.set(0, 0, 0);
        } else {
            smoothDampVec(camErrGoal, ZERO, camErrGoalVel, HANDOFF_TIME / 2, dt);
            smoothDampVec(lookErrGoal, ZERO, lookErrGoalVel, HANDOFF_TIME / 2, dt);
            smoothDampVec(camErr, camErrGoal, camErrVel, HANDOFF_TIME / 2, dt);
            smoothDampVec(lookErr, lookErrGoal, lookErrVel, HANDOFF_TIME / 2, dt);
        }
        controls.target.copy(_look).add(lookErr);
        camera.position.copy(_cam).add(camErr);
        if (rail.w > 0) {
            controls.target.lerp(rail.target, rail.w);
            camera.position.lerp(rail.pos, rail.w);
        }
        if (arrive.w > 0) {
            controls.target.lerp(arrive.target, arrive.w);
            camera.position.lerp(arrive.pos, arrive.w);
        }
    } else {
        smoothDampVec(controls.target, orbitCenter, targetVel, ORBIT_TIME, dt);
    }

    smoothDampScalar(shift, shiftTarget, SHIFT_TIME, dt);
    if (shift.x < 0.002 && shiftTarget === 0) {
        if (camera.view?.enabled) camera.clearViewOffset();
    } else {
        const W = window.innerWidth, H = window.innerHeight, side = isPanelSideLayout();
        camera.setViewOffset(W, H, side ? shift.x * SHIFT_SIDE_X * W : 0,
                                   side ? 0 : shift.x * SHIFT_BOTTOM_Y * H, W, H);
    }

    controls.update(dt); // dt: auto-rotate speed independent of frame rate

    if (hasLast) {
        cameraVel.subVectors(camera.position, lastCam).divideScalar(dt);
        lookVel.subVectors(controls.target, lastLook).divideScalar(dt);
    }
    lastCam.copy(camera.position);
    lastLook.copy(controls.target);
    hasLast = true;
}
