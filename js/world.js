// ── Static World ───────────────────────────────────────────────────
// Builds every journey stop as pre-existing geometry at load: the
// trait text block, milestone rocks and the contact landing are scattered
// randomly through 3D space, each glowing in its own palette from
// frame one. Five strange attractors hang beside the flight legs as
// dim, slowly spinning scenery ("galaxies"). The comet (orchestrator)
// flies between the stops and swings past a galaxy on the way.

import * as THREE from 'three';
import { ATTRACTORS, rk4Step, isMobile, getPaletteColor } from './attractors.js';
import { generateTextLines, generateRockWithLabel } from './strokeFont.js';

export const StopType = { TEXT: 0, ROCK: 1, LANDING: 2 };

// ── Content ────────────────────────────────────────────────────────
export const CONTACT_EMAIL = 'ilya.safronos@gmail.com';
const TEXT_LINES = ['CREATIVE.', 'ADAPTIVE.', 'CURIOUS.'];
const LANDING_LINES = ['GET IN TOUCH', CONTACT_EMAIL];
const MILESTONES = [
    { label: 'RVKG', sizeFactor: 0.9, seed: 42, panel: {
        title: 'Riga State Classical Gymnasium',
        subtitle: 'Rīgas Valsts klasiskā ģimnāzija · Riga',
        items: [{ text: 'Secondary education in Riga.' }]
    }},
    { label: 'RTU', sizeFactor: 0.7, seed: 73, panel: {
        title: 'Riga Technical University',
        subtitle: 'BSc Financial Engineering',
        dates: '2024 – present',
        items: [
            { text: 'Coursework: data structures & algorithms, computer networks, databases/SQL, Java, C++.' },
            { text: 'MI Talantu programma (AI talent programme), C++ and Python · Nov 2024 – Jan 2025.' }
        ]
    }},
    { label: 'GIRAFFE360', sizeFactor: 0.55, seed: 17, panel: {
        title: 'Giraffe360',
        subtitle: 'R&D Engineer · Riga',
        dates: '2025 – present',
        items: [
            { text: '3D Gaussian Splatting pipeline: 360° captures → navigable 3D scenes (Python, PyTorch, CUDA).' },
            { text: 'Read research papers, implemented new methods in the pipeline by hand.' },
            { text: 'OpenAI API: prompts and descriptions for tour videos (AWS worker, S3).' },
            { text: 'Diffusion-based artifact fixing (Difix, NVIDIA Fixer); mesh generation.' },
            { text: 'GPU training/eval with ClearML, Docker, GitLab CI.' }
        ],
        more: { href: 'resume.html', label: 'full resume' }
    }},
    { label: 'PROJECTS', sizeFactor: 0.6, seed: 91, panel: {
        title: 'Selected projects',
        subtitle: 'github.com/ilyaeis',
        dates: '2022 – 2026',
        items: [
            { text: 'load-balancing-experiments — DNS/anycast, queueing sim, consistent hashing (Python)', href: 'https://github.com/ilyaeis/load-balancing-experiments' },
            { text: 'flow — offline workout tracker I use daily (Flutter, private)' },
            { text: 'projects_with_NEAT — neuroevolution agents learning games (Python)', href: 'https://github.com/ilyaeis/projects_with_NEAT' },
            { text: 'sort_visualization — 16 sorting algorithms animated (C++, SFML)', href: 'https://github.com/ilyaeis/sort_visualization' }
        ],
        more: { href: 'https://github.com/ilyaeis', label: 'all repositories' }
    }}
];

// ── Tuning ─────────────────────────────────────────────────────────
export const TEXT_SCALE = 0.22;          // world units per 2D unit (text/landing)
export const ROCK_SCALE = 0.4;           // world units per 2D unit (rocks)
const STROKE_INTENSITY = 1.5;            // bold letter strokes (HDR → bloom)
const LINK_INTENSITY = 0.35;             // faint pen-travel strokes

// Attractor scenery ("galaxies"): static dim curves beside the flight legs
const SCENERY_POINTS = isMobile ? 6000 : 12000;
const SCENERY_WARMUP = 500;              // integration steps before recording
const SCENERY_ALPHA = 0.28;              // per-point alpha
const SCENERY_SCALE_FRAC = 0.16;         // curve radius ≈ frac × leg length
const SCENERY_SCALE_MIN = 2.0;           // world units (curve radius)
const SCENERY_SCALE_MAX = 6.0;
const SCENERY_STANDOFF = 0.35;           // center sits this × leg length beside the leg midpoint
const SCENERY_STANDOFF_MIN = 5.0;
const SCENERY_SPIN = 0.04;               // rad/s about local Y
// leg i = flight into stops[i]; leg 0 is the intro corkscrew into the text,
// leg 1 (text -> rock 1) has the first galaxy
const SCENERY_LEGS = [1, 2, 3, 4, 5];

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

