// ── 3D Intro ───────────────────────────────────────────────────────
// The landing page lives inside the WebGL scene: extruded 3D name,
// tagline and LinkedIn icon, plus a 3D rocket that is already flying
// loops when the page loads. Everything is parented to the camera
// (HUD-style) so it stays on screen while keeping real depth.

import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/fonts/helvetiker_regular.typeface.json';
export const LINKEDIN_URL = 'https://www.linkedin.com/in/i%C4%BCja-safronovs-eis';

const HUD_DIST = 2.0;           // camera-space depth of the HUD layer (rocket, corner icon)
const NAME_SIZE = 0.13;
const TAGLINE_SIZE = 0.045;
const ICON_SIZE = 0.085;
const CORNER_MARGIN = 38;       // px from screen corner for the parked icon
const CORNER_SCALE = 0.55;

// Intro text/icon/rocket live in WORLD space at the orbit center, so
// dragging the view rotates them together with the starfield
const INTRO_SCALE = 0.6;        // compensates for the closer orbit distance
const INTRO_VIEW_DIST = 1.2;    // initial camera orbit radius
const TEXT_INTRO_Y = 0.02;
const ICON_INTRO_Y = -0.33;

let camera = null;

// Groups — anchor is in world space; rocket is a camera child (HUD)
let introAnchor = null;   // world-space anchor facing the initial camera
let textGroup = null;     // name + tagline
let iconGroup = null;     // LinkedIn tile
let rocket = null;        // the 3D rocket
let flame = null;         // exhaust flame mesh (flickers)

const textMats = [];
const iconMats = [];
const rocketMats = [];

// Modes
let textMode = 'intro';     // intro | exiting | gone
let iconMode = 'intro';     // intro | tocorner | corner
let rocketMode = 'idle';    // idle | charging | gone

let time = 0;
let exitT = 0;              // text exit timer
let iconT = 0;              // icon-to-corner timer
let chargeT = 0;            // rocket charge timer
let appearT = 0;            // fade-in timer once assets load

let fromScale = 1;          // icon scale when leaving for the corner
const _qFrom = new THREE.Quaternion();
const _qIdent = new THREE.Quaternion();
const _rocketFrom = new THREE.Vector3();   // rocket position when the morph starts
const _qRocketFrom = new THREE.Quaternion();
const _rocketDir = new THREE.Vector3();    // anchor-space nose heading at morph start
let dashDist = 1;           // how far the streak travels while morphing
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _from = new THREE.Vector3();

const EXIT_DURATION = 0.8;
export const CHARGE_DURATION = 1.1;

// ── Helpers ────────────────────────────────────────────────────────
function viewExtents(dist) {
    const tanV = Math.tan(camera.fov * Math.PI / 360);
    return { hw: tanV * camera.aspect * dist, hh: tanV * dist };
}

function screenToCam(px, py, dist, out) {
    const { hw, hh } = viewExtents(dist);
    out.set(
        ((px / window.innerWidth) * 2 - 1) * hw,
        (-(py / window.innerHeight) * 2 + 1) * hh,
        -dist
    );
    return out;
}

function setOpacity(mats, o) {
    for (const m of mats) m.opacity = o;
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

// ── Build: text ────────────────────────────────────────────────────
function buildText(font) {
    const nameMat = new THREE.MeshStandardMaterial({
        color: 0xe8e8e8, metalness: 0.25, roughness: 0.4, transparent: true, opacity: 0
    });
    const tagMat = new THREE.MeshStandardMaterial({
        color: 0x999999, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0
    });
    textMats.push(nameMat, tagMat);

    function makeLine(str, size, mat, y) {
        const geo = new TextGeometry(str, {
            font, size, height: size * 0.3,
            curveSegments: 6,
            bevelEnabled: true, bevelThickness: size * 0.02,
            bevelSize: size * 0.015, bevelSegments: 2
        });
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        geo.translate(
            -(bb.min.x + bb.max.x) / 2,
            -(bb.min.y + bb.max.y) / 2 + y,
            -(bb.min.z + bb.max.z) / 2
        );
        const mesh = new THREE.Mesh(geo, mat);
        textGroup.add(mesh);
    }

    makeLine('Ilja Safronovs', NAME_SIZE, nameMat, 0.10);
    makeLine('student. problem solver. builder.', TAGLINE_SIZE, tagMat, -0.06);
}

// ── Build: LinkedIn icon ───────────────────────────────────────────
function buildIcon(svgData) {
    const mat = new THREE.MeshStandardMaterial({
        color: 0x2c7bb8, metalness: 0.3, roughness: 0.45, transparent: true, opacity: 0
    });
    iconMats.push(mat);

    const inner = new THREE.Group();
    for (const path of svgData.paths) {
        for (const shape of SVGLoader.createShapes(path)) {
            const geo = new THREE.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: false });
            inner.add(new THREE.Mesh(geo, mat));
        }
    }
    // SVG is 50×50 units, y-down — scale to world units and flip Y
    const s = ICON_SIZE / 50;
    inner.scale.set(s, -s, s);
    inner.position.set(-ICON_SIZE / 2, ICON_SIZE / 2, 0);
    iconGroup.add(inner);
}

