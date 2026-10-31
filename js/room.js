// The apartment: a Gaussian splat of a real flat (Zip-NeRF "london" scene,
// CC BY 4.0, reconstructed with gsplat) with the six R&D splat objects
// (objects.js) inside. Self-initialising. It listens for the 'journey:stop'
// event (see stopPanel.js), loads Spark, the splat and the objects lazily a
// stop before the apartment (wantsRoom), and fades them in as the camera
// comes close. world.js places the apartment frame (`apartment`); this module
// only renders into it, so the orchestrator and the camera need no changes.

import * as THREE from 'three';
import { scene, renderer, camera, bloomPass, isMobile, setStarVisibility } from './attractors.js';
import { apartment, getInsideFade, setRoomFade, StopType, catalog } from './world.js';

// The apartment API for the add-ons (walk.js, depthTool.js): its frame
// (position, quaternion, scale), room <-> world points and metres per unit
export { apartment, roomToWorld, worldToRoom, M_PER_UNIT } from './world.js';
import { setIntroRoomHidden } from './intro3d.js';

// ── Tuning ─────────────────────────────────────────────────────────
const ROOM_URL = 'assets/room/apartment.sog';
const ROOM_LITE_URL = 'assets/room/apartment-lite.sog';   // mobile
// The stops inside the apartment, by universe (the R&D objects, the landing)
const APARTMENT_UNIVERSES = ['rnd', 'contact'];
// Fade by the camera distance outside the apartment box, in room units
// (0 inside). From outside it reads as a dollhouse (the ceiling is cut),
// so it shows from far: the comet sees it before it dives in.
const FADE_START = 8;                // opacity 0 at this distance or more (≈ 37 world units)
const FADE_FULL = 3;                 // opacity 1 at this distance or less
// Indoors the outside world's lines (rocks, galaxies, intro) and the stars
// would shine through the walls: they fade as the camera reaches the walls
const INDOOR_FADE = [0.6, 0.05];     // outside distance where that fade starts .. is done
// The bright room must not drown the glowing strokes. Dim the splat colors,
// and raise the bloom threshold while the room shows (strokes are HDR > 1).
export const ROOM_BRIGHTNESS = 0.42;
// The objects have baked white light; the room is lit by warm lamps and is
// dimmed. Tint and dim the objects the same way, so they sit in the scene
// (× each spot's `light` from world.js OBJECT_SPOTS: lamps near or not)
const OBJECT_LIGHT = [0.44, 0.37, 0.29];
const BLOOM_THRESHOLD_IN_ROOM = 0.75; // the HDR strokes (halo, text, comet) bloom, the white objects do not
const OBJECT_SPLATS = isMobile ? 5000 : 16000;   // per object: fewer read soft up close
// SparkRenderer knobs, matched to how the room was trained (gsplat):
// minAlpha 1/255 cuts the faint tails the trainer also skips (Spark: 0.5/255);
// maxStdDev 3 is the trainer's splat extent (Spark: √8). blurAmount 0.3 is
// the screen-space blur of antialiased training (keep it); focalAdjustment 1,
// preBlurAmount 0 and falloff 1 are Spark's defaults, left as they are.
// sortRadial stays on (default): no visible change in stills, and the order
// does not flip when the camera only turns. Colour space: Spark writes linear
// into the composer target (encodeLinear), and the bloom pass draws it to the
// screen with sRGB encoding, so the default is right: do not force it off.
const SPARK_OPTIONS = { minAlpha: 1 / 255, maxStdDev: 3.0 };

const creditEl = document.querySelector('.room-credit');

let bloomOutside = 0.1;               // read from the bloom pass on load
let group = null;                     // the apartment frame
const meshes = [];                    // splat meshes (room + objects): opacity
const objects = [];                   // object meshes: idle animation
// For depthTool.js (lens + raycast): the room mesh once loaded, and the object meshes
export let roomMesh = null;
export const objectMeshes = [];
let loading = false;
let time = 0, lastNow = 0;
const _p = new THREE.Vector3();

// Camera distance outside the apartment box, room units (0 inside)
function outsideDistance() {
    _p.copy(camera.position);
    group.worldToLocal(_p);
    const b = apartment.box;
    const dx = Math.max(b.min[0] - _p.x, 0, _p.x - b.max[0]);
    const dy = Math.max(b.min[1] - _p.y, 0, _p.y - b.max[1]);
    const dz = Math.max(b.min[2] - _p.z, 0, _p.z - b.max[2]);
    return Math.hypot(dx, dy, dz);
}

