// ── Static World ───────────────────────────────────────────────────
// Builds every journey stop as pre-existing geometry at load. The site
// starts in a real apartment (a Gaussian splat, room.js renders it): object
// stops (the Giraffe360 R&D areas), each a splat object with a halo ring
// (and one room drawn as depth). The comet lifts out over the window wall
// and warps into the projects tunnel (tunnel.js): the project stops sit on
// its centreline, each with a live visualization (projectViz.js); a smaller
// fly-by project hangs on the wall. The tunnel brings it back over the
// apartment roof, and it dives into the living room to the contact landing.

import * as THREE from 'three';
import { ATTRACTORS, getPaletteColor, camera, controls, renderer, composer } from './attractors.js';
import { generateTextLines } from './strokeFont.js';
import * as tunnel from './tunnel.js';
import { buildProjectViz, FLYBY_TEXT_BOTTOM, VIZ_HALF_W, VIZ_HALF_H, RIM_OUTER_R } from './projectViz.js';

export const StopType = { LANDING: 2, PROJECT: 3, OBJECT: 4 };   // (0, 1 and 5 were the old trait text, rocks and timeline graph)

// ── Content ────────────────────────────────────────────────────────
export const CONTACT_EMAIL = 'ilya.safronos@gmail.com';
const LANDING_LINES = ['GET IN TOUCH', CONTACT_EMAIL];
const MILESTONES = [
    { label: 'NEAT', panel: {
        title: 'projects_with_NEAT',
        subtitle: 'Neuroevolution · Python',
        dates: '2025',
        items: [
            { text: 'NEAT agents learn Flappy Bird and Pong.' },
            { text: 'A documented attempt at multi-snake survival.' }
        ],
        more: { href: 'https://github.com/ilyaeis/projects_with_NEAT', label: 'github' }
    }},
    { label: 'CALCULATOR', panel: {
        title: 'Offline Graphing Calculator',
        subtitle: 'RBS programming competition · 4th place',
        dates: '2023',
        items: [
            { text: '4th place of 27 entries, Riga Business School (RTU) competition.' },
            { text: 'Plots functions and does maths offline; built with Iļja Volinskis.' }
        ],
        more: { href: 'https://rbs.lv/blog/2023/06/12/event-search-app-wins-programming-competition-for-high-school-students/', label: 'competition results' }
    }},
    { label: 'SORTING', panel: {
        title: 'Sorting visualizer (sort_visualization)',
        subtitle: 'C++ · SFML',
        dates: '2022',
        items: [
            { text: '16 sorting algorithms animated in five layouts, with speed control.' },
            { text: 'Every line written by hand in C++, before AI tools.' }
        ],
        more: { href: 'https://github.com/ilyaeis/sort_visualization', label: 'github' },
        // The app behind the portal (dimension.js): its page, and the files
        // fetched on arrival at the stop (their progress lights the rim)
        portal: { href: 'apps/sorting/', label: 'enter the visualizer', title: 'Sorting visualizer',
                  preload: ['apps/sorting/', 'apps/sorting/app.js', 'apps/sorting/drawer.js', 'apps/sorting/worker.js',
                            'apps/sorting/wasm/sortvis.js', 'apps/sorting/wasm/sortvis.wasm', 'apps/sorting/Ruda-Medium.woff2'] }
    }},
    // Giraffe360 R&D (universe 'rnd'): one splat object per area (objects.js), in route order
    { label: 'SPLATTING', panel: {
        title: '3DGS reconstruction from sparse panorama views',
        subtitle: 'Our custom pipeline · in production June 2026 · PyTorch · CUDA',
        items: [
            { text: 'Built the pipeline; splat quality rose a lot over the year.' },
            { text: 'My influence-accumulation densification, building on Taming 3DGS (Mallick et al., 2024); Analytic-Splatting (Liang et al., 2024) in CUDA.' }
        ],
        more: { href: 'https://www.instagram.com/p/DZsNRB8o772/', label: 'Giraffe360 post: the result' }
    }},
    { label: 'WINDOWS', panel: {
        title: 'Windows, outdoor views and mirrors',
        subtitle: 'Sparse-panorama 3DGS · production default since 1 June 2026',
        items: [
            { text: 'Shipped 1 June 2026 after 140+, then 600+ experiments.' },
            { text: 'Fixed blurry windows, outdoor views and mirrors.' }
        ],
        // Click-to-load: nothing from instagram.com loads before the click (stopPanel.js)
        embed: { src: 'https://www.instagram.com/p/DZsNRB8o772/embed/captioned/',
                 label: 'Show the Giraffe360 post (before / after)',
                 title: 'Giraffe360 Instagram post: window and mirror renders, before / after' },
        more: { href: 'https://www.instagram.com/p/DZsNRB8o772/', label: 'Giraffe360 post: open on Instagram' }
    }},
    { label: 'BENCHMARKING', panel: {
        title: 'Benchmarking and evaluation',
        subtitle: 'GPU training · Docker · GitLab CI',
        items: [
            { text: 'Validation tools that check quality against ground-truth datasets.' },
            { text: 'Experiment runner: AI-agent-driven training runs on local GPUs.' }
        ],
        more: { href: 'resume.html#ai-automation', label: 'details in the resume' }
    }},
    { label: 'MESHES AND VIEWERS', panel: {
        title: 'Meshes and viewers',
        subtitle: 'Mesh generation · Rust · wgpu',
        items: [
            { text: 'An embeddable Rust/wgpu splat viewer that any app can control.' },
            { text: 'Mesh generation and point-count reduction for viewers.' }
        ],
        more: { href: 'resume.html#splat-viewer', label: 'details in the resume' }
    }},
    { label: 'MCP SERVER', panel: {
        title: 'MCP server and ideas',
        subtitle: 'MCP server for the team task board · Node.js',
        items: [
            { text: 'Looped drone: my hackathon idea, launched by Giraffe360 in Oct 2026.',
              href: 'https://www.instagram.com/giraffe360/reel/Dd9ODBVIHhE/' },
            { text: 'AI agents and tools read and write the board through it; colleagues use it.' }
        ],
        more: { href: 'resume.html#ai-automation', label: 'details in the resume' }
    }},
    // The depth room (bedroom2, js/depthRoom.js). Honest: the colours are this
    // public scene's own depth, not the output of the method in the second item
    { label: 'DEPTH', panel: {
        title: 'Depth',
        subtitle: 'This room is drawn as depth: colour = distance from your eye',
        items: [
            { text: "The colours are this public scene's own depth, not my method's output." },
            { text: 'At Giraffe360 I mentored a junior on a new depth method. Mostly his work; the whole team uses it now.' }
        ],
        more: { href: 'resume.html#depth-method', label: 'details in the resume' }
    }}
];