const TEXT_DIM_ALPHA = 0.25;            // the text block starts dim; lit as the comet traces it (1.0 = always lit)
const PLACE_TRIES = 12;
const MAX_PITCH = 0.55;                  // |y| of hop direction — keeps text upright

// Overall outward drift of the journey
export const journeyDir = new THREE.Vector3(0.45, 0.08, -0.89).normalize();

// Visit order. Planar stops carry their own paletteIdx (into the
// ATTRACTORS table) so every scene glows in a different color — the
// four milestone rocks are ONE scene and share a single palette.
// The text block is one stop; the comet traces it, spirals around it and
// flies on without a tap (orchestrator).
const ROUTE = [
    { type: StopType.TEXT,    paletteIdx: 0 },
    { type: StopType.ROCK,    milestone: 0, paletteIdx: 1 },
    { type: StopType.ROCK,    milestone: 1, paletteIdx: 1 },
    { type: StopType.ROCK,    milestone: 2, paletteIdx: 1 },
    { type: StopType.ROCK,    milestone: 3, paletteIdx: 1 },
    { type: StopType.LANDING, paletteIdx: 4 },
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
export let scenery = [];
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
function buildStopLine(positions, colors, alphas, segments = false) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.computeBoundingSphere();
    // segments → disconnected stroke pairs (letters with no connectors);
    // otherwise a continuous strip (attractor curves). Static either way.
    return segments
        ? new THREE.LineSegments(geo, getStopMaterial())
        : new THREE.Line(geo, getStopMaterial());
}

// ── Planar stop (text / rock / landing) ────────────────────────────
function buildPlanarStop(def, center, right, up, palette) {
    const scale = def.type === StopType.ROCK ? ROCK_SCALE : TEXT_SCALE;
    let points;
    if (def.type === StopType.ROCK) {
        const ms = MILESTONES[def.milestone];
        ({ points } = generateRockWithLabel(ms.sizeFactor, ms.seed, ms.label, null));
    } else {
        ({ points } = generateTextLines(
            def.type === StopType.LANDING ? LANDING_LINES : TEXT_LINES));
    }

    const n = points.length;
    let maxAbsX = 0, maxAbsY = 0, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
        maxAbsX = Math.max(maxAbsX, Math.abs(points[i].x));
        maxAbsY = Math.max(maxAbsY, Math.abs(points[i].y));
        minY = Math.min(minY, points[i].y);
        maxY = Math.max(maxY, points[i].y);
    }

    // Only the bold strokes (c=1) are drawn as static geometry — the
    // faint pen-travel/connectors (c=0) are omitted entirely so nothing
    // links the letters/meteors together. Each drawn segment joins two
    // consecutive c=1 points; gaps (a c=0 between them) break the line.
    // The comet still flies the full path (connectors included) at run
    // time — those only ever show transiently in its trail.
    const segPos = [];
    const segCol = [];
    const segAlpha = [];
    const segIdx = [];
    function pushVertex(i) {
        const p = points[i];
        planePointToWorld(_vec3, center, right, up, scale, p);
        segPos.push(_vec3.x, _vec3.y, _vec3.z);
        const col = getPaletteColor(palette, n > 1 ? i / (n - 1) : 0);
        segCol.push(col.r * STROKE_INTENSITY, col.g * STROKE_INTENSITY, col.b * STROKE_INTENSITY);
        segAlpha.push(def.type === StopType.TEXT ? TEXT_DIM_ALPHA : 1.0);
        segIdx.push(i);
    }
    for (let i = 0; i < n - 1; i++) {
        if (points[i].c === 1 && points[i + 1].c === 1) {
            pushVertex(i);
            pushVertex(i + 1);
        }
    }

    return {
        line: buildStopLine(
            new Float32Array(segPos),
            new Float32Array(segCol),
            new Float32Array(segAlpha),
            /* segments */ true
        ),
        points2d: points,
        strokeIdx: new Int32Array(segIdx),
        litVertex: 0,
        scale,
        halfW: maxAbsX * scale,
        halfH: maxAbsY * scale,
        blockMid: (minY + maxY) / 2 * scale,      // block's visual middle along `up` (the 2D origin is line 1's baseline)
        blockHalfH: (maxY - minY) / 2 * scale
    };
}

