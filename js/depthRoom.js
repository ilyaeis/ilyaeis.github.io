// Depth view of the flat. Self-initialising (loaded after room.js).
// The whole flat (the apartment box, world.js ROOM_BOX) can be drawn as
// depth: each splat's colour = its distance from the eye, on a log ramp
// (DEPTH_NEAR_M .. DEPTH_FAR_M), bright near to dark far. The HUD button
// .walk-depth switches it in walk mode (the walk starts with it off);
// walking into the depth room (the room stop, `roomBox`; also ?go=depth-room)
// switches it on.
// A Spark worldModifier dyno block on the room mesh, attached on the first
// walk ('journey:explore' enter); off (RGB) outside walk mode.
// Spark regenerates all splats on updateVersion(), so while it is on the
// eye uniform changes only when the eye moved more than MOVE_M (looking
// round costs nothing), and at most UPDATE_SLOW_HZ while frames are slow.
// A legend (near .. far in metres) shows in the bottom bar while it is on.

import * as THREE from 'three';
import { camera } from './attractors.js';
import { stops } from './world.js';
import { apartment, worldToRoom, M_PER_UNIT, whenRoomReady, roomMesh } from './room.js';

// ── Tuning ─────────────────────────────────────────────────────────
const DEPTH_NEAR_M = 0.5;            // ramp start (bright), metres from the eye
const DEPTH_FAR_M = 6;               // ramp end (dark)
// Near -> far: part of "inferno" (perceptual, lightness falls steadily)
const RAMP = [[0.98, 0.87, 0.35], [0.98, 0.56, 0.04], [0.80, 0.26, 0.28], [0.53, 0.13, 0.42], [0.26, 0.04, 0.41]];
const DEPTH_GAIN = 0.75;             // the room is dimmed (room.js); this keeps the ramp clear and under the bloom threshold
const MOVE_M = 0.01;                 // regenerate only when the eye moved this far (m)
const SLOW_DT = 1 / 30;              // s: frames slower than this (smoothed) ...
const UPDATE_SLOW_HZ = 10;           // ... update the colours at most this often
const EDGE = 0.02;                   // room units: soft edge of the apartment mask (GLSL smoothstep needs a width)

let roomStop = null;                 // the room stop (world.js builds stops[] after this module loads)
const legend = document.querySelector('.depth-legend');
const button = document.querySelector('.walk-depth');
if (legend) {
    legend.querySelector('i').style.background = 'linear-gradient(90deg, ' +
        RAMP.map(c => 'rgb(' + c.map(v => Math.round(v * 255)).join(',') + ')').join(', ') + ')';
}

const metresToWorld = (m) => m / M_PER_UNIT * apartment.scale;

let u = null;                        // { uOn, uCam } once built
let build = null;
let walking = false;
let wanted = false;                  // the visitor's switch (the button, or walking into the depth room)
let inDepthRoom = false;
let lastUpdate = 0, dtAvg = 1 / 60, lastNow = 0;
const _v = new THREE.Vector3(), _r = new THREE.Vector3();