// ── Build: rocket (points +X) ──────────────────────────────────────
function buildRocket() {
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xd9d9d9, metalness: 0.3, roughness: 0.35, transparent: true
    });
    const accentMat = new THREE.MeshStandardMaterial({
        color: 0xcc3322, metalness: 0.2, roughness: 0.5, transparent: true
    });
    const winMat = new THREE.MeshStandardMaterial({
        color: 0x335577, metalness: 0.7, roughness: 0.25, transparent: true
    });
    const flameMat = new THREE.MeshBasicMaterial({
        color: 0xffaa33, transparent: true, opacity: 0.9
    });
    rocketMats.push(bodyMat, accentMat, winMat, flameMat);

    rocket = new THREE.Group();

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.085, 6, 16), bodyMat);
    body.rotation.z = -Math.PI / 2;
    rocket.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.0285, 0.05, 16), accentMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.068;
    rocket.add(nose);

    const win = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.06, 16), winMat);
    win.rotation.x = Math.PI / 2;
    win.position.x = 0.018;
    rocket.add(win);

    // Three fins around the tail
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0.024);
    finShape.lineTo(-0.045, 0.062);
    finShape.lineTo(-0.052, 0.024);
    finShape.lineTo(0, 0.024);
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.006, bevelEnabled: false });
    finGeo.translate(0, 0, -0.003);
    for (let i = 0; i < 3; i++) {
        const fin = new THREE.Mesh(finGeo, accentMat);
        fin.position.x = -0.022;
        fin.rotation.x = (i / 3) * Math.PI * 2;
        rocket.add(fin);
    }

    flame = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 12), flameMat);
    flame.rotation.z = Math.PI / 2;
    flame.position.x = -0.085;
    rocket.add(flame);

    // World space (anchor child) — loops rotate with the scene.
    // Apparent size matches the old HUD layout: 0.6× scale at 0.6× distance.
    introAnchor.add(rocket);
}

// ── Init ───────────────────────────────────────────────────────────
export function init(scene, cam) {
    camera = cam;
    scene.add(camera); // required for camera children to render

    // HUD lighting — parented to the camera so shading stays stable
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(1.2, 1.6, 1.5);
    camera.add(dir);
    camera.add(dir.target);
    dir.target.position.set(0, 0, -HUD_DIST);

    // World-space anchor at the orbit center, facing the initial camera —
    // rotating the view rotates the intro together with the stars
    introAnchor = new THREE.Group();
    introAnchor.lookAt(cam.position);
    introAnchor.scale.setScalar(INTRO_SCALE);
    scene.add(introAnchor);

    textGroup = new THREE.Group();
    textGroup.position.y = TEXT_INTRO_Y;
    iconGroup = new THREE.Group();
    iconGroup.position.y = ICON_INTRO_Y;
    introAnchor.add(textGroup);
    introAnchor.add(iconGroup);

    buildRocket();

    new FontLoader().load(FONT_URL, font => buildText(font));
    new SVGLoader().load('svg/linkedin.svg', data => buildIcon(data));
}

function cornerPos(out) {
    return screenToCam(
        window.innerWidth - CORNER_MARGIN,
        window.innerHeight - CORNER_MARGIN,
        HUD_DIST, out
    );
}

export function onResize() {
    // Intro layout is world-space (resize-agnostic); only the
    // corner-parked icon is anchored to screen pixels
    if (iconMode === 'corner') cornerPos(iconGroup.position);
}

// ── Rocket idle flight (lazy loops around the intro text) ──────────
// Anchor-local coordinates — the path rotates with the scene. Extents
// derive from what the initial camera sees, so loops stay in frame.
function rocketIdlePos(t, out) {
    const { hw, hh } = viewExtents(INTRO_VIEW_DIST);
    const ax = hw / INTRO_SCALE;
    const ay = hh / INTRO_SCALE;
    out.set(
        ax * 0.55 * Math.sin(t * 0.55),
        ay * (0.42 * Math.sin(t * 1.1 + 1.2) + 0.18),
        0.35 * Math.sin(t * 0.8 + 0.5)
    );
    return out;
}

const _aimA = new THREE.Vector3();
const _aimB = new THREE.Vector3();

function aimRocketAlongPath(t) {
    const eps = 0.02;
    rocketIdlePos(t + eps, _aimA);
    rocketIdlePos(t - eps, _aimB);
    _aimA.sub(_aimB);
    rocket.rotation.set(0, 0, Math.atan2(_aimA.y, _aimA.x));
    // Bank into the turns
    rocket.rotation.x = 0.7 * Math.sin(t * 1.1 + 1.2);
}

// ── Mode setters (driven by the orchestrator) ──────────────────────
export function startExit() {
    if (textMode === 'intro') { textMode = 'exiting'; exitT = 0; }
    if (iconMode === 'intro') {
        // Re-parent to the camera (keeping world transform) so the icon
        // can glide to a screen-fixed corner from wherever the view is
        camera.attach(iconGroup);
        iconMode = 'tocorner'; iconT = 0;
        _from.copy(iconGroup.position);
        _qFrom.copy(iconGroup.quaternion);
        fromScale = iconGroup.scale.x;
    }
}

