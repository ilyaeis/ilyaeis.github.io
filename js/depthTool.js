// Depth lens + measure tool for the apartment splat. Self-initialising.
// A small toolbar (.room-tools) shows in walk mode only ('journey:explore'
// enter .. leave): the stop panel offers one action, "Explore the flat".
// Depth: a cone round the pointer ray (phones: the view centre) recolours
// the splats by their distance to the camera (a Spark worldModifier,
// attached on first use): a perceptual ramp, bright near to dark far, on a
// log scale, with a legend. Measure: two clicks on the splat (raycast on
// click only) give a line, two dots and "≈ x.xx m". While measuring,
// input.js gives the taps to this tool (a drag still looks round, the depth
// lens leaves the taps to walking); Esc turns the tools off.

import * as THREE from 'three';
import { scene, camera, isMobile } from './attractors.js';
import { apartment, M_PER_UNIT, roomMesh, objectMeshes } from './room.js';
import { setToolOn } from './input.js';

// ── Tuning ─────────────────────────────────────────────────────────
const LENS_TAN = 0.18;               // cone half-angle tangent
const LENS_NEAR_M = 0.5;             // ramp start (bright), metres from the camera
const LENS_FAR_M = 6;                // ramp end (dark), metres (walk mode: the rooms are 1-6 m deep)
// Near -> far: part of "inferno" (perceptual, lightness falls steadily), so
// the ramp reads as depth. Log scale: equal steps per ratio of distance.
const RAMP = [[0.98, 0.87, 0.35], [0.98, 0.56, 0.04], [0.80, 0.26, 0.28], [0.53, 0.13, 0.42], [0.26, 0.04, 0.41]];
const LENS_GAIN = 0.75;              // the room is dimmed (room.js); this keeps the ramp clear and under the bloom threshold
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

// Legend under the buttons while the lens is on: the ramp, near .. far in metres
const legend = document.createElement('div');
legend.className = 'room-tools-legend';
legend.hidden = true;
const legendRamp = document.createElement('i');
legendRamp.style.background = 'linear-gradient(90deg, ' +
    RAMP.map(c => 'rgb(' + c.map(v => Math.round(v * 255)).join(',') + ')').join(', ') + ')';
legend.append('near ' + LENS_NEAR_M + ' m', legendRamp, LENS_FAR_M + ' m far');
hint.after(legend);

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
            sub, mul, div, dot, length, distance, clamp, mix, smoothstep, step, max, log } = dyno;
    const u = {
        uOn: dynoFloat(0),
        uCam: dynoVec3(new THREE.Vector3()),
        uRayO: dynoVec3(new THREE.Vector3()),
        uRayD: dynoVec3(new THREE.Vector3(0, 0, -1)),
        uNear: dynoFloat(metresToWorld(LENS_NEAR_M)),
        uFar: dynoFloat(metresToWorld(LENS_FAR_M))
    };
    // The modifier runs after recolor (the room's dimming): set the ramp's own level
    const C = RAMP.map(c => dynoConst('vec3', new THREE.Vector3(...c).multiplyScalar(LENS_GAIN)));
    const F0 = dynoConst('float', 0), F1 = dynoConst('float', 1), FN = dynoConst('float', RAMP.length - 1);
    const FE = dynoConst('float', 0.8), TAN = dynoConst('float', LENS_TAN);
    const block = dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
        const { center, rgb } = splitGsplat(gsplat).outputs;
        // log ramp of the distance to the camera: 0 at uNear, 1 at uFar
        const d01 = clamp(div(log(div(max(distance(center, u.uCam), u.uNear), u.uNear)), log(div(u.uFar, u.uNear))), F0, F1);
        // piecewise linear through the RAMP stops
        let ramp = C[0];
        const x = mul(d01, FN);
        for (let i = 1; i < C.length; i++) ramp = mix(ramp, C[i], clamp(sub(x, dynoConst('float', i - 1)), F0, F1));
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
    setToolOn(measureOn);   // the depth lens is passive: taps still walk
    legend.hidden = !depthOn;
    bDepth.setAttribute('aria-pressed', depthOn);
    bMeasure.setAttribute('aria-pressed', measureOn);
    bDepth.disabled = bMeasure.disabled = !ready;
    bMark.hidden = !(touch && measureOn);
    cross.hidden = !(touch && active);
    if (!measureOn) clearMeasure();
    if (measureOn && pts.length === 0) hint.textContent = touch ? 'Aim at a point, then Mark' : 'Click two points';
    else if (!measureOn) hint.textContent = depthOn ? 'Distance from your eye' : HINT_IDLE;
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

// The toolbar lives in walk mode (explore.js): shown on enter, tools off and hidden on leave
window.addEventListener('journey:explore', (e) => {
    shown = e.detail?.phase === 'enter';
    bar.hidden = !shown;
    if (shown) probe();
    else allOff();
});

requestAnimationFrame(tick);