async function buildDepth() {
    await whenRoomReady();
    const { dyno } = await import('@sparkjsdev/spark');
    const { dynoBlock, splitGsplat, combineGsplat, dynoFloat, dynoVec3, dynoConst,
            sub, mul, div, dot, distance, clamp, mix, smoothstep, max, log } = dyno;
    const uOn = dynoFloat(0), uCam = dynoVec3(new THREE.Vector3());
    const f = (x) => dynoConst('float', x);
    const near = f(metresToWorld(DEPTH_NEAR_M)), far = f(metresToWorld(DEPTH_FAR_M));
    // world -> room units (x, z): dot products with the apartment axes / scale
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(apartment.quaternion).divideScalar(apartment.scale);
    const az = new THREE.Vector3(0, 0, 1).applyQuaternion(apartment.quaternion).divideScalar(apartment.scale);
    const O = dynoConst('vec3', apartment.position.clone());
    const AX = dynoConst('vec3', ax), AZ = dynoConst('vec3', az);
    // the apartment box, x and z (room units)
    const min = [apartment.box.min[0], apartment.box.min[2]], bmax = [apartment.box.max[0], apartment.box.max[2]];
    const e = EDGE / 2;
    const C = RAMP.map(c => dynoConst('vec3', new THREE.Vector3(...c).multiplyScalar(DEPTH_GAIN)));
    const F0 = f(0), F1 = f(1), FN = f(RAMP.length - 1);
    const block = dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
        const { center, rgb } = splitGsplat(gsplat).outputs;
        // log ramp of the distance to the eye: 0 at near, 1 at far
        const d01 = clamp(div(log(div(max(distance(center, uCam), near), near)), log(div(far, near))), F0, F1);
        let ramp = C[0];
        const x = mul(d01, FN);
        for (let i = 1; i < C.length; i++) ramp = mix(ramp, C[i], clamp(sub(x, f(i - 1)), F0, F1));
        // the apartment box (x, z), soft edge
        const rel = sub(center, O);
        const rx = dot(rel, AX), rz = dot(rel, AZ);
        const inX = mul(smoothstep(f(min[0] - e), f(min[0] + e), rx), sub(F1, smoothstep(f(bmax[0] - e), f(bmax[0] + e), rx)));
        const inZ = mul(smoothstep(f(min[1] - e), f(min[1] + e), rz), sub(F1, smoothstep(f(bmax[1] - e), f(bmax[1] + e), rz)));
        return { gsplat: combineGsplat({ gsplat, rgb: mix(rgb, ramp, mul(mul(inX, inZ), uOn)) }) };
    });
    roomMesh.worldModifier = block;   // (room.js moves it to the full splat when that replaces the preview)
    roomMesh.updateGenerator();
    u = { uOn, uCam };
    sync();
}

// Depth shows while walking and switched on; the button and the legend follow
const isOn = () => walking && wanted;
function sync() {
    const on = isOn();
    button?.setAttribute('aria-pressed', String(wanted));
    if (legend && legend.hidden === on) {
        legend.hidden = !on;
        document.body.classList.toggle('depth-on', on);
    }
    if (!u || u.uOn.value === (on ? 1 : 0)) return;
    u.uOn.value = on ? 1 : 0;
    if (on) u.uCam.value.copy(camera.getWorldPosition(_v));
    roomMesh.updateVersion();
}
function toggleDepth() { wanted = !wanted; sync(); }
button?.addEventListener('click', toggleDepth);

function inRoom(p) {
    const r = worldToRoom(_r.copy(p)), b = roomStop.roomBox;
    return r.x > b.min[0] && r.x < b.max[0] && r.z > b.min[1] && r.z < b.max[1];
}

function tick(now) {
    requestAnimationFrame(tick);
    const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.25) : 1 / 60;
    lastNow = now;
    dtAvg += (dt - dtAvg) * 0.1;
    if (!walking) return;
    camera.getWorldPosition(_v);
    // walking into the depth room switches depth on (once per entry)
    const inside = inRoom(_v);
    if (inside && !inDepthRoom && !wanted) { wanted = true; sync(); }
    inDepthRoom = inside;
    if (!isOn() || !u) return;
    if (_v.distanceTo(u.uCam.value) > metresToWorld(MOVE_M) &&
        (dtAvg < SLOW_DT || now - lastUpdate >= 1000 / UPDATE_SLOW_HZ)) {
        u.uCam.value.copy(_v);
        roomMesh.updateVersion();       // uniforms changed: regenerate
        lastUpdate = now;
    }
}

window.addEventListener('journey:explore', (e) => {
    roomStop ??= stops.find(s => s.roomBox);
    if (!roomStop) return;
    walking = e.detail?.phase === 'enter';
    if (walking) { build ??= buildDepth(); wanted = false; inDepthRoom = false; }   // each walk starts in colour
    sync();
});
requestAnimationFrame(tick);
