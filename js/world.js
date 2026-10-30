// ── Static World ───────────────────────────────────────────────────
// Builds every journey stop as pre-existing geometry at load: the
// trait text block, milestone rocks and the contact landing are scattered
// randomly through 3D space, each glowing in its own palette from
// frame one. Five strange attractors hang beside the flight legs as
// dim, slowly spinning scenery ("galaxies"). The comet (orchestrator)
// flies between the stops and swings past a galaxy on the way.
// After the last rock the journey warps into the projects tunnel
// (tunnel.js): the project stops sit on its centreline, each with a live
// visualization (projectViz.js); smaller fly-by projects hang on the wall.

import * as THREE from 'three';
import { ATTRACTORS, rk4Step, isMobile, getPaletteColor } from './attractors.js';
import { generateTextLines, generateRockWithLabel } from './strokeFont.js';
import * as tunnel from './tunnel.js';
import { buildProjectViz, FLYBY_TEXT_BOTTOM } from './projectViz.js';

export const StopType = { TEXT: 0, ROCK: 1, LANDING: 2, PROJECT: 3 };

// ── Content ────────────────────────────────────────────────────────
export const CONTACT_EMAIL = 'ilya.safronos@gmail.com';
const TEXT_LINES = ['CREATIVE.', 'ADAPTIVE.', 'CURIOUS.'];
const LANDING_LINES = ['GET IN TOUCH', CONTACT_EMAIL];
const MILESTONES = [
    { label: 'RVKG', sizeFactor: 0.9, seed: 42, panel: {
        title: 'Riga State Classical Gymnasium',
        subtitle: 'Programming and Mathematics track · Riga',
        items: [
            { text: 'Specialised track in programming and mathematics (today named "Programming + AI").' },
            { text: 'Took part in the Latvian state mathematics olympiads.' },
            { text: 'Completed the Small Mathematics University (Mazā matemātikas universitāte) at the University of Latvia.' },
            { text: 'School projects in Programming I and II; one became the Offline Graphing Calculator (2023).' }
        ]
    }},
    { label: 'RTU', sizeFactor: 0.7, seed: 73, panel: {
        title: 'Riga Technical University',
        subtitle: 'Professional Bachelor, Financial Engineering',
        dates: '2024 – 2028 (expected)',
        items: [
            { text: 'Qualification: senior data analysis specialist. Maths, statistics and programming applied to finance.' },
            { text: 'Coursework: mathematical analysis and algebra, probability and statistics, econometrics, time-series analysis, stochastic analysis, Monte Carlo methods, portfolio analysis, actuarial mathematics, data structures and algorithms, databases/SQL, computer networks, programming (Java, C++).' }
        ]
    }},
    { label: 'AI TALENT', sizeFactor: 0.65, seed: 58, panel: {
        title: 'AI Talent Program',
        subtitle: 'Ponder · Mākslīgā intelekta talantu programma',
        dates: 'Nov 2024 – Jan 2025',
        items: [
            { text: 'Selective program for young people strong in IT and maths. Entry by logic test and interview.' },
            { text: 'Intensive training in C++, Python, maths and AI development, with mentors from the industry.' },
            { text: 'It led to my R&D Engineer role at Giraffe360.' }
        ],
        more: { href: 'https://www.ponder.lv/mi-programma', label: 'ponder.lv' }
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
    { label: 'BALANCER', sizeFactor: 0.6, seed: 105, panel: {
        title: 'load-balancing-experiments',
        subtitle: 'RTU networks project · Python',
        dates: '2026',
        items: [
            { text: 'DNS round robin and anycast, measured from Riga.' },
            { text: 'Queueing simulation of load-balancing policies, including power of two choices.' },
            { text: 'Consistent, rendezvous and Maglev hashing; a mini load balancer with health checks.' }
        ],
        more: { href: 'https://github.com/ilyaeis/load-balancing-experiments', label: 'github' }
    }},
    { label: 'FLOW', sizeFactor: 0.55, seed: 23, panel: {
        title: 'Flow — workout tracker app',
        subtitle: 'Offline workout tracker · Dart/Flutter · private',
        dates: '2026',
        items: [
            { text: 'Log sets with live timers.' },
            { text: 'Volume, load (ACWR), records and body measurements; custom formulas.' },
            { text: 'JSON, CSV and PDF export; CI with golden-image tests.' },
            { text: 'In daily use.' },
            { text: 'Skills: mobile app development (Flutter/Dart), data modelling, testing and CI.' }
        ]
    }},
    { label: 'MONTE CARLO', sizeFactor: 0.65, seed: 112, panel: {
        title: 'Monte Carlo Methods in Finance',
        subtitle: 'Python · NumPy · SciPy · pandas · arch',
        dates: '2026',
        items: [
            { text: 'Priced options by simulation and checked them against Black-Scholes; variance reduction cut the variance by up to 1,900x.' },
            { text: 'Fitted GARCH volatility to S&P 500 returns and backtested three 99% VaR models over 12 years (Kupiec test).' },
            { text: 'Efficient frontier from 30,000 random portfolios and CAPM betas. A study project from my RTU Financial Engineering courses.' }
        ],
        more: { href: 'https://github.com/ilyaeis/monte-carlo-finance', label: 'github' }
    }},
    { label: 'NEAT', sizeFactor: 0.65, seed: 64, panel: {
        title: 'projects_with_NEAT',
        subtitle: 'Neuroevolution · Python',
        dates: '2025',
        items: [
            { text: 'NEAT agents learn Flappy Bird and Pong.' },
            { text: 'A documented attempt at multi-snake survival.' }
        ],
        more: { href: 'https://github.com/ilyaeis/projects_with_NEAT', label: 'github' }
    }},
    { label: 'CALCULATOR', sizeFactor: 0.7, seed: 37, panel: {
        title: 'Offline Graphing Calculator',
        subtitle: 'RBS programming competition · 4th place',
        dates: '2023',
        items: [
            { text: 'A graphing calculator that plots functions and does maths with no internet connection.' },
            { text: 'Built with Iļja Volinskis at Riga State Classical Gymnasium.' },
            { text: '4th place in the Riga Business School (RTU) programming competition for secondary school students: 27 entries, 10 finalists, final on 10 June 2023.' },
            { text: 'Skills: algorithms for parsing and plotting maths, teamwork, presenting to a jury.' }
        ],
        more: { href: 'https://rbs.lv/blog/2023/06/12/event-search-app-wins-programming-competition-for-high-school-students/', label: 'competition results' }
    }},
    { label: 'SORTING', sizeFactor: 0.6, seed: 91, panel: {
        title: 'Sorting visualizer (sort_visualization)',
        subtitle: 'C++ · SFML',
        dates: '2022',
        items: [
            { text: '16 sorting algorithms animated as columns, points, circles, spirals and pyramids, with shuffle patterns and speed control.' },
            { text: 'Source: sort_visualization on GitHub.', href: 'https://github.com/ilyaeis/sort_visualization' },
            { text: 'Skills: C++, algorithms and data structures, graphics (SFML). Every line written by hand, before AI tools.' }
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
// leg 1 (text -> rock 1) has the first galaxy. Attractor k % ATTRACTORS.length is reused
// when there are more legs than attractors.
// No galaxies on the warp into the tunnel (5) or inside it (6, 7).
const SCENERY_LEGS = [1, 2, 3, 4, 8];

// Projects tunnel (tunnel.js): entry point E = GIRAFFE360 + e1 × TUNNEL_HOP,
// project stops at s = TUNNEL_FIRST + k × TUNNEL_SPACING along the centreline
const TUNNEL_HOP = [30, 34];
const TUNNEL_FIRST = 40;                 // s of the first project stop
const TUNNEL_SPACING = 44;               // s between project stops (~5 s flights)
const TUNNEL_EXIT_AFTER = 26;            // the tunnel ends this far after the last stop
const TUNNEL_PITCH = 0.3;                // |y| of the tunnel axis (keeps stops upright)
const TUNNEL_CLEAR = 15;                 // other stops stay this far from the tunnel axis
const EXIT_SPREAD = 0.6;                 // the stop after the tunnel sits within ~±30° of the exit tangent
// Project stop: the comet frames the viz (rounded rectangle), then writes the label under it
const PROJECT_FRAME_MARGIN = 0.1;        // world units around the viz bounds
const PROJECT_FRAME_RADIUS = 0.16;       // corner radius
const PROJECT_LABEL_GAP = 0.14;          // frame bottom → label top
const PROJECT_DENSITY = 200;             // 2D stroke points per unit (trace speed is per point)
// Fly-bys: smaller projects on the tunnel centreline between the stops;
// the comet spirals round each one (orchestrator)
const FLYBY_SCALE = 0.8;
const FLYBY_FIRST_AT = 0.4;              // the fly-by before the first stop sits at this share of its s
const FLYBY_SIDE = 2.1;                  // viz centre this far beside the axis (left, right, left): the camera passes it, not through it

// Random scatter — each stop hops far from the previous one in a
// random 3D direction (lightly biased outward so the journey keeps
// drifting away from the intro), never closer than MIN_SEPARATION to
// another. The meteor rocks are one scene: they cluster tightly.
const MIN_HOP = 34;
const MAX_HOP = 42;
const ROCK_HOP_MIN = 32;                 // rock → rock (same scene)
const ROCK_HOP_MAX = 40;
const MIN_SEPARATION = 26;
const ROCK_SEPARATION = 22;              // rocks may sit near each other

const TEXT_DIM_ALPHA = 0.25;            // the text block starts dim; lit as the comet traces it (1.0 = always lit)
const PLACE_TRIES = 12;
const MAX_PITCH = 0.55;                  // |y| of hop direction — keeps text upright

// Overall outward drift of the journey
export const journeyDir = new THREE.Vector3(0.45, 0.08, -0.89).normalize();

// Visit order. Planar stops carry their own paletteIdx (into the
// ATTRACTORS table) so every scene glows in a different color — the
// first four milestone rocks are ONE scene and share a single palette.
// The text block is one stop; the comet traces it, spirals around it and
// flies on without a tap (orchestrator).
const ROUTE = [
    { id: 'traits',     universe: 'intro',      type: StopType.TEXT,    paletteIdx: 0,
      title: 'Traits', summary: 'Creative. Adaptive. Curious.' },
    { id: 'rvkg',       universe: 'milestones', type: StopType.ROCK,    milestone: 0, paletteIdx: 1,
      summary: 'Programming and mathematics track; state mathematics olympiads.' },
    { id: 'rtu',        universe: 'milestones', type: StopType.ROCK,    milestone: 1, paletteIdx: 1,
      summary: 'Professional Bachelor in Financial Engineering.' },
    { id: 'ai-talent',  universe: 'milestones', type: StopType.ROCK,    milestone: 2, paletteIdx: 1,
      summary: 'Ponder AI talent program.' },
    { id: 'giraffe360', universe: 'milestones', type: StopType.ROCK,    milestone: 3, paletteIdx: 1,
      summary: 'R&D engineer working on 3D Gaussian splatting reconstruction.' },
    { id: 'flow',       universe: 'projects',   type: StopType.PROJECT, milestone: 5, paletteIdx: 2,
      summary: 'Offline workout tracker app (Dart/Flutter).' },
    { id: 'calculator', universe: 'projects',   type: StopType.PROJECT, milestone: 8, paletteIdx: 2,
      summary: 'Offline graphing calculator; 4th place in a programming competition.' },
    { id: 'sorting',    universe: 'projects',   type: StopType.PROJECT, milestone: 9, paletteIdx: 2,
      summary: 'Sorting algorithm visualizer (C++/SFML).' },
    { id: 'contact',    universe: 'contact',    type: StopType.LANDING, paletteIdx: 4,
      title: 'Contact', summary: 'Get in touch by email, LinkedIn or GitHub.' },
];
// Universes are names, not indexes. A new universe is a new entry here
// plus ROUTE entries that use its id.
export const UNIVERSES = [
    { id: 'intro',      title: 'Intro' },
    { id: 'milestones', title: 'Milestones' },
    { id: 'projects',   title: 'Projects' },
    { id: 'contact',    title: 'Contact' },
];
// Fly-by projects (no stop, no panel): `before` = the project stop they hang in front of;
// title and skills line say what each one is and shows
const FLYBYS = [
    { id: 'balancer', milestone: 4, before: 0, title: 'LOAD BALANCING LAB', skills: 'NETWORKING · DISTRIBUTED SYSTEMS · PYTHON' },
    { id: 'monte-carlo', milestone: 6, before: 1, title: 'MONTE CARLO FINANCE', skills: 'RISK MODELLING · STATISTICS · PYTHON' },
    { id: 'neat', milestone: 7, before: 2, title: 'NEUROEVOLUTION AI', skills: 'MACHINE LEARNING · GAME AI · PYTHON' },
];

// Static catalog of every stop and fly-by (no WebGL needed): the agent API
// reads it before the world is built. `index` = position in stops[].
// Fly-bys are listed but not navigable (`near` = the stop they hang before).
const TYPE_NAMES = { [StopType.TEXT]: 'text', [StopType.ROCK]: 'rock', [StopType.PROJECT]: 'project', [StopType.LANDING]: 'landing' };
export const catalog = [
    ...ROUTE.map((d, index) => ({
        id: d.id, universe: d.universe, type: TYPE_NAMES[d.type], index,
        title: d.title ?? MILESTONES[d.milestone].panel.title,
        summary: d.summary,
        panel: d.milestone !== undefined ? MILESTONES[d.milestone].panel : null,
        navigable: true
    })),
    ...FLYBYS.map(fb => {
        const near = ROUTE.filter(d => d.type === StopType.PROJECT)[fb.before].id;
        const panel = MILESTONES[fb.milestone].panel;
        return { id: fb.id, universe: 'projects', type: 'flyby', index: -1, title: panel.title,
                 summary: fb.skills, panel, navigable: false, near };
    })
];
export function stopById(id) { return catalog.find(e => e.id === id) ?? null; }


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
export let flybys = [];                  // { label, s, viz }
export let tunnelExitS = 0;              // s where the tunnel ends (the warp out)
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

function placeNextCenter(prev, placed, hopMin, hopMax, separation, reject = null) {
    let candidate = null;
    for (let i = 0; i < PLACE_TRIES; i++) {
        candidate = prev.clone().addScaledVector(randomHopDir(_dir), rand(hopMin, hopMax));
        if (placed.every(p => p.distanceTo(candidate) >= separation) && !reject?.(candidate)) break;
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

// ── Project stop strokes ───────────────────────────────────────────
// 2D points (TEXT_SCALE units): a rounded rectangle round the viz, then
// a faint travel to the label under it, then the label. Only the label
// is static geometry; the frame exists only in the comet's trace.
// Returns { points, labelStart }.
function projectPoints(label, halfW, halfH) {
    const k = 1 / TEXT_SCALE;
    const hw = (halfW + PROJECT_FRAME_MARGIN) * k, hh = (halfH + PROJECT_FRAME_MARGIN) * k;
    const r = PROJECT_FRAME_RADIUS * k;
    const pts = [];
    // From the bottom-left corner, clockwise (up the left side first)
    const corners = [[-hw + r, hh - r, Math.PI], [hw - r, hh - r, Math.PI / 2], [hw - r, -hh + r, 0], [-hw + r, -hh + r, -Math.PI / 2]];
    const step = 1 / PROJECT_DENSITY;
    let prev = null;
    const push = (x, y, c) => {
        if (prev) {
            const n = Math.max(1, Math.ceil(Math.hypot(x - prev.x, y - prev.y) / step));
            for (let i = 1; i <= n; i++) pts.push({ x: prev.x + (x - prev.x) * i / n, y: prev.y + (y - prev.y) * i / n, c });
        } else pts.push({ x, y, c });
        prev = { x, y };
    };
    push(-hw, -hh + r, 1);
    for (const [cx, cy, a0] of corners) {
        for (let i = 0; i <= 8; i++) {
            const a = a0 - (Math.PI / 2) * i / 8;
            push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1);
        }
    }
    push(-hw, -hh + r, 1);
    const { points: text } = generateTextLines([label], PROJECT_DENSITY);
    let maxY = -Infinity;
    for (const p of text) maxY = Math.max(maxY, p.y);
    const dy = -hh - PROJECT_LABEL_GAP * k - maxY;
    push(text[0].x, text[0].y + dy, 0);              // faint pen travel to the label
    const labelStart = pts.length;
    for (const p of text) pts.push({ x: p.x, y: p.y + dy, c: p.c });
    return { points: pts, labelStart };
}

// ── Planar stop (text / rock / landing / project) ──────────────────
function buildPlanarStop(def, center, right, up, palette) {
    const scale = def.type === StopType.ROCK ? ROCK_SCALE : TEXT_SCALE;
    let points, staticFrom = 0;
    if (def.type === StopType.ROCK) {
        const ms = MILESTONES[def.milestone];
        ({ points } = generateRockWithLabel(ms.sizeFactor, ms.seed, ms.label, null));
    } else if (def.type === StopType.PROJECT) {
        ({ points, labelStart: staticFrom } = projectPoints(MILESTONES[def.milestone].label, def.vizHalfW, def.vizHalfH));
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
    for (let i = staticFrom; i < n - 1; i++) {
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

    for (let k = 0; k < SCENERY_LEGS.length; k++) {
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
            d = Math.min(d, tunnel.axisDistance(cand, tunnelExitS) - tunnel.TUNNEL_RADIUS - radius - 4); // off the tunnel
            if (d > bestD) { bestD = d; center = cand.clone(); }
        }

        const attr = ATTRACTORS[k % ATTRACTORS.length];
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

// Per frame: galaxies spin, the tunnel moves, and the project
// visualizations near the comet (arc parameter headS) animate.
const VIZ_RANGE = [-12, 60];             // s window (behind, ahead) where a viz updates
const VIZ_FADE = [16, 32];               // |s - headS|: a viz fades out from here to here (the next ones emerge from the dark)
let inTunnel = false;
export function updateWorld(dt, headS) {
    for (const s of scenery) s.line.rotation.y += SCENERY_SPIN * dt;
    tunnel.update(dt);
    for (const st of stops) if (st.viz) updateViz(st.viz, st.tunnelS, headS, dt);
    for (const f of flybys) updateViz(f.viz, f.s, headS, dt);
}
function updateViz(viz, s, headS, dt) {
    if (near(s, headS)) viz.update(dt);
    viz.setVisibility(1 - THREE.MathUtils.smoothstep(Math.abs(s - headS), VIZ_FADE[0], VIZ_FADE[1]), inTunnel);
}
// Inside the tunnel the outside world (galaxies, rocks, landing) is
// hidden: the walls are see-through lines, and far glows would sit on
// top of the visualizations. The warp flash covers the switch.
// The projects (stops and fly-bys) exist only inside: before the warp in
// the tunnel and everything in it is invisible.
export function setOutsideVisible(v) {
    inTunnel = !v;
    for (const s of scenery) s.line.visible = v;
    for (const st of stops) {
        st.line.visible = (st.type === StopType.PROJECT) !== v;
        if (st.viz) st.viz.group.visible = !v;
    }
    for (const f of flybys) f.viz.group.visible = !v;
}
function near(s, headS) { return s - headS > VIZ_RANGE[0] && s - headS < VIZ_RANGE[1]; }

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

// ── Projects tunnel placement ──────────────────────────────────────
// The axis leaves GIRAFFE360 in a random hop direction (pitch-limited);
// every stop placed so far must stay TUNNEL_CLEAR from the axis. Among
// the clear candidates, the one most ahead of the view at GIRAFFE360
// (`viewDir`) wins, so the camera need not swing round at the departure.
function placeTunnel(from, viewDir, placed, length) {
    let best = null, bestScore = -Infinity;
    const e1 = new THREE.Vector3(), E = new THREE.Vector3();
    for (let i = 0; i < PLACE_TRIES * 2; i++) {
        randomHopDir(e1);
        e1.y = THREE.MathUtils.clamp(e1.y, -TUNNEL_PITCH, TUNNEL_PITCH);
        e1.normalize();
        E.copy(from).addScaledVector(e1, rand(TUNNEL_HOP[0], TUNNEL_HOP[1]));
        tunnel.setFrame(E, e1);
        let d = Infinity;
        for (const p of placed) d = Math.min(d, tunnel.axisDistance(p, length));
        const score = d >= TUNNEL_CLEAR ? 10 + e1.dot(viewDir) : d / TUNNEL_CLEAR;
        if (score > bestScore) { bestScore = score; best = { E: E.clone(), e1: e1.clone() }; }
    }
    tunnel.setFrame(best.E, best.e1);
}

// First stop after the tunnel: a hop on from the exit, roughly along the
// exit tangent (no hairpin right after the warp out), clear of the tube
function placeAfterTunnel(placed) {
    const X = tunnel.centreWorld(tunnelExitS, new THREE.Vector3());
    const T = tunnel.tangentWorld(tunnelExitS, new THREE.Vector3());
    let best = null, bestD = -Infinity;
    for (let i = 0; i < PLACE_TRIES * 2; i++) {
        _dir.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(EXIT_SPREAD).add(T);
        _dir.y = THREE.MathUtils.clamp(_dir.y, -MAX_PITCH, MAX_PITCH);
        const c = X.clone().addScaledVector(_dir.normalize(), rand(MIN_HOP, MAX_HOP));
        let d = tunnel.axisDistance(c, tunnelExitS) - TUNNEL_CLEAR;
        for (const p of placed) d = Math.min(d, p.distanceTo(c) - MIN_SEPARATION);
        if (d > bestD) { bestD = d; best = c; }
        if (d >= 0) break;
    }
    return { center: best, prev: X };
}

// ── Build ──────────────────────────────────────────────────────────
export function buildWorld(scene) {
    stops = [];
    flybys = [];
    const placed = [new THREE.Vector3(0, 0, 0)]; // intro counts for separation
    let prev = placed[0];
    let prevDef = null;
    let projectK = 0;
    const nProjects = ROUTE.filter(d => d.type === StopType.PROJECT).length;
    const projectS = k => TUNNEL_FIRST + k * TUNNEL_SPACING;
    tunnelExitS = projectS(nProjects - 1) + TUNNEL_EXIT_AFTER;
    const _r = new THREE.Vector3(), _u = new THREE.Vector3();

    for (const def of ROUTE) {
        // Rock → rock stays tight (the meteors are one scene);
        // everything else scatters far apart
        const tight = def.type === StopType.ROCK && prevDef?.type === StopType.ROCK;
        let center, tunnelS = null;
        if (def.type === StopType.PROJECT) {
            if (projectK === 0) placeTunnel(prev, stops[stops.length - 1].normal, placed, tunnelExitS);
            tunnelS = projectS(projectK++);
            center = tunnel.centreWorld(tunnelS, new THREE.Vector3());
            // Face along the tunnel: `prev` is a point just behind on the centreline
            prev = tunnel.centreWorld(tunnelS - 1, new THREE.Vector3());
        } else if (prevDef?.type === StopType.PROJECT) {
            ({ center, prev } = placeAfterTunnel(placed));
        } else {
            center = tight
                ? placeNextCenter(prev, placed, ROCK_HOP_MIN, ROCK_HOP_MAX, ROCK_SEPARATION)
                : placeNextCenter(prev, placed, MIN_HOP, MAX_HOP, MIN_SEPARATION);
        }
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
        let viz = null;
        if (def.type === StopType.PROJECT) {
            viz = buildProjectViz(MILESTONES[def.milestone].label);
            def.vizHalfW = viz.halfW; def.vizHalfH = viz.halfH;
            viz.group.position.copy(center);
            viz.group.quaternion.setFromRotationMatrix(
                new THREE.Matrix4().makeBasis(right, up, _vec3.copy(normal).negate()));
            scene.add(viz.group);
        }
        const built = buildPlanarStop(def, center, right, up, palette);

        const stop = {
            id: def.id,
            universe: def.universe,
            type: def.type,
            paletteIdx,
            panel: def.milestone !== undefined ? MILESTONES[def.milestone].panel : undefined,
            tunnelS,
            viz,
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

    // Fly-bys: just beside the centreline, facing the approaching comet.
    // The comet spirals round an axis along the tunnel through the centre
    // of viz + text. `offset` = that centre minus the centreline point,
    // `radius` = half-diagonal of viz + text (world units).
    const sOfStop = stops.filter(st => st.type === StopType.PROJECT).map(st => st.tunnelS);
    for (const fb of FLYBYS) {
        // (the first one a little early: the warp-in flight needs room after it to reframe the stop)
        const s = fb.before === 0 ? sOfStop[0] * FLYBY_FIRST_AT : (sOfStop[fb.before - 1] + sOfStop[fb.before]) / 2;
        const label = MILESTONES[fb.milestone].label;
        const viz = buildProjectViz(label, { title: fb.title, skills: fb.skills });
        const c = tunnel.centreWorld(s, new THREE.Vector3());
        const T = tunnel.tangentWorld(s, new THREE.Vector3());
        tunnel.frameWorld(s, _r, _u);
        const top = viz.halfH, bottom = FLYBY_TEXT_BOTTOM;  // local y range
        const mid = (top + bottom) / 2 * FLYBY_SCALE;
        const offset = _r.clone().multiplyScalar(flybys.length % 2 ? FLYBY_SIDE : -FLYBY_SIDE);
        viz.group.position.copy(c).add(offset).addScaledVector(_u, -mid);
        viz.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(_r, _u, T.clone().negate()));
        viz.group.scale.setScalar(FLYBY_SCALE);
        scene.add(viz.group);
        const radius = Math.hypot(viz.halfW, (top - bottom) / 2) * FLYBY_SCALE;
        flybys.push({ label, s, viz, radius, T, offset, center: c.clone().add(offset) });
    }

    tunnel.build(scene);
    buildScenery(scene);
    setOutsideVisible(true);

    const landing = stops[stops.length - 1];
    scene.add(buildMailPlane(landing));
    return stops;
}
