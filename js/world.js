// ── Static World ───────────────────────────────────────────────────
// Builds every journey stop as pre-existing geometry at load: the
// trait text, milestone rocks, pre-integrated attractor curves and
// the contact landing all sit dim in world space from frame one.
// Each stop "lights up" with a reveal sweep when the comet arrives
// (uReveal uniform sweeping the aT vertex attribute).

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
const DIM_COLOR = new THREE.Color(0x555555);
const DIM_ALPHA_PLANAR = 0.30;           // matches the old grey rock previews
const DIM_ALPHA_ATTRACTOR = 0.10;        // 12k additive points need less
const REVEAL_DURATION = 1.5;             // seconds for the light-up sweep
const REVEAL_EDGE = 0.06;                // soft front of the sweep (in aT units)

// ── Journey layout ─────────────────────────────────────────────────
// One fixed direction through world space; stops scatter sideways off
// the line so the route swings instead of marching straight.
export const journeyDir = new THREE.Vector3(0.45, 0.08, -0.89).normalize();
const journeyRight = new THREE.Vector3()
    .crossVectors(journeyDir, new THREE.Vector3(0, 1, 0)).normalize();
const journeyUp = new THREE.Vector3()
    .crossVectors(journeyRight, journeyDir).normalize();

// dist = units along journeyDir from the intro origin; offR/offU lateral
const ROUTE = [
    { type: StopType.TEXT,      dist: 10,   offR:  0.0, offU:  0.0 },
    { type: StopType.ATTRACTOR, dist: 19,   offR: -1.2, offU:  0.5, attractorIdx: 0 },
    { type: StopType.ROCK,      dist: 26,   offR: -2.4, offU:  1.2, milestone: 0 },
    { type: StopType.ROCK,      dist: 31,   offR:  0.6, offU:  0.6, milestone: 1 },
    { type: StopType.ROCK,      dist: 35.5, offR: -1.0, offU: -0.8, milestone: 2 },
    { type: StopType.ATTRACTOR, dist: 44,   offR:  1.4, offU: -0.4, attractorIdx: 1 },
    { type: StopType.ATTRACTOR, dist: 53,   offR: -0.8, offU:  0.9, attractorIdx: 2 },
    { type: StopType.ATTRACTOR, dist: 62,   offR:  1.0, offU:  0.6, attractorIdx: 3 },
    { type: StopType.ATTRACTOR, dist: 71,   offR: -1.2, offU: -0.5, attractorIdx: 4 },
    { type: StopType.LANDING,   dist: 80,   offR:  0.0, offU:  0.0 },
];

// ── Reveal shader ──────────────────────────────────────────────────
// Vertices before the sweep front render in full baked color (HDR,
// feeds the bloom); vertices past it render dim grey.
const STOP_VERTEX = `
    attribute vec3 color;
    attribute float aAlpha;
    attribute float aT;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vT;
    void main() {
        vColor = color;
        vAlpha = aAlpha;
        vT = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const STOP_FRAGMENT = `
    uniform float uReveal;
    uniform vec3 uDimColor;
    uniform float uDimAlpha;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vT;
    void main() {
        float lit = 1.0 - smoothstep(uReveal - ${REVEAL_EDGE.toFixed(3)}, uReveal, vT);
        vec3 col = mix(uDimColor, vColor, lit);
        float a = mix(uDimAlpha, vAlpha, lit);
        if (a < 0.003) discard;
        gl_FragColor = vec4(col, a);
    }
`;

// ── State ──────────────────────────────────────────────────────────
export let stops = [];
let mailPlane = null;
export function getMailPlane() { return mailPlane; }

const _vec3 = new THREE.Vector3();

// ── 2D plane → world space ─────────────────────────────────────────
export function planePointToWorld(out, center, right, up, scale, p) {
    return out.set(
        center.x + (p.x * right.x + p.y * up.x) * scale,
        center.y + (p.x * right.y + p.y * up.y) * scale,
        center.z + (p.x * right.z + p.y * up.z) * scale
    );
}

// ── Line builder ───────────────────────────────────────────────────
function buildStopLine(positions, colors, alphas, dimAlpha) {
    const n = alphas.length;
    const aT = new Float32Array(n);
    for (let i = 0; i < n; i++) aT[i] = n > 1 ? i / (n - 1) : 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.computeBoundingSphere();

    const mat = new THREE.ShaderMaterial({
        vertexShader: STOP_VERTEX,
        fragmentShader: STOP_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
            uReveal: { value: 0 },
            uDimColor: { value: DIM_COLOR },
            uDimAlpha: { value: dimAlpha }
        }
    });

    return new THREE.Line(geo, mat); // static — default frustum culling applies
}

// ── Planar stop (text / rock / landing) ────────────────────────────
function buildPlanarStop(def, center, palette) {
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
        planePointToWorld(_vec3, center, journeyRight, journeyUp, scale, p);
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
        line: buildStopLine(positions, colors, alphas, DIM_ALPHA_PLANAR),
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
        line: buildStopLine(positions, colors, alphas, DIM_ALPHA_ATTRACTOR),
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
    planePointToWorld(mailPlane.position, stop.center, journeyRight, journeyUp,
        stop.scale, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    // Face back along the approach direction (where the camera settles)
    _vec3.copy(journeyDir).negate();
    mailPlane.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(journeyRight, journeyUp, _vec3)
    );
    return mailPlane;
}

// ── Build ──────────────────────────────────────────────────────────
export function buildWorld(scene) {
    stops = [];
    for (const def of ROUTE) {
        const center = new THREE.Vector3()
            .addScaledVector(journeyDir, def.dist)
            .addScaledVector(journeyRight, def.offR)
            .addScaledVector(journeyUp, def.offU);

        // Planar stops keep the Lorenz palette the journey starts with
        const palette = ATTRACTORS[def.attractorIdx ?? 0].palette;
        const built = def.type === StopType.ATTRACTOR
            ? buildAttractorStop(def, center)
            : buildPlanarStop(def, center, palette);

        const stop = {
            type: def.type,
            attractorIdx: def.attractorIdx,
            center,
            right: journeyRight,
            up: journeyUp,
            normal: journeyDir,
            reveal: 0,
            revealTarget: 0,
            ...built
        };
        scene.add(stop.line);
        stops.push(stop);
    }

    const landing = stops[stops.length - 1];
    scene.add(buildMailPlane(landing));
    return stops;
}

// ── Per-frame reveal easing ────────────────────────────────────────
export function lightStop(stop) { stop.revealTarget = 1; }

export function updateWorld(dt) {
    for (const stop of stops) {
        if (stop.reveal >= stop.revealTarget) continue;
        stop.reveal = Math.min(stop.revealTarget, stop.reveal + dt / REVEAL_DURATION);
        // Push the front slightly past 1 so the soft edge fully clears
        stop.line.material.uniforms.uReveal.value = stop.reveal * (1 + REVEAL_EDGE);
    }
}