// Morph the rocket into the comet streak from exactly where it is right
// now — no fly-to-center step. We freeze its current idle transform and
// accelerate straight along its nose, stretching it into a line.
export function setRocketCharging() {
    rocketMode = 'charging';
    chargeT = 0;
    _rocketFrom.copy(rocket.position);
    _qRocketFrom.copy(rocket.quaternion);
    // Travel direction = the nose (local +X) in anchor space
    _rocketDir.set(1, 0, 0).applyQuaternion(rocket.quaternion).normalize();
    // Short forward run — stays comfortably on screen while the comet
    // line grows out of its tip
    const { hw } = viewExtents(INTRO_VIEW_DIST);
    dashDist = (hw / INTRO_SCALE) * 0.4;
}

export function rocketChargeDone() {
    return rocketMode === 'charging' && chargeT >= CHARGE_DURATION;
}

export function hideRocket() {
    rocketMode = 'gone';
    if (rocket) rocket.visible = false;
}

export function getRocketTipWorld(out) {
    rocket.updateWorldMatrix(true, false);
    return out.set(0.1, 0, 0).applyMatrix4(rocket.matrixWorld);
}

// World-space heading of the morphing streak, so the comet departs
// continuing the exact direction the rocket was moving in.
export function getRocketDirWorld(out) {
    rocket.updateWorldMatrix(true, false);
    return out.set(1, 0, 0).transformDirection(rocket.matrixWorld).normalize();
}

export function getIconObject() {
    return iconGroup;
}

// ── Per-frame update ───────────────────────────────────────────────
export function update(dt, totalTime) {
    time = totalTime;
    appearT += dt;

    // Fade everything in once built
    const fadeIn = Math.min(appearT / 0.8, 1);

    // Text: float gently, exit by shrinking + fading
    if (textGroup && textMode !== 'gone') {
        textGroup.rotation.y = 0.14 * Math.sin(time * 0.5);
        textGroup.rotation.x = 0.05 * Math.sin(time * 0.7 + 1.0);
        if (textMode === 'intro') {
            setOpacity(textMats, fadeIn);
        } else {
            exitT += dt;
            const k = smoothstep(Math.min(exitT / EXIT_DURATION, 1));
            textGroup.scale.setScalar(1 - 0.35 * k);
            setOpacity(textMats, (1 - k) * fadeIn);
            if (k >= 1) {
                textMode = 'gone';
                introAnchor.remove(textGroup);
            }
        }
    }

    // Icon: bob during intro, glide to corner, then stay pinned
    if (iconGroup) {
        if (iconMode === 'intro') {
            iconGroup.position.y = ICON_INTRO_Y + 0.012 * Math.sin(time * 1.3);
            iconGroup.rotation.y = 0.25 * Math.sin(time * 0.9);
            setOpacity(iconMats, fadeIn);
        } else if (iconMode === 'tocorner') {
            iconT += dt;
            const k = smoothstep(Math.min(iconT / EXIT_DURATION, 1));
            cornerPos(_v);
            iconGroup.position.lerpVectors(_from, _v, k);
            iconGroup.scale.setScalar(fromScale + (CORNER_SCALE - fromScale) * k);
            // Turn back to face the screen from whatever angle it had
            iconGroup.quaternion.slerpQuaternions(_qFrom, _qIdent, k);
            if (k >= 1) iconMode = 'corner';
        } else {
            // Pinned: gentle idle shimmer so it still reads as 3D
            iconGroup.rotation.y = 0.18 * Math.sin(time * 0.6);
        }
    }

    // Rocket
    if (rocket && rocketMode !== 'gone') {
        setOpacity(rocketMats, Math.min(fadeIn * 1.5, 1));
        // Flame flicker
        const fl = 0.85 + 0.3 * Math.sin(time * 31.0) * Math.sin(time * 7.3);
        flame.scale.set(fl, 0.9 + 0.35 * Math.sin(time * 23.0), fl);
        flame.material.opacity = 0.65 + 0.3 * Math.sin(time * 17.0);

        if (rocketMode === 'idle') {
            rocketIdlePos(time, rocket.position);
            aimRocketAlongPath(time);
        } else if (rocketMode === 'charging') {
            // The rocket keeps its real shape — it just eases into an
            // accelerating run along its own heading and fades out, while
            // the orchestrator traces the glowing comet line from its tip.
            chargeT += dt;
            const p = Math.min(chargeT / CHARGE_DURATION, 1);
            const accel = p * p;                  // ease-in: gentle, building speed
            rocket.position.copy(_rocketFrom).addScaledVector(_rocketDir, dashDist * accel);
            rocket.quaternion.copy(_qRocketFrom);
            rocket.scale.setScalar(1);
            // Fade away over the back two-thirds — the streak is left behind
            setOpacity(rocketMats, Math.max(1 - Math.max(p - 0.3, 0) / 0.7, 0));
        }
    }
}
