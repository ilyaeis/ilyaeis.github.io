// The landing is a real room: a Gaussian splat (Zip-NeRF "london" scene,
// CC BY 4.0) around the camera. Self-initialising. It listens for the
// 'journey:stop' event (see stopPanel.js), loads the splat lazily a few
// stops before the landing, and fades it in during the last part of the
// flight. It is placed from the landing stop's frame, so the orchestrator
// and the camera need no changes.
//
// Room frame (from the .sog): +Y up, centre at the origin, x ±1.0,
// y ±0.5, z ±0.85, 1 unit = 3.63 m. The bay windows are on the -Z side.
// At the landing the camera sits at stop.center - stop.normal * fit and
// looks at the centre. So room +Z = -stop.normal (towards the camera),
// room +Y = stop.up, room +X = stop.right.

import * as THREE from 'three';
import { scene, renderer, camera, controls, bloomPass, isMobile } from './attractors.js';
import { stops, StopType } from './world.js';

// ── Tuning ─────────────────────────────────────────────────────────
const ROOM_URL = 'assets/room/room.sog';
const ROOM_LITE_URL = 'assets/room/room-lite.sog';   // mobile
const PREFETCH_STOPS_BEFORE = 2;     // start loading when entering the stop this many before the landing
// Where the camera and the text plane sit, in room units. The scale
// follows from them: text is (CAM_Z - TEXT_Z) room units ahead of the
// camera, and that is `fit` world units.
const CAM_LOCAL = new THREE.Vector3(0.0, -0.05, 0.25);   // camera: inside, sofa side, ~60% back from the windows
const TEXT_Z = -0.4;                                     // text plane: in front of the window wall (z = -0.65)
// Fade by camera distance to the room centre, in room units. The splat
// is blurry outside the walls, so it shows only once the camera is near.
const FADE_START = 2.2;              // opacity 0 at this distance or more
const FADE_FULL = 1.1;               // opacity 1 at this distance or less
// The bright room must not drown the glowing text. Dim the splat colors,
// and raise the bloom threshold while the room shows (text is HDR > 1).
const ROOM_BRIGHTNESS = 0.42;
const BLOOM_THRESHOLD_IN_ROOM = 0.6;

// Mirror of orchestrator.fitFor() for the LANDING stop (and
// computeFitDistance). Keep in sync with it. halfW/halfH = half size of
// the strokes in world units.
const FIT_MARGIN = 1.25;
function landingFit(stop) {
    const tanV = Math.tan(camera.fov * Math.PI / 360);
    const fit = FIT_MARGIN * Math.max(stop.halfH / tanV, stop.halfW / (tanV * camera.aspect));
    return THREE.MathUtils.clamp(fit, controls.minDistance, controls.maxDistance);
}

const creditEl = document.querySelector('.room-credit');
// stops[] is built by the orchestrator after this module loads, so the
// landing is looked up on first use (by type, never by index).
let landing = null;
let landingIdx = -1;

let bloomOutside = 0.1;               // read from the bloom pass on load
let mesh = null;
let loading = false;
const _basis = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _centre = new THREE.Vector3();

function placeRoom() {
    const fit = landingFit(landing);
    const s = fit / (CAM_LOCAL.z - TEXT_Z);           // world units per room unit
    // room axes in world: x = right, y = up, z = -normal
    _v.copy(landing.normal).negate();
    _basis.makeBasis(landing.right, landing.up, _v);
    mesh.quaternion.setFromRotationMatrix(_basis);
    mesh.scale.setScalar(s);
    // origin = cameraWorld - R * s * CAM_LOCAL, cameraWorld = centre + z_axis * fit
    mesh.position.copy(landing.center).addScaledVector(_v, fit)
        .addScaledVector(landing.right, -s * CAM_LOCAL.x)
        .addScaledVector(landing.up, -s * CAM_LOCAL.y)
        .addScaledVector(_v, -s * CAM_LOCAL.z);
    mesh.updateMatrixWorld(true);
}

// Opacity follows the camera distance to the room centre: no timers,
// so it does not depend on the frame rate.
function tick() {
    requestAnimationFrame(tick);
    const d = camera.position.distanceTo(mesh.position) / mesh.scale.x;
    const t = THREE.MathUtils.clamp((FADE_START - d) / (FADE_START - FADE_FULL), 0, 1);
    const a = t * t * (3 - 2 * t);
    mesh.opacity = a;
    mesh.visible = a > 0.001;
    bloomPass.threshold = bloomOutside + a * (BLOOM_THRESHOLD_IN_ROOM - bloomOutside);
}

async function loadRoom() {
    if (mesh || loading) return;
    loading = true;
    try {
        const { SplatMesh, SparkRenderer } = await import('@sparkjsdev/spark');
        const spark = new SparkRenderer({ renderer });
        spark.renderOrder = -10;   // splats first, so the additive text and trail draw over them
        scene.add(spark);
        mesh = new SplatMesh({ url: isMobile ? ROOM_LITE_URL : ROOM_URL });
        mesh.opacity = 0;
        mesh.recolor = new THREE.Color(ROOM_BRIGHTNESS, ROOM_BRIGHTNESS, ROOM_BRIGHTNESS);
        bloomOutside = bloomPass.threshold;
        mesh.visible = false;
        await mesh.initialized;
        placeRoom();
        scene.add(mesh);
        tick();
        // Aspect can change before the next flight: place again then
        window.addEventListener('journey:stop', e => {
            if (e.detail.phase === 'leave' && e.detail.index === landingIdx - 1) placeRoom();
        });
    } catch (err) {
        console.error('room load failed', err);
        loading = false;
    }
}

window.addEventListener('journey:stop', e => {
    const { phase, index, type } = e.detail;
    if (!landing) {
        landing = stops.find(s => s.type === StopType.LANDING);
        landingIdx = stops.indexOf(landing);
        if (!landing) return;
    }
    if (phase === 'enter' && index >= landingIdx - PREFETCH_STOPS_BEFORE) loadRoom();
    if (creditEl && type === StopType.LANDING) creditEl.hidden = phase !== 'enter';
});
