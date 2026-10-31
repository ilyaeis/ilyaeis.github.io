// Depth lens + measure tool for the apartment splat. Self-initialising.
// A small toolbar (.room-tools) shows at the apartment stops (universe
// 'rnd') and the landing. Depth: a cone round the pointer ray (phones: the
// view centre) recolours the splats by their distance to the camera (a
// Spark worldModifier, attached on first use). Measure: two clicks on the
// splat (raycast on click only) give a line, two dots and "≈ x.xx m".
// While a tool is on, input.js gives it the taps (main.js does not advance
// the journey); Esc turns the tools off.

import * as THREE from 'three';
import { scene, camera, isMobile } from './attractors.js';
import { StopType } from './world.js';
import { apartment, M_PER_UNIT, roomMesh, objectMeshes, ROOM_BRIGHTNESS } from './room.js';
import { setToolOn } from './input.js';

// ── Tuning ─────────────────────────────────────────────────────────
const LENS_TAN = 0.18;               // cone half-angle tangent
const LENS_NEAR_M = 0.3;             // ramp start (warm), metres from the camera
const LENS_FAR_M = 3;                // ramp end (blue), metres (the stops view things 0.5-4 m away)
const RAMP = [[1.0, 0.86, 0.35], [0.95, 0.22, 0.55], [0.12, 0.3, 1.0]];   // near, mid, far
const MIN_RAYCAST_OPACITY = 0.3;     // ignore faint floaters
const DOT_SIZE = 0.008;              // measure dot radius per unit of camera distance (about the same size on screen)
const MEASURE_COLOR = 0xffd36b;
const TAP_PX = 10;                   // same as main.js

const touch = isMobile || window.matchMedia('(pointer: coarse)').matches;
const bar = document.querySelector('.room-tools');
const bDepth = bar.querySelector('[data-tool="depth"]');
const bMeasure = bar.querySelector('[data-tool="measure"]');
const bMark = bar.querySelector('.room-tools-mark');
const hint = bar.querySelector('.room-tools-hint');
const cross = document.querySelector('.room-tools-cross');
const HINT_IDLE = 'Try the depth lens';

let depthOn = false, measureOn = false, ready = false, shown = false;
let lens = null;                     // { uOn, uCam, uRayO, uRayD, uNear, uFar } once built
let lensMeshes = [];
let lensBuild = null;                // the buildLens() promise (built once, on first use)
const pointerNdc = new THREE.Vector2();   // screen centre until the pointer moves
const CENTRE = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const _v = new THREE.Vector3();

const metresToWorld = (m) => m / M_PER_UNIT * apartment.scale;
const worldToMetres = (w) => w / apartment.scale * M_PER_UNIT;

// ── Lens ───────────────────────────────────────────────────────────
async function buildLens() {
    const { dyno } = await import('@sparkjsdev/spark');
    const { dynoBlock, splitGsplat, combineGsplat, dynoFloat, dynoVec3, dynoConst,
            sub, mul, div, dot, length, distance, clamp, mix, smoothstep, step, max } = dyno;
    const u = {
        uOn: dynoFloat(0),
        uCam: dynoVec3(new THREE.Vector3()),
        uRayO: dynoVec3(new THREE.Vector3()),
        uRayD: dynoVec3(new THREE.Vector3(0, 0, -1)),
        uNear: dynoFloat(metresToWorld(LENS_NEAR_M)),
        uFar: dynoFloat(metresToWorld(LENS_FAR_M))
    };
    // The modifier runs after recolor: dim the ramp like the room
    const [C0, C1, C2] = RAMP.map(c => dynoConst('vec3', new THREE.Vector3(...c).multiplyScalar(ROOM_BRIGHTNESS)));
    const F0 = dynoConst('float', 0), F1 = dynoConst('float', 1), F2 = dynoConst('float', 2);
    const FE = dynoConst('float', 0.8), TAN = dynoConst('float', LENS_TAN);
    const block = dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
        const { center, rgb } = splitGsplat(gsplat).outputs;
        // linear ramp of the distance to the camera (world units)
        const d01 = clamp(div(sub(distance(center, u.uCam), u.uNear), sub(u.uFar, u.uNear)), F0, F1);
        const ramp = mix(mix(C0, C1, clamp(mul(d01, F2), F0, F1)), C2, clamp(sub(mul(d01, F2), F1), F0, F1));
        // cone round the ray, soft edge
        const vv = sub(center, u.uRayO);
        const t = dot(vv, u.uRayD);
        const perp = length(sub(vv, mul(u.uRayD, t)));
        const edge = mul(max(t, F0), TAN);
        const mask = mul(mul(sub(F1, smoothstep(mul(edge, FE), edge, perp)), step(F0, t)), u.uOn);
        return { gsplat: combineGsplat({ gsplat, rgb: mix(rgb, ramp, mask) }) };
    });
    lensMeshes = [roomMesh, ...objectMeshes];
    for (const m of lensMeshes) { m.worldModifier = block; m.updateGenerator(); }
    lens = u;
}

// The ray of the lens and of a pick: through the pointer on a desktop,
// through the screen centre (the crosshair) on a phone.
function setRay(ndc = touch ? CENTRE : pointerNdc) {
    raycaster.setFromCamera(ndc, camera);
}

function updateLens() {
    setRay();
    const { uCam, uRayO, uRayD } = lens;
    camera.getWorldPosition(_v);
    if (_v.equals(uCam.value) && raycaster.ray.origin.equals(uRayO.value) && raycaster.ray.direction.equals(uRayD.value)) return;
    uCam.value.copy(_v);
    uRayO.value.copy(raycaster.ray.origin);
    uRayD.value.copy(raycaster.ray.direction);
    for (const m of lensMeshes) m.updateVersion();   // uniforms changed: regenerate
}

