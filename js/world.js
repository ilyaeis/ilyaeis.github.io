// ── Static World ───────────────────────────────────────────────────
// Builds every journey stop as pre-existing geometry at load: the
// trait text, milestone rocks, pre-integrated attractor curves and
// the contact landing are scattered randomly through 3D space, each
// glowing in its own palette from frame one. The comet (orchestrator)
// flies between them — sometimes straight through a third scene.

import * as THREE from 'three';
import { ATTRACTORS, rk4Step, isMobile, getPaletteColor } from './attractors.js';
import { generateTextLines, generateRockWithLabel } from './strokeFont.js';

export const StopType = { TEXT: 0, ATTRACTOR: 1, ROCK: 2, LANDING: 3 };

// ── Content ────────────────────────────────────────────────────────
export const CONTACT_EMAIL = 'ilya.safronos@gmail.com';
const TEXT_LINES = ['CREATIVE.', 'ADAPTIVE.', 'CURIOUS.'];
const LANDING_LINES = ['GET IN TOUCH', CONTACT_EMAIL];
const MILESTONES = [
    { label: 'GYMNASIUM', sublabel: 'RIGA', sizeFactor: 1.0, seed: 42 },
    { label: 'BACHELOR IN', sublabel: 'FINANCIAL ENGINEERING', sizeFactor: 0.55, seed: 73 },
    { label: 'GIRAFFE360', sublabel: null, sizeFactor: 0.35, seed: 17 },
];

// ── Tuning ─────────────────────────────────────────────────────────
export const TEXT_SCALE = 0.22;          // world units per 2D unit (text/landing)
export const ROCK_SCALE = 0.4;           // world units per 2D unit (rocks)
const STROKE_INTENSITY = 1.5;            // bold letter strokes (HDR → bloom)
const LINK_INTENSITY = 0.35;             // faint pen-travel strokes
const ATTRACTOR_POINTS = isMobile ? 6000 : 12000;
const ATTRACTOR_WARMUP = 500;            // integration steps before recording
const ATTRACTOR_ALPHA = 0.35;            // per-point alpha of static curves

// Random scatter — each stop hops far from the previous one in a
// random 3D direction (lightly biased outward so the journey keeps
// drifting away from the intro), never closer than MIN_SEPARATION to
// another. The meteor rocks are one scene: they cluster tightly.
const MIN_HOP = 30;
const MAX_HOP = 50;
const ROCK_HOP_MIN = 10;                 // rock → rock (same scene)
const ROCK_HOP_MAX = 14;
const MIN_SEPARATION = 16;
const ROCK_SEPARATION = 7;               // rocks may sit near each other
const PLACE_TRIES = 12;
const MAX_PITCH = 0.55;                  // |y| of hop direction — keeps text upright

// Overall outward drift of the journey
export const journeyDir = new THREE.Vector3(0.45, 0.08, -0.89).normalize();

// Visit order. Planar stops carry their own paletteIdx (into the
// ATTRACTORS table) so every scene glows in a different color — the
// three meteor rocks are ONE scene and share a single palette.
const ROUTE = [
    { type: StopType.TEXT,      paletteIdx: 0 },
    { type: StopType.ATTRACTOR, attractorIdx: 0 },
    { type: StopType.ROCK,      milestone: 0, paletteIdx: 1 },
    { type: StopType.ROCK,      milestone: 1, paletteIdx: 1 },
    { type: StopType.ROCK,      milestone: 2, paletteIdx: 1 },
    { type: StopType.ATTRACTOR, attractorIdx: 1 },
    { type: StopType.ATTRACTOR, attractorIdx: 2 },
    { type: StopType.ATTRACTOR, attractorIdx: 3 },
    { type: StopType.ATTRACTOR, attractorIdx: 4 },
    { type: StopType.LANDING,   paletteIdx: 4 },
];

// ── Stop shader ────────────────────────────────────────────────────
// Baked HDR colors + per-point alpha; one shared material for all stops
const STOP_VERTEX = `
    attribute vec3 color;
    attribute float aAlpha;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        vColor = color;
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const STOP_FRAGMENT = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        if (vAlpha < 0.003) discard;
        gl_FragColor = vec4(vColor, vAlpha);
    }
`;

