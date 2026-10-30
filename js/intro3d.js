// ── 3D Intro ───────────────────────────────────────────────────────
// The landing page lives inside the WebGL scene: extruded 3D name,
// tagline and LinkedIn + GitHub icons, plus a 3D rocket that is already flying
// loops when the page loads. Everything is parented to the camera
// (HUD-style) so it stays on screen while keeping real depth.

import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/fonts/helvetiker_regular.typeface.json';
export const LINKEDIN_URL = 'https://www.linkedin.com/in/i%C4%BCja-safronovs-eis';
export const GITHUB_URL = 'https://github.com/ilyaeis';

const HUD_DIST = 2.0;           // camera-space depth of the HUD layer (light target)
const NAME_SIZE = 0.13;
const TAGLINE_SIZE = 0.045;
const ICON_SIZE = 0.085;

// Intro text/icon/rocket live in WORLD space at the orbit center, so
// dragging the view rotates them together with the starfield
const INTRO_SCALE = 0.6;        // compensates for the closer orbit distance
const INTRO_VIEW_DIST = 1.2;    // initial camera orbit radius
const TEXT_INTRO_Y = 0.02;
const ICON_INTRO_Y = -0.33;
const ICON_X = 0.075;           // horizontal offset of each icon from center

let camera = null;

// Groups — anchor is in world space; rocket is a camera child (HUD)
let introAnchor = null;   // world-space anchor facing the initial camera
let textGroup = null;     // name + tagline
let linkedinGroup = null; // LinkedIn tile
let githubGroup = null;   // GitHub mark
let rocket = null;        // the 3D rocket
let flame = null;         // exhaust flame mesh (flickers)

const textMats = [];
const iconMats = [];
const rocketMats = [];

// Modes
let rocketMode = 'idle';    // idle | charging | gone

let time = 0;
let chargeT = 0;            // rocket charge timer
let appearT = 0;            // fade-in timer once assets load

const _rocketFrom = new THREE.Vector3();   // rocket position when the morph starts
const _qRocketFrom = new THREE.Quaternion();
const _rocketDir = new THREE.Vector3();    // anchor-space nose heading at morph start
let dashDist = 1;           // how far the streak travels while morphing

export const CHARGE_DURATION = 1.1;

// ── Helpers ────────────────────────────────────────────────────────
function viewExtents(dist) {
    const tanV = Math.tan(camera.fov * Math.PI / 360);
    return { hw: tanV * camera.aspect * dist, hh: tanV * dist };
}

function setOpacity(mats, o) {
    for (const m of mats) m.opacity = o;
}

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
    makeLine('R&D engineer. student. builder.', TAGLINE_SIZE, tagMat, -0.06);
}

// ── Build: icons (LinkedIn, GitHub) ────────────────────────────────
function buildIcon(svgData, group, color) {
    const mat = new THREE.MeshStandardMaterial({
        color, metalness: 0.3, roughness: 0.45, transparent: true, opacity: 0
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
    group.add(inner);
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
    linkedinGroup = new THREE.Group();
    linkedinGroup.position.set(-ICON_X, ICON_INTRO_Y, 0);
    githubGroup = new THREE.Group();
    githubGroup.position.set(ICON_X, ICON_INTRO_Y, 0);
    introAnchor.add(textGroup);
    introAnchor.add(linkedinGroup);
    introAnchor.add(githubGroup);

    buildRocket();

    new FontLoader().load(FONT_URL, font => buildText(font));
    new SVGLoader().load('svg/linkedin.svg', data => buildIcon(data, linkedinGroup, 0x2c7bb8));
    new SVGLoader().load('svg/github.svg', data => buildIcon(data, githubGroup, 0xdddddd));
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
    return linkedinGroup;
}

export function getGithubIconObject() {
    return githubGroup;
}

// ── Per-frame update ───────────────────────────────────────────────
export function update(dt, totalTime) {
    time = totalTime;
    appearT += dt;

    // Fade everything in once built
    const fadeIn = Math.min(appearT / 0.8, 1);

    // Text: float gently
    if (textGroup) {
        textGroup.rotation.y = 0.14 * Math.sin(time * 0.5);
        textGroup.rotation.x = 0.05 * Math.sin(time * 0.7 + 1.0);
        setOpacity(textMats, fadeIn);
    }

    // Icons: bob and sway
    for (const g of [linkedinGroup, githubGroup]) {
        if (!g) continue;
        g.position.y = ICON_INTRO_Y + 0.012 * Math.sin(time * 1.3);
        g.rotation.y = 0.25 * Math.sin(time * 0.9);
    }
    setOpacity(iconMats, fadeIn);

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