// Opacity follows the camera place (no timers: frame-rate independent),
// and hides inside the tunnel (the warp cross-fades the two worlds).
function tick(now) {
    requestAnimationFrame(tick);
    const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.1) : 0;
    lastNow = now;
    const d = outsideDistance();
    const a = (1 - THREE.MathUtils.smoothstep(d, FADE_FULL, FADE_START)) * (1 - getInsideFade());
    const indoor = 1 - THREE.MathUtils.smoothstep(d, INDOOR_FADE[1], INDOOR_FADE[0]);
    setRoomFade(indoor);
    setIntroRoomHidden(indoor > 0.5);
    for (const m of meshes) { m.opacity = a; m.visible = a > 0.001; }
    group.visible = a > 0.001;
    bloomPass.threshold = bloomOutside + a * (BLOOM_THRESHOLD_IN_ROOM - bloomOutside);
    setStarVisibility(1 - indoor * (1 - getInsideFade()));
    if (!group.visible) return;
    time += dt;
    objects.forEach((m, i) => m.userData.idle(time + i * 1.3));
}

async function loadRoom() {
    if (group || loading) return;
    loading = true;
    try {
        // objects.js imports Spark statically, so it stays behind this dynamic import
        const [{ SplatMesh, SparkRenderer }, { buildObject, mulberry32, contactShadow, FOOT }] =
            await Promise.all([import('@sparkjsdev/spark'), import('./objects.js')]);
        const spark = new SparkRenderer({ renderer, ...SPARK_OPTIONS });
        spark.renderOrder = -10;   // splats first, so the additive strokes and trail draw over them
        scene.add(spark);
        const g = new THREE.Group();
        g.position.copy(apartment.position);
        g.quaternion.copy(apartment.quaternion);
        g.scale.setScalar(apartment.scale);
        const room = new SplatMesh({ url: isMobile ? ROOM_LITE_URL : ROOM_URL });
        room.recolor = new THREE.Color(ROOM_BRIGHTNESS, ROOM_BRIGHTNESS, ROOM_BRIGHTNESS);
        meshes.push(room);
        g.add(room);
        apartment.objects.forEach((o, i) => {
            const holder = new THREE.Group();
            holder.position.set(o.x, o.y, o.z);
            holder.rotation.y = o.yaw;
            holder.scale.setScalar(o.scale);
            const m = buildObject(o.name, { count: OBJECT_SPLATS, rng: mulberry32(11 + i) });
            m.recolor = new THREE.Color(...OBJECT_LIGHT.map(c => c * (o.light ?? 1)));
            holder.add(m);
            meshes.push(m, ...(m.userData.fans ?? []));
            if (FOOT[o.name]) {                    // (the wall board has none)
                const shadow = contactShadow(...FOOT[o.name]);
                holder.add(shadow);
                meshes.push(shadow);
            }
            objects.push(m);
            objectMeshes.push(m, ...(m.userData.fans ?? []));
            g.add(holder);
        });
        for (const m of meshes) { m.opacity = 0; m.visible = false; }
        g.visible = false;
        bloomOutside = bloomPass.threshold;
        await room.initialized;
        group = g;
        roomMesh = room;
        scene.add(g);
        g.updateMatrixWorld(true);
        requestAnimationFrame(tick);
    } catch (err) {
        console.error('apartment load failed', err);
        loading = false;
    }
}

// When to load (Spark and the splat, about 15 MB): by universe, never by
// index. On entering a stop in the apartment, or in the universe right
// before it in route order (the Giraffe360 rock: the work path; the flight
// from it is short). Elsewhere only when a flight into the apartment starts
// ('leave' with `to`: the warp out from the last project is a long flight).
// So the intro, the traits, the education rocks and the projects (also by
// ?go, or an open project app) load nothing.
const route = catalog.filter(e => e.navigable);              // index = the stop index
const inApartment = e => APARTMENT_UNIVERSES.includes(e?.universe);
const leadUniverse = route[route.findIndex(inApartment) - 1]?.universe;
function wantsRoom({ phase, universe, to }) {
    if (phase === 'enter') return inApartment({ universe }) || universe === leadUniverse;
    return to !== undefined && inApartment(route[to]);
}

window.addEventListener('journey:stop', e => {
    const { phase, universe, type } = e.detail;
    if (wantsRoom(e.detail)) loadRoom();
    // The credit shows at the apartment stops and the landing
    if (creditEl && (universe === 'rnd' || type === StopType.LANDING)) creditEl.hidden = phase !== 'enter';
});