let stopMaterial = null;

function getStopMaterial() {
    if (!stopMaterial) {
        stopMaterial = new THREE.ShaderMaterial({
            vertexShader: STOP_VERTEX,
            fragmentShader: STOP_FRAGMENT,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
    }
    return stopMaterial;
}

// ── State ──────────────────────────────────────────────────────────
export let stops = [];
let mailPlane = null;
export function getMailPlane() { return mailPlane; }

const _vec3 = new THREE.Vector3();
const _dir = new THREE.Vector3();

function rand(min, max) { return min + Math.random() * (max - min); }

// ── 2D plane → world space ─────────────────────────────────────────
export function planePointToWorld(out, center, right, up, scale, p) {
    return out.set(
        center.x + (p.x * right.x + p.y * up.x) * scale,
        center.y + (p.x * right.y + p.y * up.y) * scale,
        center.z + (p.x * right.z + p.y * up.z) * scale
    );
}

// ── Random scatter layout ──────────────────────────────────────────
// Hop direction: a big random kick with a light outward drift,
// pitch-limited so planar scenes stay roughly upright and the path
// never goes vertical. The kick dwarfs the drift — hops can swing
// sideways or even double back; only the long-run average drifts out.
function randomHopDir(out) {
    out.copy(journeyDir);
    out.x += rand(-2.2, 2.2);
    out.y += rand(-1.1, 1.1);
    out.z += rand(-2.2, 2.2);
    out.normalize();
    out.y = THREE.MathUtils.clamp(out.y, -MAX_PITCH, MAX_PITCH);
    return out.normalize();
}

function placeNextCenter(prev, placed, hopMin, hopMax, separation) {
    let candidate = null;
    for (let i = 0; i < PLACE_TRIES; i++) {
        candidate = prev.clone().addScaledVector(randomHopDir(_dir), rand(hopMin, hopMax));
        if (placed.every(p => p.distanceTo(candidate) >= separation)) break;
    }
    return candidate;
}

// ── Line builder ───────────────────────────────────────────────────
function buildStopLine(positions, colors, alphas) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.computeBoundingSphere();
    return new THREE.Line(geo, getStopMaterial()); // static — frustum culling applies
}

// ── Planar stop (text / rock / landing) ────────────────────────────
function buildPlanarStop(def, center, right, up, palette) {
    const scale = def.type === StopType.ROCK ? ROCK_SCALE : TEXT_SCALE;
    let points;
    if (def.type === StopType.ROCK) {
        const ms = MILESTONES[def.milestone];
        ({ points } = generateRockWithLabel(ms.sizeFactor, ms.seed, ms.label, ms.sublabel));
    } else {
        ({ points } = generateTextLines(
            def.type === StopType.LANDING ? LANDING_LINES : TEXT_LINES));
    }

    const n = points.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const alphas = new Float32Array(n);
    let maxAbsX = 0, maxAbsY = 0;

    for (let i = 0; i < n; i++) {
        const p = points[i];
        planePointToWorld(_vec3, center, right, up, scale, p);
        positions[i * 3]     = _vec3.x;
        positions[i * 3 + 1] = _vec3.y;
        positions[i * 3 + 2] = _vec3.z;

        const k = p.c === 0 ? LINK_INTENSITY : STROKE_INTENSITY;
        const col = getPaletteColor(palette, n > 1 ? i / (n - 1) : 0);
        colors[i * 3]     = col.r * k;
        colors[i * 3 + 1] = col.g * k;
        colors[i * 3 + 2] = col.b * k;
        alphas[i] = 1.0;

        maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
        maxAbsY = Math.max(maxAbsY, Math.abs(p.y));
    }

    return {
        line: buildStopLine(positions, colors, alphas),
        points2d: points,
        scale,
        halfW: maxAbsX * scale,
        halfH: maxAbsY * scale
    };
}

// ── Attractor stop (pre-integrated curve) ──────────────────────────
function buildAttractorStop(def, center) {
    const attr = ATTRACTORS[def.attractorIdx];
    let s = [...attr.initialCondition];

    function step() {
        s = rk4Step(attr.derivatives, s[0], s[1], s[2], attr.dt, attr.params);
        for (let j = 0; j < 3; j++) {
            if (Math.abs(s[j]) > 150) s[j] *= 150 / Math.abs(s[j]);
            if (!isFinite(s[j])) { s = [...attr.initialCondition]; break; }
        }
    }

    for (let i = 0; i < ATTRACTOR_WARMUP; i++) step();

    const n = ATTRACTOR_POINTS;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const alphas = new Float32Array(n);

    for (let i = 0; i < n; i++) {
        step();
        positions[i * 3]     = (s[0] - attr.center[0]) * attr.scale + center.x;
        positions[i * 3 + 1] = (s[1] - attr.center[1]) * attr.scale + center.y;
        positions[i * 3 + 2] = (s[2] - attr.center[2]) * attr.scale + center.z;

        const col = getPaletteColor(attr.palette, i / (n - 1));
        colors[i * 3]     = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
        alphas[i] = ATTRACTOR_ALPHA;
    }

    return {
        line: buildStopLine(positions, colors, alphas),
        rideState: s // comet riding resumes the integration from here
    };
}

// ── Mail hit-plane ─────────────────────────────────────────────────
// Invisible plane over the email line of the landing stop; main.js
// raycasts it (via the orchestrator) for cursor + mailto: clicks.
function buildMailPlane(stop) {
    const pts = stop.points2d;
    let blockMinY = Infinity, blockMaxY = -Infinity;
    for (const p of pts) {
        if (p.y < blockMinY) blockMinY = p.y;
        if (p.y > blockMaxY) blockMaxY = p.y;
    }
    const midY = (blockMinY + blockMaxY) / 2;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
        if (p.c !== 1 || p.y >= midY) continue; // email = bold strokes, lower half
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    const geo = new THREE.PlaneGeometry(
        (maxX - minX) * stop.scale * 1.1,
        (maxY - minY) * stop.scale * 1.3
    );
    const mat = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    });
    mailPlane = new THREE.Mesh(geo, mat);
    planePointToWorld(mailPlane.position, stop.center, stop.right, stop.up,
        stop.scale, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    // Face back along the approach direction (where the camera settles)
    _vec3.copy(stop.normal).negate();
    mailPlane.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(stop.right, stop.up, _vec3)
    );
    return mailPlane;
}