// ── Tuning ─────────────────────────────────────────────────────────
const TEXT_SCALE = 0.22;          // world units per 2D unit (text/landing)
const STROKE_INTENSITY = 1.5;            // bold letter strokes (HDR → bloom)
const LINK_INTENSITY = 0.35;             // faint pen-travel strokes

// Projects tunnel (tunnel.js): entry point E = apartment window + e1 × TUNNEL_HOP.
// Along s: the warp throat at 0, a rush, the first fly-by at TUNNEL_RUSH,
// then project stop, fly-by, stop ... each FLYBY_GAP apart (two stops with
// no fly-by between them: STOP_GAP), then the exit.
// The middle of every gap is a fast zone (the comet rushes, the tunnel
// straightens there).
const TUNNEL_HOP = [30, 34];
const TUNNEL_RUSH = 100;                  // s of the first fly-by (~2 s of rush after the warp in)
const FLYBY_GAP = 90;                    // s between a fly-by and the next project stop (and stop -> fly-by)
const STOP_GAP = 180;                    // s between two stops with no fly-by between them (135 or 90: the hop arrival turned the camera at up to 100-107 deg/s)
const TUNNEL_EXIT_AFTER = 150;           // the tunnel ends this far after the last stop (a rush before the warp out; at 110 the shorter two-stop tunnel bent the warp out to 160-198 u/s2)
const FAST_ZONE_RAMP = 48;               // s: speed / straightness ramps at each end of a fast zone
const FAST_ZONE_MARGIN = [4, 10, 24];    // fast zones end this far from the throat / a stop or fly-by / the exit (slow there: spiral, framing, arrival, mouth)
const TUNNEL_CLEAR = 15;                 // other stops stay this far from the tunnel axis
const TUNNEL_EXIT_FREE = 30;             // the last this many units of s may pass near the apartment (the warp out comes home)
const EXIT_DIVE = 0.25;                  // the tunnel leaves the window this much downwards (y of e1 before normalising)
// Project stop: the comet frames the viz (rounded rectangle), then writes the label under it
const PROJECT_FRAME_MARGIN = 0.1;        // world units around the viz bounds
const PROJECT_FRAME_RADIUS = 0.16;       // corner radius
const PROJECT_LABEL_GAP = 0.14;          // frame bottom → label top
const PROJECT_DENSITY = 200;             // 2D stroke points per unit (trace speed is per point)
// Fly-bys: smaller projects on the tunnel centreline between the stops;
// the comet spirals round each one (orchestrator)
const FLYBY_SCALE = 0.8;
const FLYBY_SIDE = 2.1;                  // viz centre this far beside the axis (left, right, left): the camera passes it, not through it

// ── Apartment (universe 'rnd' and the landing) ─────────────────────
// A Gaussian splat of a real apartment (room.js renders it), placed once as
// a rigid frame, first (the site starts in it). Room units (the .sog frame): +Y up, 1 unit
// = 3.63 m, floor y = -0.413, ceiling cut at y = 0.30, bay windows on -Z.
// Scale s: the landing text fits (the orchestrator fit) at LANDING_CAM_Z -
// LANDING_TEXT.z room units, so s = fit / 0.65 (about 4.6 world units per
// room unit on desktop, more on portrait screens). Computed once at build.
const ROOM_FLOOR = -0.413;
// Metres per room unit (metric labels). 3.63 assumes a
// 1.5 m camera height; calibration on standard fixtures (worktop 900 mm,
// door 1981 mm; zipnerf-room/scripts/calibrate_scale.py) gives × 0.95, ±3 %.
// Approximately metric: show "≈", never claim more.
export const M_PER_UNIT = 3.45;
const ROOM_BOX = { min: [-2.64, -0.47, -0.84], max: [0.91, 0.30, 2.08] }; // all rooms (fade, clearance)
const ROOM_WINDOW = [0, -0.02, -0.78];   // bay window centre (the frame: the window faces winDir; the tunnel leaves here)
// The comet leaves over the window wall, just above the cut ceiling
// (flying through the window splats would blur the whole view for a moment)
const WALL_TOP = [0.35, 0.48, -0.80];    // via over the window wall (x: ± this, on the side of where the comet goes)
const WALL_OUT = [0, 0.35, -1];          // ... outwards: rising a little
const ROOM_ROOF = [0.1, 0.75, 0.5];      // above the cut ceiling: the dive into the landing
const LANDING_TEXT = [0, -0.11, -0.4];   // contact text centre, in front of the windows
const LANDING_CAM_Z = 0.25;              // landing VIEW camera z (inside, sofa side); sets the scale
const APARTMENT_TRIES = 40;
const LANDING_EXIT_DIST = [30, 45];      // tunnel exit -> landing camera (logged if outside)
// Object stops: base on the floor at (x, z). The VIEW camera looks from
// `cam` (room units; only its direction counts, the distance is the fit,
// capped at fitMax room units so a portrait fit stays inside the walls).
const OBJECT_SCALE = 0.25;        // object height ≈ 0.25 room units ≈ 0.9 m
// Optional: `y` = base height (default: the floor), `scale` (default OBJECT_SCALE),
// `light` (× the object brightness in room.js: lamps near or not), `haloTilt` (deg).
// `walkM`: the walk's guide distance (m) for this object (walk.js objectGoal).
const OBJECT_SPOTS = {
    // living room: on the coffee table (top y -0.296), 17 cm tall. Viewed from
    // the east-north-east (the free strip by the desk), so the view looks the
    // way the comet dives in. A view across the dive (it was from the south)
    // makes the comet hook up to 130° in the last metre: the arrival blend
    // then whipped the camera (250 deg/s)
    cherry: { x: -0.06, z: 0.13, y: -0.296, scale: 0.045, cam: [0.17, -0.12, 0.30], fitMax: 0.5 },
    // kitchen-diner: on the dining table (cloth y -0.20), 35 cm tall
    vase:   { x: -1.92, z: 1.12, y: -0.20, scale: 0.095, cam: [-1.88, -0.10, 0.82], fitMax: 0.5, light: 0.85 },
    // living room: on the desk by the east wall, next to the printer box, 30 cm long
    gpu:    { x: 0.72, z: 0.20, y: -0.18, scale: 0.067, cam: [0.35, -0.12, 0.20], fitMax: 0.5 },
    // kitchen-diner: pulled out at the corner of the dining table, 91 cm tall
    chair:  { x: -1.66, z: 0.97, cam: [-1.30, -0.12, 0.72], fitMax: 0.6, light: 0.75 },
    // hall: hung on the wall above the sofa (wall z = 0.124 x + 0.439, so the
    // camera looks along the wall normal), panel 1.15-1.85 m above the floor, 1 m wide
    // (walkM: the walk stands this far back, so the ring fits a phone screen too)
    board:  { x: -2.04, z: 0.245, y: -0.163, scale: 0.24, cam: [-2.114, -0.012, 0.840], fitMax: 0.66, haloTilt: 90, light: 1.15, walkM: 2.3 },
};
// Room stops (the depth room): a whole room instead of an object. `box`: the
// room in room units (x, z; y is free), the depth colours fade in over
// `edge` (room units, ~18 cm) round it, so from the hall the room shows
// through the door and crossing the doorway is the change. The halo ring
// (radius `haloM` m) lies flat on the floor round `ring`; `goal`: where Next
// object walks to (just inside the door), `look`: what it then faces (the
// bed); `cam`: the journey VIEW spot (dev/camlog.html only).
const ROOM_SPOTS = {
    // bottom left, one door from the hall (HB): bed, lamp, radiator, shuttered window
    bedroom2: { box: { min: [-2.6, -0.95], max: [-1.02, 0.15] }, edge: 0.05,
                ring: [-1.80, -0.36], haloM: 0.6, goal: [-1.50, -0.08], look: [-2.0, -0.05, -0.5],
                cam: [-1.30, 0.02, -0.02], fitMax: 0.5 },
};
// Object bounds (local units, objects.js): half width, height, and the
// height where the content starts (`bottom`: the board's panel)
const OBJECT_SIZE = {
    cherry: { hw: 0.4, h: 1.04 }, vase: { hw: 0.4, h: 1.02 },
    chair: { hw: 0.25, h: 1.0 }, board: { hw: 0.58, h: 0.72, bottom: 0.27 }, gpu: { hw: 0.62, h: 0.64 },
};
// Halo ring round each object (Saturn style), radius in local units. The
// ring plane leans HALO_TILT up from the view direction, so it reads as a
// thin ellipse round the object's middle and never cuts through it. A
// subtle accent: HALO_INTENSITY stays under the bloom threshold indoors.
const HALO_R = { cherry: 0.6, vase: 0.52, chair: 0.5, board: 0.75, gpu: 0.72 };
const HALO_TILT = THREE.MathUtils.degToRad(15);
const HALO_POINTS = 120;
const HALO_DIM_ALPHA = 0.2;              // dim until the comet traces it
const HALO_INTENSITY = 0.8;              // colour × this (the text strokes use STROKE_INTENSITY 1.5)
const HALO_FADE_TIME = 0.5;              // s: a ring fades in (out) as its stop becomes (stops being) the focus
const OBJECT_PAD = 0.15;                 // × height: framing room above and below the object
const OBJECT_FRAME = 1.12;               // × the halo / object half width: framing room beside it (the fit)
// Overall outward drift of the journey
const journeyDir = new THREE.Vector3(0.45, 0.08, -0.89).normalize();