// ── Attractor scenery (pre-integrated curves) ─────────────────────
// Each curve sits beside one flight leg so the comet can swing past it.
function buildScenery(scene) {
    scenery = [];
    const perp = new THREE.Vector3();
    const base = new THREE.Vector3();
    const cand = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();

    for (let k = 0; k < ATTRACTORS.length; k++) {
        const leg = SCENERY_LEGS[k];
        const a = stops[leg - 1].center, b = stops[leg].center;
        const L = a.distanceTo(b);
        mid.addVectors(a, b).multiplyScalar(0.5);
        dir.subVectors(b, a).normalize();

        const radius = THREE.MathUtils.clamp(L * SCENERY_SCALE_FRAC, SCENERY_SCALE_MIN, SCENERY_SCALE_MAX);
        const standoff = Math.max(L * SCENERY_STANDOFF, SCENERY_STANDOFF_MIN) + radius * 0.5;

        // Perpendicular basis, then try random angles; keep the one that
        // sits farthest from every stop and every earlier galaxy.
        base.crossVectors(dir, new THREE.Vector3(0, 1, 0));
        if (base.lengthSq() < 1e-6) base.set(1, 0, 0);
        base.normalize();
        const base2 = new THREE.Vector3().crossVectors(dir, base).normalize();

        let center = null, bestD = -1;
        for (let t = 0; t < PLACE_TRIES; t++) {
            const ang = Math.random() * Math.PI * 2;
            perp.copy(base).multiplyScalar(Math.cos(ang)).addScaledVector(base2, Math.sin(ang));
            cand.copy(mid).addScaledVector(perp, standoff);
            let d = Infinity;
            for (const st of stops) d = Math.min(d, cand.distanceTo(st.center));
            for (const sc of scenery) d = Math.min(d, cand.distanceTo(sc.center));
            if (d > bestD) { bestD = d; center = cand.clone(); }
        }

        const attr = ATTRACTORS[k];
        let s = [...attr.initialCondition];
        const step = () => {
            s = rk4Step(attr.derivatives, s[0], s[1], s[2], attr.dt, attr.params);
            for (let j = 0; j < 3; j++) {
                if (Math.abs(s[j]) > 150) s[j] *= 150 / Math.abs(s[j]);
                if (!isFinite(s[j])) { s = [...attr.initialCondition]; break; }
            }
        };
        for (let i = 0; i < SCENERY_WARMUP; i++) step();

        const n = SCENERY_POINTS;
        const positions = new Float32Array(n * 3);
        const colors = new Float32Array(n * 3);
        const alphas = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            step();
            // Relative to the origin: the line is moved to `center` so
            // its spin pivots there.
            positions[i * 3]     = (s[0] - attr.center[0]) * attr.scale * radius;
            positions[i * 3 + 1] = (s[1] - attr.center[1]) * attr.scale * radius;
            positions[i * 3 + 2] = (s[2] - attr.center[2]) * attr.scale * radius;
            const col = getPaletteColor(attr.palette, i / (n - 1));
            colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
            alphas[i] = SCENERY_ALPHA;
        }

        const line = buildStopLine(positions, colors, alphas);
        line.position.copy(center);
        scene.add(line);
        scenery.push({ attractorIdx: k, center, radius, line });
    }
}

export function updateScenery(dt) {
    for (const s of scenery) s.line.rotation.y += SCENERY_SPIN * dt;
}

// Brighten a dim stop up to stroke point `uptoIdx` (vertices are in
// point order, so this is a short forward walk from the last lit vertex)
export function lightStop(stop, uptoIdx) {
    const attr = stop.line.geometry.getAttribute('aAlpha');
    let v = stop.litVertex;
    while (v < attr.count && stop.strokeIdx[v] <= uptoIdx) attr.array[v++] = 1.0;
    if (v !== stop.litVertex) { stop.litVertex = v; attr.needsUpdate = true; }
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

        const paletteIdx = def.paletteIdx ?? 0;
        const palette = ATTRACTORS[paletteIdx].palette;
        const built = buildPlanarStop(def, center, right, up, palette);

        const stop = {
            type: def.type,
            paletteIdx,
            panel: def.type === StopType.ROCK ? MILESTONES[def.milestone].panel : undefined,
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

    buildScenery(scene);

    const landing = stops[stops.length - 1];
    scene.add(buildMailPlane(landing));
    return stops;
}