// ── Build ──────────────────────────────────────────────────────────
export function buildWorld(scene) {
    stops = [];
    const placed = [new THREE.Vector3(0, 0, 0)]; // intro counts for separation
    let prev = placed[0];
    let prevDef = null;

    for (const def of ROUTE) {
        // Rock → rock stays tight (the meteors are one scene);
        // everything else scatters far apart
        const tight = def.type === StopType.ROCK && prevDef?.type === StopType.ROCK;
        const center = tight
            ? placeNextCenter(prev, placed, ROCK_HOP_MIN, ROCK_HOP_MAX, ROCK_SEPARATION)
            : placeNextCenter(prev, placed, MIN_HOP, MAX_HOP, MIN_SEPARATION);
        placed.push(center);
        prevDef = def;

        // Planar stops face back along their approach direction so the
        // arriving camera sees them head-on; basis stays upright.
        const normal = _dir.copy(center).sub(prev).normalize().clone();
        const right = new THREE.Vector3()
            .crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, normal).normalize();

        const paletteIdx = def.attractorIdx ?? def.paletteIdx ?? 0;
        const palette = ATTRACTORS[paletteIdx].palette;
        const built = def.type === StopType.ATTRACTOR
            ? buildAttractorStop(def, center)
            : buildPlanarStop(def, center, right, up, palette);

        const stop = {
            type: def.type,
            attractorIdx: def.attractorIdx,
            paletteIdx,
            center,
            right,
            up,
            normal,
            ...built
        };
        scene.add(stop.line);
        stops.push(stop);
        prev = center;
    }

    const landing = stops[stops.length - 1];
    scene.add(buildMailPlane(landing));
    return stops;
}