// Visit order: the apartment's object stops (the tour walks the ones
// without `tour: false` in this order; the other two are reached by ?go),
// the projects tunnel and the contact landing. Each stop carries its own
// paletteIdx (into the ATTRACTORS table).
const ROUTE = [
    { id: 'windows-mirrors', universe: 'rnd', type: StopType.OBJECT, milestone: 4, object: 'vase', paletteIdx: 3,
      summary: 'Solved blurry windows, outdoor views and mirrors; exterior splats and orbital videos.' },
    { id: 'splatting',       universe: 'rnd', type: StopType.OBJECT, milestone: 3, object: 'cherry', paletteIdx: 3,
      summary: 'Our custom 3DGS reconstruction pipeline from sparse panorama views, in production June 2026; influence-accumulation densification (building on Taming 3DGS, Mallick et al., 2024), Analytic-Splatting, the pipeline restructuring.' },
    { id: 'mesh-generation', universe: 'rnd', type: StopType.OBJECT, milestone: 6, object: 'chair', paletteIdx: 3,
      summary: 'Mesh generation, point-count reduction, an embeddable Rust/wgpu splat viewer and a comparison tool.' },
    { id: 'benchmarking',    universe: 'rnd', type: StopType.OBJECT, milestone: 5, object: 'gpu', paletteIdx: 3,
      summary: 'Validation tools with ground-truth datasets, an experiment runner, artifact fixing on shared GPUs.' },
    { id: 'task-board-mcp',  universe: 'rnd', type: StopType.OBJECT, milestone: 7, object: 'board', paletteIdx: 3, tour: false,
      summary: 'MCP server for the team task board; the looped drone video.' },
    // a whole room (no splat object): walk in and it shows as depth (js/depthRoom.js)
    { id: 'depth-room',      universe: 'rnd', type: StopType.OBJECT, milestone: 8, room: 'bedroom2', paletteIdx: 3, tour: false,
      summary: 'A bedroom drawn as depth (colour = distance from your eye); mentoring a junior on a new depth method, now used team-wide.' },
    { id: 'sorting',    universe: 'projects',   type: StopType.PROJECT, milestone: 2, paletteIdx: 2,
      summary: 'Sorting algorithm visualizer (C++/SFML).' },
    { id: 'calculator', universe: 'projects',   type: StopType.PROJECT, milestone: 1, paletteIdx: 2,
      summary: 'Offline graphing calculator; 4th place in a programming competition.' },
    { id: 'contact',    universe: 'contact',    type: StopType.LANDING, paletteIdx: 4,
      title: 'Contact', summary: 'Get in touch by email, LinkedIn or GitHub.' }
];
// Old ids that still land somewhere (?go, the agent API). The removed
// timeline graph's Giraffe360 frame lands on the work; the other old ids
// (traits, rvkg, ai-talent, rtu, flow, balancer, monte-carlo) are unknown
// now: ?go gives the normal intro
const ALIASES = { giraffe360: 'splatting' };
// Universes are names, not indexes. A new universe is a new entry here
// plus ROUTE entries that use its id.
export const UNIVERSES = [
    { id: 'rnd',        title: 'Giraffe360 R&D' },
    { id: 'projects',   title: 'Projects' },
    { id: 'contact',    title: 'Contact' },
];
// Fly-by projects (no stop, no panel): `before` = the project stop they hang in front of;
// title and skills line say what each one is and shows
const FLYBYS = [
    { id: 'neat', milestone: 0, before: 0, title: 'NEUROEVOLUTION AI', skills: 'MACHINE LEARNING · GAME AI · PYTHON' },
];