// ── Measure ────────────────────────────────────────────────────────
const mGroup = new THREE.Group();
mGroup.renderOrder = 20;
const lineMat = new THREE.LineBasicMaterial({ color: MEASURE_COLOR, depthTest: false, transparent: true });
const dotMat = new THREE.MeshBasicMaterial({ color: MEASURE_COLOR, depthTest: false, transparent: true });
const dotGeo = new THREE.SphereGeometry(1, 12, 8);
const label = document.createElement('div');
label.className = 'room-tools-label';
label.hidden = true;
document.body.appendChild(label);
let pts = [];

function clearMeasure() {
    pts = [];
    mGroup.clear();
    label.hidden = true;
}

function pick(ndc) {
    if (!roomMesh) return null;
    setRay(ndc);
    raycaster.near = 0; raycaster.far = Infinity;
    return raycaster.intersectObjects([roomMesh, ...objectMeshes], false)[0] ?? null;
}

function addPoint(p) {
    if (pts.length === 2) clearMeasure();
    if (!mGroup.parent) scene.add(mGroup);
    pts.push(p.clone());
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(p);
    dot.scale.setScalar(DOT_SIZE * camera.getWorldPosition(_v).distanceTo(p));
    dot.renderOrder = 20;
    mGroup.add(dot);
    if (pts.length < 2) { hint.textContent = touch ? 'Aim at the second point, then Mark' : 'Click the second point'; return; }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    line.renderOrder = 20;
    mGroup.add(line);
    const m = worldToMetres(pts[0].distanceTo(pts[1]));
    label.textContent = '≈ ' + (m < 1 ? Math.round(m * 100) + ' cm' : m.toFixed(2) + ' m');
    label.hidden = false;
    hint.textContent = 'Approximately metric (±3 %)';
}

function mark() {
    const h = pick();
    if (h) addPoint(h.point);
}

function placeLabel() {
    if (label.hidden) return;
    _v.addVectors(pts[0], pts[1]).multiplyScalar(0.5).project(camera);
    label.style.left = ((_v.x + 1) / 2 * window.innerWidth) + 'px';
    label.style.top = ((1 - _v.y) / 2 * window.innerHeight) + 'px';
    label.style.visibility = _v.z < 1 ? '' : 'hidden';
}

// ── State ──────────────────────────────────────────────────────────
function refresh() {
    const active = depthOn || measureOn;
    setToolOn(active);
    bDepth.setAttribute('aria-pressed', depthOn);
    bMeasure.setAttribute('aria-pressed', measureOn);
    bDepth.disabled = bMeasure.disabled = !ready;
    bMark.hidden = !(touch && measureOn);
    cross.hidden = !(touch && active);
    if (!measureOn) clearMeasure();
    if (measureOn && pts.length === 0) hint.textContent = touch ? 'Aim at a point, then Mark' : 'Click two points';
    else if (!measureOn) hint.textContent = depthOn ? 'Warm is near, blue is far' : HINT_IDLE;
}

async function setDepth(on) {
    depthOn = on;
    refresh();
    if (on) await (lensBuild ??= buildLens());
    if (!lens) return;
    lens.uOn.value = depthOn ? 1 : 0;
    for (const m of lensMeshes) m.updateVersion();
}

function setMeasure(on) { measureOn = on; refresh(); }

function allOff() {
    if (depthOn) setDepth(false);
    measureOn = false;
    refresh();
}

// Raycast returns nothing until the room has rendered some frames:
// probe a few screen points until one hits, then enable the tools.
const PROBES = [[0, 0], [0, -0.5], [-0.5, -0.5], [0.5, -0.5]].map(p => new THREE.Vector2(...p));
function probe() {
    if (!shown || ready) return;
    if (PROBES.some(p => pick(p))) { ready = true; refresh(); return; }
    setTimeout(probe, 250);
}

function tick() {
    requestAnimationFrame(tick);
    if (!shown) return;
    if (depthOn && lens) updateLens();
    if (measureOn) placeLabel();
}

// ── Events ─────────────────────────────────────────────────────────
bDepth.addEventListener('click', () => setDepth(!depthOn));
bMeasure.addEventListener('click', () => setMeasure(!measureOn));
bMark.addEventListener('click', mark);

// Esc: an open project app closes first (dimension.js handles it and prevents the default)
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) allOff(); });

window.addEventListener('pointermove', (e) => {
    pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
});

// Desktop measure: a click (not a drag) on the scene
let down = null;
const onOverlay = (e) => e.target.closest('.site-nav, .stop-panel, .room-tools');
document.body.addEventListener('pointerdown', (e) => { down = onOverlay(e) ? null : [e.clientX, e.clientY]; });
document.body.addEventListener('pointerup', (e) => {
    if (!down || touch || !measureOn || onOverlay(e)) return;
    if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) < TAP_PX) mark();
    down = null;
});

window.addEventListener('journey:stop', (e) => {
    const { phase, universe, type } = e.detail;
    if (universe !== 'rnd' && type !== StopType.LANDING) return;
    shown = phase === 'enter';
    bar.hidden = !shown;
    if (shown) probe();
    else allOff();
});

// Walk mode (walk.js) owns the camera and the taps: tools off, toolbar hidden
// until the next 'journey:stop' enter (back in VIEW)
window.addEventListener('journey:explore', () => {
    shown = false;
    bar.hidden = true;
    allOff();
});

requestAnimationFrame(tick);