// Static catalog of every stop and fly-by (no WebGL needed): the agent API
// reads it before the world is built. `index` = position in stops[].
// Fly-bys are listed but not navigable (`near` = the stop they hang before).
const TYPE_NAMES = { [StopType.PROJECT]: 'project',
                     [StopType.LANDING]: 'landing', [StopType.OBJECT]: 'object' };
export const catalog = [
    ...ROUTE.map((d, index) => ({
        id: d.id, universe: d.universe, type: TYPE_NAMES[d.type], index,
        title: d.title ?? MILESTONES[d.milestone].panel.title,
        summary: d.summary,
        panel: d.milestone !== undefined ? MILESTONES[d.milestone].panel : null,
        portal: d.milestone !== undefined && MILESTONES[d.milestone].panel.portal
            ? { href: MILESTONES[d.milestone].panel.portal.href, label: MILESTONES[d.milestone].panel.portal.label } : null,
        navigable: true
    })),
    ...FLYBYS.map(fb => {
        const near = ROUTE.filter(d => d.type === StopType.PROJECT)[fb.before].id;
        const panel = MILESTONES[fb.milestone].panel;
        return { id: fb.id, universe: 'projects', type: 'flyby', index: -1, title: panel.title,
                 summary: fb.skills, panel, navigable: false, near };
    })
];
export function stopById(id) { return catalog.find(e => e.id === (ALIASES[id] ?? id)) ?? null; }
// The catalog entry of stop index i
export function entryAt(i) { return catalog.find(e => e.navigable && e.index === i) ?? null; }



// ── Stop shader ────────────────────────────────────────────────────
// Baked HDR colors + per-point alpha; one shared material for all stops
const STOP_VERTEX = `
    attribute vec3 color;
    attribute float aAlpha;
    uniform float uVis;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        vColor = color;
        vAlpha = aAlpha * uVis;
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

// Shared materials: the outside world (the landing text) and the
// tunnel's project labels. The warp cross-fades them; indoors the outside
// world fades too (setRoomFade): its lines have no depth test and would
// shine through the walls. The apartment strokes have their own (focus).
const stopMaterials = {};
function getStopMaterial(kind = 'outside') {
    if (!stopMaterials[kind]) {
        stopMaterials[kind] = new THREE.ShaderMaterial({
            uniforms: { uVis: { value: kind === 'inside' ? 0 : 1 } },
            vertexShader: STOP_VERTEX,
            fragmentShader: STOP_FRAGMENT,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
    }
    return stopMaterials[kind];
}

// ── State ──────────────────────────────────────────────────────────
export let stops = [];
export let flybys = [];                  // { label, s, viz }
export let tunnelExitS = 0;              // s where the tunnel ends (the warp out)
let mailPlane = null;
export function getMailPlane() { return mailPlane; }
let landingScale = TEXT_SCALE;           // world units per 2D unit of the landing text (smaller on narrow portrait screens)

// The apartment frame (room units -> world): world = position + R(yaw) × room × scale.
// room.js renders the splat and the objects into it; `objects` lists the
// object stops (name, room position, yaw) for it.
export const apartment = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: 1,
    winDir: new THREE.Vector3(0, 0, -1),     // world direction out of the bay window (room -Z)
    box: ROOM_BOX,
    floor: ROOM_FLOOR,
    objects: []                              // { name, x, z, yaw } (room units, yaw about +Y)
};
export function roomToWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyQuaternion(apartment.quaternion)
        .multiplyScalar(apartment.scale).add(apartment.position);
}
function roomDirToWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyQuaternion(apartment.quaternion).normalize();
}
// World point -> room units
const _qInv = new THREE.Quaternion();
export function worldToRoom(p, out = new THREE.Vector3()) {
    return out.copy(p).sub(apartment.position).divideScalar(apartment.scale)
        .applyQuaternion(_qInv.copy(apartment.quaternion).invert());
}

// Camera distance at which a block of half size (halfW, halfH) world units,
// centred on the orbit target, fits the view with a small margin.
// availW / availH: share of the view it may fill (the HTML panel takes the rest).
export function fitDistance(halfW, halfH, availW = 1, availH = 1) {
    return THREE.MathUtils.clamp(fitUnclamped(halfW, halfH, availW, availH), controls.minDistance, controls.maxDistance);
}
function fitUnclamped(halfW, halfH, availW = 1, availH = 1) {
    const tanV = Math.tan(camera.fov * Math.PI / 360);
    return 1.25 * Math.max(halfH / (tanV * availH), halfW / (tanV * camera.aspect * availW));
}

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
    // The comet arrives at the centre of the viz, then draws out to the frame
    push(0, 0, 0);
    push(-hw, -hh + r, 0);
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

// ── Planar stop (landing / project) ──────────────────
function buildPlanarStop(def, center, right, up, palette) {
    const scale = def.type === StopType.LANDING ? landingScale : TEXT_SCALE;
    let points, staticFrom = 0;
    if (def.type === StopType.PROJECT) {
        ({ points, labelStart: staticFrom } = projectPoints(MILESTONES[def.milestone].label, def.vizHalfW, def.vizHalfH));
    } else {
        ({ points } = generateTextLines(LANDING_LINES));
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
    const line = buildStopLine(new Float32Array(0), new Float32Array(0), new Float32Array(0), /* segments */ true);
    const out = {
        line,
        points2d: points,
        strokeIdx: null,
        litVertex: 0,
        scale,
        halfW: maxAbsX * scale,
        halfH: maxAbsY * scale,
        blockMid: (minY + maxY) / 2 * scale,      // block's visual middle along `up` (the 2D origin is line 1's baseline)
        blockHalfH: (maxY - minY) / 2 * scale
    };
    function pushVertex(i) {
        const p = points[i];
        planePointToWorld(_vec3, center, right, up, scale, p);
        segPos.push(_vec3.x, _vec3.y, _vec3.z);
        const col = getPaletteColor(palette, n > 1 ? i / (n - 1) : 0);
        segCol.push(col.r * STROKE_INTENSITY, col.g * STROKE_INTENSITY, col.b * STROKE_INTENSITY);
        segAlpha.push(1.0);
        segIdx.push(i);
    }
    // The strokes' geometry: at once for the landing (it shows at the start),
    // in an idle slot for a project label (only seen in the tunnel)
    const fill = () => {
        for (let i = staticFrom; i < n - 1; i++) {
            if (points[i].c === 1 && points[i + 1].c === 1) {
                pushVertex(i);
                pushVertex(i + 1);
            }
        }
        line.geometry.dispose();
        line.geometry = buildStopLine(new Float32Array(segPos), new Float32Array(segCol), new Float32Array(segAlpha), true).geometry;
        out.strokeIdx = new Int32Array(segIdx);
    };
    if (def.type === StopType.PROJECT) vizJobs.push(fill); else fill();
    return out;
}

// Per frame: the tunnel moves, and the project visualizations near the
// comet (arc parameter headS) animate.
const VIZ_RANGE = [-12, 60];             // s window (behind, ahead) where a viz updates
const VIZ_FADE = [16, 32];               // |s - headS|: a viz fades out from here to here (the next ones emerge from the dark)
let insideFade = 0;                      // 0 = outside the tunnel, 1 = inside (cross-fade in the warp)
export function updateWorld(dt, headS) {
    // Apartment strokes (halo rings, the landing text): only the focused
    // stop's show. The lines have no depth test, so the others would shine
    // through the walls (and the contact text would greet the comet at the window).
    const k = 1 - Math.exp(-dt / HALO_FADE_TIME);
    for (const st of stops) {
        if (st.focusVis === undefined) continue;
        st.focusVis += ((st === haloFocus ? 1 : 0) - st.focusVis) * k;
        st.line.material.uniforms.uVis.value = st.focusVis * (1 - insideFade);
        st.line.visible = st.focusVis > 0.002 && insideFade < 0.998;
    }
    tunnel.update(dt);
    for (const st of stops) if (st.viz) updateViz(st.viz, st.tunnelS, headS, dt);
    for (const f of flybys) if (f.viz) updateViz(f.viz, f.s, headS, dt);
}
function updateViz(viz, s, headS, dt) {
    if (near(s, headS)) viz.update(dt);
    const v = (1 - THREE.MathUtils.smoothstep(Math.abs(s - headS), VIZ_FADE[0], VIZ_FADE[1])) * insideFade;
    viz.setVisibility(v, v > 0.002);
}
// Inside the tunnel the outside world (the landing) is
// hidden: the walls are see-through lines, and far glows would sit on
// top of the visualizations. The projects (stops and fly-bys) exist only
// inside. f = 0 outside .. 1 inside: the warp cross-fades the two worlds.
export function setInsideFade(f) {
    insideFade = f;
    const out = (1 - f) * (1 - roomFade);
    getStopMaterial('outside').uniforms.uVis.value = out;
    getStopMaterial('inside').uniforms.uVis.value = f;
    for (const st of stops) {
        if (st.focusVis !== undefined) continue;  // updateWorld (focus fade)
        st.line.visible = st.type === StopType.PROJECT ? f > 0.002 : f < 0.998;
        if (st.viz) st.viz.group.visible = f > 0.002;
    }
    for (const fb of flybys) if (fb.viz) fb.viz.group.visible = f > 0.002;
}
export function getInsideFade() { return insideFade; }
// room.js: 0 outside .. 1 when the camera is at (or in) the apartment
let roomFade = 0;
export function setRoomFade(a) {
    if (a === roomFade) return;
    roomFade = a;
    setInsideFade(insideFade);
}
// The apartment stop whose strokes show (the current stop or the flight's destination)
let haloFocus = null;
export function setHaloFocus(stop) { haloFocus = stop?.focusVis !== undefined ? stop : null; }
export function snapHaloFocus() { for (const st of stops) if (st.focusVis !== undefined) st.focusVis = st === haloFocus ? 1 : 0; }
function ownMaterial(line) {      // a stop line with its own visibility (focus fade)
    line.material = getStopMaterial('outside').clone();
    line.material.uniforms = { uVis: { value: 0 } };
    line.visible = false;
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

// ── Apartment and tunnel placement ─────────────────────────────────
// The site starts in the flat: the apartment is placed first, with the
// landing text spot (LANDING_TEXT, where the intro name floats in front of
// the bay windows) at the world origin, the window facing `journeyDir`
// (flattened). The tunnel leaves the window along e1 (winDir, dipping
// EXIT_DIVE) and turns by tunnel.TUNNEL_TURN (almost a full circle), so the
// exit comes home behind the apartment: the warp out ends with a short dive
// over the roof. Of the tries (turn sign, hop) the one that keeps the
// apartment TUNNEL_CLEAR from the axis (except the last TUNNEL_EXIT_FREE
// units) and brings the exit nearest the middle of LANDING_EXIT_DIST wins.
const _Y = new THREE.Vector3(0, 1, 0);
function setApartmentFrame(winDir, s) {
    apartment.scale = s;
    apartment.winDir.copy(winDir);
    // room axes in world: z = -winDir, y = up, x = y × z
    const z = winDir.clone().negate();
    const x = new THREE.Vector3().crossVectors(_Y, z);
    apartment.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, _Y, z));
    // the landing text spot lands on the origin
    apartment.position.set(0, 0, 0);
    apartment.position.sub(roomToWorld(...LANDING_TEXT));
}
function apartmentCorners() {
    const b = ROOM_BOX, out = [];
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push(roomToWorld(x, y, z));
    return out;
}
function placeApartmentAndTunnel(length, s) {
    setApartmentFrame(journeyDir.clone().setY(0).normalize(), s);
    const W = roomToWorld(...ROOM_WINDOW);
    const e1 = apartment.winDir.clone().setY(-EXIT_DIVE).normalize();
    const landingCam = roomToWorld(0, LANDING_TEXT[1], LANDING_CAM_Z);
    const corners = apartmentCorners();
    const T0 = new THREE.Vector3(), mid = (LANDING_EXIT_DIST[0] + LANDING_EXIT_DIST[1]) / 2;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < APARTMENT_TRIES; i++) {
        const turn = i % 2 ? 1 : -1;
        T0.copy(W).addScaledVector(e1, rand(TUNNEL_HOP[0], TUNNEL_HOP[1]));
        tunnel.setFrame(T0, e1, turn, length);
        let clear = Infinity;
        for (const c of corners) clear = Math.min(clear, tunnel.axisDistance(c, length - TUNNEL_EXIT_FREE) / TUNNEL_CLEAR);
        const exitD = tunnel.centreWorld(length, new THREE.Vector3()).distanceTo(landingCam);
        const score = clear >= 1 ? 10 - Math.abs(exitD - mid) / mid : clear;
        if (score > bestScore) { bestScore = score; best = { T0: T0.clone(), turn }; }
    }
    tunnel.setFrame(best.T0, e1, best.turn, length);
    if (bestScore < 1) console.warn('tunnel placement: the apartment is not fully clear', bestScore.toFixed(2));
}

// ── Object stops (in the apartment) ────────────────────────────────
// The halo ring is the stroke set: all c = 1, scale 1 (world units), traced
// once by the comet (lit as it goes), static and dim otherwise.
function buildObjectStop(def, palette) {
    const spot = OBJECT_SPOTS[def.object], size = OBJECT_SIZE[def.object];
    const s = apartment.scale;
    const k = spot.scale ?? OBJECT_SCALE, base = spot.y ?? ROOM_FLOOR;
    const H = size.h * k * s;                                     // world units
    const center = roomToWorld(spot.x, base + ((size.bottom ?? 0) + size.h / 2) * k, spot.z);
    const camPos = roomToWorld(...spot.cam);
    const normal = center.clone().sub(camPos).normalize();
    const right = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    // (the wall board: haloTilt 90°, the ring lies in the board plane, round it)
    const tilt = spot.haloTilt !== undefined ? THREE.MathUtils.degToRad(spot.haloTilt) : HALO_TILT;
    const up = normal.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(tilt)).normalize();
    // the object faces the camera: its front (+Z local) along -normal, in room yaw
    const back = worldToRoom(camPos.clone()).sub(worldToRoom(center.clone()));
    const yaw = Math.atan2(back.x, back.z);
    apartment.objects.push({ name: def.object, x: spot.x, y: base, z: spot.z, yaw, scale: k, light: spot.light ?? 1 });

    const R = HALO_R[def.object] * k * s;
    const points = [];
    for (let i = 0; i <= HALO_POINTS; i++) {
        const a = 2 * Math.PI * i / HALO_POINTS;
        points.push({ x: R * Math.cos(a), y: R * Math.sin(a), c: 1 });
    }
    const segPos = [], segCol = [], segAlpha = [], segIdx = [];
    for (let i = 0; i < points.length - 1; i++) {
        for (const k of [i, i + 1]) {
            planePointToWorld(_vec3, center, right, up, 1, points[k]);
            segPos.push(_vec3.x, _vec3.y, _vec3.z);
            const col = getPaletteColor(palette, k / (points.length - 1));
            segCol.push(col.r * HALO_INTENSITY, col.g * HALO_INTENSITY, col.b * HALO_INTENSITY);
            segAlpha.push(HALO_DIM_ALPHA);
            segIdx.push(k);
        }
    }
    const halfH = H * (0.5 + OBJECT_PAD);
    const line = buildStopLine(new Float32Array(segPos), new Float32Array(segCol), new Float32Array(segAlpha), true);
    ownMaterial(line);                                   // shows only in focus (setHaloFocus)
    return {
        center, right, up, normal,
        line,
        focusVis: 0,
        points2d: points,
        strokeIdx: new Int32Array(segIdx),
        litVertex: 0,
        scale: 1,
        haloR: R,
        topY: center.y + H / 2,
        halfW: Math.max(size.hw * k * s, R) * OBJECT_FRAME,
        halfH,
        blockMid: 0,
        blockHalfH: halfH,
        fitMax: spot.fitMax * s,
        walkM: spot.walkM                    // walk.js: the guide goal's distance (m), when set
    };
}

// A room stop (ROOM_SPOTS): the same shape as an object stop, with the halo
// ring flat on the floor (right, up horizontal) and `roomBox`, `walkGoal`,
// `walkLook` for walk.js and depthRoom.js. No splat object.
const ROOM_RING_LIFT = 0.006;            // room units over the floor (2 cm)
function buildRoomStop(def, palette) {
    const spot = ROOM_SPOTS[def.room];
    const s = apartment.scale;
    const center = roomToWorld(spot.ring[0], ROOM_FLOOR + ROOM_RING_LIFT, spot.ring[1]);
    const camPos = roomToWorld(...spot.cam);
    const normal = center.clone().sub(camPos).normalize();
    const vertical = roomDirToWorld(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(normal, vertical).normalize();
    const up = new THREE.Vector3().crossVectors(vertical, right).normalize();   // horizontal, away from the view
    const R = spot.haloM / M_PER_UNIT * s;
    const points = [];
    for (let i = 0; i <= HALO_POINTS; i++) {
        const a = 2 * Math.PI * i / HALO_POINTS;
        points.push({ x: R * Math.cos(a), y: R * Math.sin(a), c: 1 });
    }
    const segPos = [], segCol = [], segAlpha = [], segIdx = [];
    for (let i = 0; i < points.length - 1; i++) {
        for (const k of [i, i + 1]) {
            planePointToWorld(_vec3, center, right, up, 1, points[k]);
            segPos.push(_vec3.x, _vec3.y, _vec3.z);
            const col = getPaletteColor(palette, k / (points.length - 1));
            segCol.push(col.r * HALO_INTENSITY, col.g * HALO_INTENSITY, col.b * HALO_INTENSITY);
            segAlpha.push(HALO_DIM_ALPHA);
            segIdx.push(k);
        }
    }
    const line = buildStopLine(new Float32Array(segPos), new Float32Array(segCol), new Float32Array(segAlpha), true);
    ownMaterial(line);
    const halfH = R * 0.6;
    return {
        center, right, up, normal,
        line,
        focusVis: 0,
        points2d: points,
        strokeIdx: new Int32Array(segIdx),
        litVertex: 0,
        scale: 1,
        haloR: R,
        topY: center.y,
        halfW: R * OBJECT_FRAME,
        halfH,
        blockMid: 0,
        blockHalfH: halfH,
        fitMax: spot.fitMax * s,
        roomBox: { min: spot.box.min, max: spot.box.max, edge: spot.edge },
        walkGoal: spot.goal,                  // room units (x, z)
        walkLook: roomToWorld(...spot.look)   // world
    };
}

// ── Routes out of and into the flat ───────────────────────────────
// Via points of a flight (world space): [{ p, dir? }]. With `dir` the comet
// crosses the point exactly along it (the window wall, the roof). The
// orchestrator chains them (buildViaLegs).
function via(p, dir = null) {
    return { p: roomToWorld(...p), dir: dir ? roomDirToWorld(...dir) : null };
}
// Out over the window wall, already turned towards `to` (the tunnel throat
// for a tunnel stop: the comet joins the centreline there). The crossing slides along the wall top to
// the side `to` lies on (WALL_TOP.x × -1..1): no hard turn after it.
function exitTowards(to) {
    const W = via(WALL_TOP, WALL_OUT);
    const hr = worldToRoom(to.clone()).sub(worldToRoom(W.p.clone())).setY(0).normalize();
    W.p.copy(roomToWorld(WALL_TOP[0] * THREE.MathUtils.clamp(2 * hr.x, -1, 1), WALL_TOP[1], WALL_TOP[2]));
    // crossing it, the comet climbs at most WALL_OUT's slope, and heads down
    // already when `to` lies lower (no bend at the wall top, then a dip)
    const d = to.clone().sub(W.p), h = d.clone().setY(0), slope = -WALL_OUT[1] / WALL_OUT[2];
    W.dir.copy(h.normalize()).setY(THREE.MathUtils.clamp(d.y / Math.hypot(d.x, d.z), -slope, slope)).normalize();
    return [W];
}
// Leaving the flat from anywhere inside it (the walk, or the intro spot):
// up through the cut ceiling (a via above the start, a little towards the
// window wall), then out over the window wall towards `to`. A start near
// the window wall needs no lift: the wall via climbs anyway.
const FLAT_LIFT = 0.42;                  // room units: the lift via height (over the cut ceiling, 0.30)
const FLAT_LIFT_TOWARDS = 0.3;           // ... this far towards the wall via
const FLAT_LIFT_MIN = 0.6;               // no lift via within this horizontal distance of the wall via
const aimOf = (dest) => dest.tunnelS != null ? tunnel.centreWorld(0, new THREE.Vector3()) : dest.center;
export function flatExitVias(p, dest) {
    const out = exitTowards(aimOf(dest));
    const r = worldToRoom(p.clone()), w = worldToRoom(out[0].p.clone());
    const dx = w.x - r.x, dz = w.z - r.z, h = Math.hypot(dx, dz);
    if (h > FLAT_LIFT_MIN) {
        const k = FLAT_LIFT_TOWARDS / h;
        out.unshift({ p: roomToWorld(r.x + dx * k, FLAT_LIFT, r.z + dz * k), dir: null });
    }
    return out;
}
export function viasFor(from, dest) {
    const fromIn = from?.type === StopType.OBJECT || from?.type === StopType.LANDING;
    if (dest.type === StopType.LANDING) {
        // over the roof, then a dive through the cut ceiling (down and towards the windows)
        return [{ p: roomToWorld(...ROOM_ROOF), dir: roomDirToWorld(0, -1, -1) }];
    }
    if (fromIn) return exitTowards(aimOf(dest));                            // out over the window wall: the landing loop back to the first project
    return [];
}

// Shader programs for objects that are hidden now (compileAsync: with
// KHR_parallel_shader_compile the driver compiles off the main thread).
// The scene renders into the composer's target: compile for a render
// target, so the program parameters (colour space, tone mapping) match.
function precompile(scene) {
    if (!renderer?.compileAsync) return;
    const roots = [...tunnel.meshes(), ...stops.filter(st => st.viz).map(st => st.viz.group),
                   ...flybys.filter(f => f.viz).map(f => f.viz.group)];
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(composer.readBuffer);
    for (const r of roots) renderer.compileAsync(r, camera, scene).catch(() => {});
    renderer.setRenderTarget(prev);
}

// ── Build ──────────────────────────────────────────────────────────
// The project vizzes (6 live animations, about 0.15 s of main thread on a
// slow phone) are not needed in the flat, where the site starts: with
// `defer` they build one per idle slot after the first frame, and
// finishWorld() builds the rest at once (the first flight, a jump).
const vizJobs = [];
export function finishWorld() { while (vizJobs.length) vizJobs.shift()(); }
const whenIdle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 1000 }) : f => setTimeout(f, 50);
function buildVizzesLater() {
    const step = () => { if (vizJobs.length) vizJobs.shift()(); if (vizJobs.length) whenIdle(step); };
    requestAnimationFrame(() => whenIdle(step));
}

export function buildWorld(scene, { defer = false } = {}) {
    stops = [];
    flybys = [];
    vizJobs.length = 0;
    let projectK = 0;
    const nProjects = ROUTE.filter(d => d.type === StopType.PROJECT).length;
    // Stop k sits STOP_GAP after stop k - 1, or 2 x FLYBY_GAP when a fly-by hangs between them
    const stopS = [TUNNEL_RUSH + FLYBY_GAP];
    for (let k = 1; k < nProjects; k++) stopS.push(stopS[k - 1] + (FLYBYS.some(fb => fb.before === k) ? 2 * FLYBY_GAP : STOP_GAP));
    const projectS = k => stopS[k];
    tunnelExitS = projectS(nProjects - 1) + TUNNEL_EXIT_AFTER;
    // A fly-by hangs at TUNNEL_RUSH (before the first stop) or half way
    // between two stops (a stop gap leaves room for one)
    const flybyS = fb => fb.before === 0 ? TUNNEL_RUSH : (projectS(fb.before - 1) + projectS(fb.before)) / 2;
    // Fast zones: the middle of every stretch between throat, fly-bys, stops and exit
    const anchors = [0, ...FLYBYS.map(flybyS), ...Array.from({ length: nProjects }, (_, k) => projectS(k)), tunnelExitS].sort((a, b) => a - b);
    const zones = [];
    const margin = i => i === 0 ? FAST_ZONE_MARGIN[0] : i === anchors.length - 1 ? FAST_ZONE_MARGIN[2] : FAST_ZONE_MARGIN[1];
    for (let i = 0; i < anchors.length - 1; i++) {
        zones.push({ a: anchors[i] + margin(i), b: anchors[i + 1] - margin(i + 1) });
    }
    tunnel.setZones(zones, FAST_ZONE_RAMP);
    const _r = new THREE.Vector3(), _u = new THREE.Vector3();
    // Apartment scale from the landing text fit (see LANDING_CAM_Z)
    const { points: landPts } = generateTextLines(LANDING_LINES);
    let lx = 0, ly = 0;
    for (const p of landPts) { lx = Math.max(lx, Math.abs(p.x)); ly = Math.max(ly, Math.abs(p.y)); }
    // On a narrow portrait screen the email line needs a fit past
    // controls.maxDistance (the camera cannot back off that far): the
    // landing text shrinks until it fits at that distance
    landingScale = TEXT_SCALE * Math.min(1, controls.maxDistance / fitUnclamped(lx * TEXT_SCALE, ly * TEXT_SCALE));
    const roomScale = fitDistance(lx * landingScale, ly * landingScale) / (LANDING_CAM_Z - LANDING_TEXT[2]);
    apartment.objects = [];
    // The apartment first (the site starts in it), then the tunnel from its window
    placeApartmentAndTunnel(tunnelExitS, roomScale);
    let prev = null;

    for (const def of ROUTE) {
        let center, tunnelS = null;
        if (def.type === StopType.OBJECT) {
            const palette = ATTRACTORS[def.paletteIdx ?? 0].palette;
            const stop = { id: def.id, universe: def.universe, type: def.type, paletteIdx: def.paletteIdx ?? 0, tour: def.tour ?? true,
                           panel: MILESTONES[def.milestone].panel, tunnelS: null, viz: null, objectName: def.object ?? null,
                           ...(def.room ? buildRoomStop(def, palette) : buildObjectStop(def, palette)) };
            scene.add(stop.line);
            stops.push(stop);
            continue;
        }
        if (def.type === StopType.PROJECT) {
            tunnelS = projectS(projectK++);
            center = tunnel.centreWorld(tunnelS, new THREE.Vector3());
            // Face along the tunnel: `prev` is a point just behind on the centreline
            prev = tunnel.centreWorld(tunnelS - 1, new THREE.Vector3());
        } else if (def.type === StopType.LANDING) {
            // In the living room, in front of the bay windows, facing the camera inside
            center = roomToWorld(...LANDING_TEXT);
            prev = center.clone().sub(apartment.winDir);
        }

        // Planar stops face back along their approach direction so the
        // arriving camera sees them head-on; basis stays upright.
        const normal = _dir.copy(center).sub(prev).normalize().clone();
        const right = new THREE.Vector3()
            .crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, normal).normalize();

        const paletteIdx = def.paletteIdx ?? 0;
        const palette = ATTRACTORS[paletteIdx].palette;
        const portal = def.type === StopType.PROJECT && !!MILESTONES[def.milestone].panel.portal;
        if (def.type === StopType.PROJECT) { def.vizHalfW = VIZ_HALF_W; def.vizHalfH = VIZ_HALF_H; }
        const built = buildPlanarStop(def, center, right, up, palette);

        const stop = {
            id: def.id,
            universe: def.universe,
            type: def.type,
            paletteIdx,
            panel: def.milestone !== undefined ? MILESTONES[def.milestone].panel : undefined,
            tunnelS,
            viz: null,                        // built by a viz job (project stops)
            center,
            right,
            up,
            normal,
            ...built
        };
        if (def.type === StopType.PROJECT) stop.line.material = getStopMaterial('inside');
        if (def.type === StopType.PROJECT) {
            vizJobs.push(() => {
                const viz = buildProjectViz(MILESTONES[def.milestone].label, { portal });
                viz.group.position.copy(center);
                viz.group.quaternion.setFromRotationMatrix(
                    new THREE.Matrix4().makeBasis(right, up, _vec3.copy(normal).negate()));
                viz.group.visible = false;    // (updateWorld shows it near the viewer)
                scene.add(viz.group);
                stop.viz = viz;
            });
        }
        if (portal) {
            // A portal stop: the camera fit takes in the rim (fitHalfW/H), the comet loops round it
            stop.portal = stop.panel.portal;
            stop.rimR = RIM_OUTER_R;
            stop.fitHalfW = Math.max(stop.halfW, RIM_OUTER_R);
            stop.fitHalfH = Math.max(stop.halfH, RIM_OUTER_R);
        }
        if (def.type === StopType.LANDING) { ownMaterial(stop.line); stop.focusVis = 0; }
        scene.add(stop.line);
        stops.push(stop);
        prev = center;
    }

    // Fly-bys: just beside the centreline, facing the approaching comet.
    // The comet spirals round an axis along the tunnel through the centre
    // of viz + text. `offset` = that centre minus the centreline point,
    // `radius` = half-diagonal of viz + text (world units).
    for (const fb of FLYBYS) {
        const s = flybyS(fb);
        const label = MILESTONES[fb.milestone].label;
        const c = tunnel.centreWorld(s, new THREE.Vector3());
        const T = tunnel.tangentWorld(s, new THREE.Vector3());
        tunnel.frameWorld(s, _r, _u);
        const top = VIZ_HALF_H, bottom = FLYBY_TEXT_BOTTOM;  // local y range
        const mid = (top + bottom) / 2 * FLYBY_SCALE;
        const offset = _r.clone().multiplyScalar(flybys.length % 2 ? FLYBY_SIDE : -FLYBY_SIDE);
        const pos = c.clone().add(offset).addScaledVector(_u, -mid);
        const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(_r, _u, T.clone().negate()));
        const radius = Math.hypot(VIZ_HALF_W, (top - bottom) / 2) * FLYBY_SCALE;
        const fly = { label, s, viz: null, radius, T, offset, center: c.clone().add(offset) };
        flybys.push(fly);
        vizJobs.push(() => {
            const viz = buildProjectViz(label, { title: fb.title, skills: fb.skills });
            viz.group.position.copy(pos);
            viz.group.quaternion.copy(quat);
            viz.group.scale.setScalar(FLYBY_SCALE);
            viz.group.visible = false;
            scene.add(viz.group);
            fly.viz = viz;
        });
    }
    if (defer) buildVizzesLater();
    else finishWorld();

    tunnel.build(scene);
    // Last: compile the shaders of what is not on screen yet (the tunnel and
    // the warp, the vizzes) in the background, so the first frame that
    // shows them does not stall
    if (defer) vizJobs.push(() => precompile(scene));
    else finishWorld();   // (the jobs above use no Math.random: the seeded route of dev/camlog.html stays)
    setInsideFade(0);

    const landing = stops[stops.length - 1];
    scene.add(buildMailPlane(landing));
    // The warp out should come home: the exit sits a short flight behind the landing
    const exitD = tunnel.centreWorld(tunnelExitS, new THREE.Vector3()).distanceTo(roomToWorld(0, LANDING_TEXT[1], LANDING_CAM_Z));
    if (exitD < LANDING_EXIT_DIST[0] || exitD > LANDING_EXIT_DIST[1]) console.warn('tunnel exit -> landing camera', exitD.toFixed(1));
    return stops;
}
