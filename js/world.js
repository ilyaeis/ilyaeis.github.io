// ── Static World ───────────────────────────────────────────────────
// Builds every journey stop as pre-existing geometry at load: the
// trait text block, milestone rocks and the contact landing are scattered
// randomly through 3D space, each glowing in its own palette from
// frame one. Five strange attractors hang beside the flight legs as
// dim, slowly spinning scenery ("galaxies"). The comet (orchestrator)
// flies between the stops and swings past a galaxy on the way.
// After the last rock the comet flies in through the bay window of a real
// apartment (a Gaussian splat, room.js renders it): six object stops (the
// Giraffe360 R&D areas), each a splat object with a halo ring. It leaves
// through the window into the projects tunnel (tunnel.js): the project
// stops sit on its centreline, each with a live visualization
// (projectViz.js); smaller fly-by projects hang on the wall. The tunnel
// brings it back over the apartment roof, and it dives into the living
// room to the contact landing.

import * as THREE from 'three';
import { ATTRACTORS, rk4Step, isMobile, getPaletteColor, camera, controls } from './attractors.js';
import { generateTextLines, generateRockWithLabel } from './strokeFont.js';
import * as tunnel from './tunnel.js';
import { buildProjectViz, FLYBY_TEXT_BOTTOM } from './projectViz.js';

export const StopType = { TEXT: 0, ROCK: 1, LANDING: 2, PROJECT: 3, OBJECT: 4 };

// ── Content ────────────────────────────────────────────────────────
export const CONTACT_EMAIL = 'ilya.safronos@gmail.com';
const TEXT_LINES = ['CREATIVE.', 'ADAPTIVE.', 'CURIOUS.'];
const LANDING_LINES = ['GET IN TOUCH', CONTACT_EMAIL];
const MILESTONES = [
    { label: 'RVKG', sizeFactor: 0.9, seed: 42, panel: {
        title: 'Riga State Classical Gymnasium',
        subtitle: 'Programming and Mathematics track · Riga',
        items: [
            { text: 'Latvian state mathematics olympiads; the Small Mathematics University.' },
            { text: 'A school project became the Offline Graphing Calculator (2023).' }
        ],
        more: { href: 'resume.html#rvkg', label: 'details in the resume' }
    }},
    { label: 'RTU', sizeFactor: 0.7, seed: 73, panel: {
        title: 'Riga Technical University',
        subtitle: 'Professional Bachelor, Financial Engineering',
        dates: '2024 – 2028 (expected)',
        items: [
            { text: 'Maths, statistics and programming applied to finance.' },
            { text: 'Econometrics, stochastic analysis, Monte Carlo methods, time series.' }
        ],
        more: { href: 'resume.html#rtu', label: 'details in the resume' }
    }},
    { label: 'AI TALENT', sizeFactor: 0.65, seed: 58, panel: {
        title: 'AI Talent Program',
        subtitle: 'Ponder · selective, entry by test and interview',
        dates: 'Nov 2024 – Jan 2025',
        items: [
            { text: 'It led to my R&D Engineer role at Giraffe360.' },
            { text: 'C++, Python and AI theory: CNNs, transformers, GANs, VAEs, reinforcement learning.' }
        ],
        more: { href: 'https://www.ponder.lv/mi-programma', label: 'ponder.lv' }
    }},
    { label: 'GIRAFFE360', sizeFactor: 0.55, seed: 17, panel: {
        title: 'Giraffe360',
        subtitle: 'R&D Engineer · 3D reconstruction and computer vision',
        dates: '2025 – present',
        items: [
            { text: 'Solved blurry windows and mirrors; in production since June 2026.' },
            { text: '3DGS from sparse panoramas, benchmarking, continuous research.' }
        ],
        more: { href: 'resume.html#giraffe360', label: 'details in the resume' }
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
            { text: 'In daily use: live set timers, volume, load (ACWR), records.' },
            { text: 'JSON, CSV and PDF export; CI with golden-image tests.' }
        ],
        more: { href: 'resume.html#flow', label: 'details in the resume' }
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
            { text: '4th place of 27 entries, Riga Business School (RTU) competition.' },
            { text: 'Plots functions and does maths offline; built with Iļja Volinskis.' }
        ],
        more: { href: 'https://rbs.lv/blog/2023/06/12/event-search-app-wins-programming-competition-for-high-school-students/', label: 'competition results' }
    }},
    { label: 'SORTING', sizeFactor: 0.6, seed: 91, panel: {
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
        title: '3DGS reconstruction pipeline',
        subtitle: 'Sparse panorama views · Python · PyTorch · CUDA',
        items: [
            { text: 'Influence accumulation: my densification method, shipped Jan 2026, still the team’s best.' },
            { text: 'Analytic-Splatting in gsplat at CUDA level (June 2026).' }
        ],
        more: { href: 'resume.html#influence-accumulation', label: 'details in the resume' }
    }},
    { label: 'WINDOWS', panel: {
        title: 'Windows, outdoor views and mirrors',
        subtitle: 'The main long-standing quality problem · solved',
        items: [
            { text: 'Shipped 1 June 2026 after 140+, then 600+ experiments.' },
            { text: 'Root cause: a depth regularizer flattened outdoor views onto the wall.' }
        ],
        more: { href: 'https://www.instagram.com/p/DZsNRB8o772/', label: 'Giraffe360 post' }
    }},
    { label: 'BENCHMARKING', panel: {
        title: 'Benchmarking and evaluation',
        subtitle: 'GPU training · Docker · GitLab CI',
        items: [
            { text: 'Validation tools that check quality against ground-truth datasets.' },
            { text: 'Experiment runner: AI-agent-driven training runs on local GPUs.' }
        ],
        more: { href: 'resume.html#ground-truth', label: 'details in the resume' }
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
        title: 'MCP server, mentoring, ideas',
        subtitle: 'MCP server for the team task board · Node.js',
        items: [
            { text: 'Looped drone: my hackathon idea, launched by Giraffe360 in Oct 2026.',
              href: 'https://www.instagram.com/giraffe360/reel/Dd9ODBVIHhE/' },
            { text: 'Mentored a junior engineer on a new depth algorithm, now used team-wide.' }
        ],
        more: { href: 'resume.html#mcp-server', label: 'details in the resume' }
    }},
    { label: 'TOUR NARRATION', panel: {
        title: 'Tour narration (an early task)',
        subtitle: 'OpenAI API · AWS · S3',
        dates: 'Jul – Oct 2025',
        items: [
            { text: 'A small LLM service that wrote tour narration.' }
        ],
        more: { href: 'resume.html#tour-narration', label: 'details in the resume' }
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
// One galaxy on each leg into a rock and on the dive into the apartment
// (into its first object). None indoors, on the warp into the tunnel or
// inside it, or on the roof dive.
const SCENERY_LEGS = [];   // filled from ROUTE below

// Projects tunnel (tunnel.js): entry point E = apartment window + e1 × TUNNEL_HOP.
// Along s: the warp throat at 0, a rush, the first fly-by at TUNNEL_RUSH,
// then project stop, fly-by, stop ... each FLYBY_GAP apart, then the exit.
// The middle of every gap is a fast zone (the comet rushes, the tunnel
// straightens there).
const TUNNEL_HOP = [30, 34];
const TUNNEL_RUSH = 120;                 // s of the first fly-by (~2 s of rush after the warp in)
const FLYBY_GAP = 125;                   // s between a fly-by and the next project stop (and stop -> fly-by)
const TUNNEL_EXIT_AFTER = 140;           // the tunnel ends this far after the last stop (a rush before the warp out)
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
const TEXT_EXIT_MIN_DOT = 0.2;           // the hop after the traits: at least this aligned with the helix exit

const TEXT_DIM_ALPHA = 0.25;            // the text block starts dim; lit as the comet traces it (1.0 = always lit)

// ── Apartment (universe 'rnd' and the landing) ─────────────────────
// A Gaussian splat of a real apartment (room.js renders it), placed once as
// a rigid frame after GIRAFFE360. Room units (the .sog frame): +Y up, 1 unit
// = 3.63 m, floor y = -0.413, ceiling cut at y = 0.30, bay windows on -Z.
// Scale s: the landing text fits (the orchestrator fit) at LANDING_CAM_Z -
// LANDING_TEXT.z room units, so s = fit / 0.65 (about 4.6 world units per
// room unit on desktop, more on portrait screens). Computed once at build.
const ROOM_FLOOR = -0.413;
// Metres per room unit, for the measure tool (depthTool.js). 3.63 assumes a
// 1.5 m camera height; calibration on standard fixtures (worktop 900 mm,
// door 1981 mm; zipnerf-room/scripts/calibrate_scale.py) gives × 0.95, ±3 %.
// Approximately metric: show "≈", never claim more.
export const M_PER_UNIT = 3.45;
const ROOM_BOX = { min: [-2.64, -0.47, -0.84], max: [0.91, 0.30, 2.08] }; // all rooms (fade, clearance)
const ROOM_WINDOW = [0, -0.02, -0.78];   // bay window centre (the frame: the window faces winDir; the tunnel leaves here)
// The comet enters and leaves over the window wall, just above the cut
// ceiling: from outside it sees the apartment as a dollhouse, then dives in
// (flying through the window splats would blur the whole view for a moment)
const WALL_TOP = [0.35, 0.48, -0.80];    // via over the window wall (east of the tall plant)
const WALL_IN = [0, -0.5, 1];            // crossing it inwards: descending into the living room
const WALL_OUT = [0, 0.35, -1];          // ... outwards: rising a little
const ROOM_ROOF = [0.1, 0.75, 0.5];      // above the cut ceiling: the dive into the landing
const WINDOW_STANDOFF = 16;              // world units outside the window wall: the entry lines up here (the dollhouse view)
const LANDING_TEXT = [0, -0.11, -0.4];   // contact text centre, in front of the windows
const LANDING_CAM_Z = 0.25;              // landing VIEW camera z (inside, sofa side); sets the scale
const APARTMENT_HOP = [34, 42];          // GIRAFFE360 -> window
const APARTMENT_DROP = [-0.32, -0.14];   // y of the hop direction (before normalising): the apartment sits lower
// The window faces 90° ± WINDOW_YAW_SPREAD off the way back to GIRAFFE360,
// on the side that puts GIRAFFE360 east of the living room (room +X): the
// comet then dives in over the east wall heading west, straight at the
// first object, and the tunnel leaves sideways, away from the rocks.
const WINDOW_YAW_SPREAD = 40;            // deg
const ENTRY_TOP = [0, 0.42, 0.1];        // the entry dive crosses the cut ceiling ENTRY_BACK before this point
const ENTRY_BACK = 0.6;                  // room units
const ENTRY_DIVE = 0.4;                  // descent per unit of horizontal travel
const APARTMENT_TRIES = 40;
const LANDING_EXIT_DIST = [30, 45];      // tunnel exit -> landing camera (logged if outside)
const DOOR_LEAD = 0.12;                   // room units: the comet lines up with a doorway this far before (and after) it
// Doorways (room units, door centre at the comet's height). axis: the
// comet crosses along it; the sign in OBJECT_SPOTS.doors picks the way.
// Checked against the splat (density along the paths): the hall door to the
// bedroom opens into a short passage along the bed head, so the comet turns
// south at its end (BED_IN, a single via) and stays above the bed.
const DOORS = {
    LH: { p: [-1.05, -0.14, 0.57], axis: [1, 0, 0] },     // living / hall
    CH: { p: [-1.10, -0.06, 0.975], axis: [1, 0, 0] },    // hall / bedroom passage
    BED_IN: { p: [-0.78, -0.06, 1.20], axis: [0.2, 0, 1], lead: 0 },  // passage / bedroom
    BC: { p: [0.34, -0.14, 1.37], axis: [1, 0, 0] },     // bedroom / corridor
    LC: { p: [0.50, -0.14, 0.90], axis: [0, 0, 1] },     // corridor / living
    // living room lane round the sofa (the LH door opens just behind it):
    // west of the sofa, then between the coffee table and the armchair
    LW1: { p: [-0.62, -0.12, 0.30], axis: [0.55, 0, -0.84], lead: 0 },
    LW2: { p: [-0.30, -0.12, -0.12], axis: [0.96, 0, -0.29], lead: 0 },
};
// Object stops: base on the floor at (x, z). The VIEW camera looks from
// `cam` (room units; only its direction counts, the distance is the fit,
// capped at fitMax room units so a portrait fit stays inside the walls).
// `doors`: the doorways from the previous object, with the crossing sign.
export const OBJECT_SCALE = 0.25;        // object height ≈ 0.25 room units ≈ 0.9 m
// Optional: `y` = base height (default: the floor), `scale` (default OBJECT_SCALE),
// `light` (× the object brightness in room.js: lamps near or not), `haloTilt` (deg).
// The tour: living room -> hall (in by LH, out by CH) -> bedroom -> corridor
// -> living room. Each VIEW camera looks within ~90° of the way the comet
// leaves next, so no flight has to turn the camera round.
const OBJECT_SPOTS = {
    // living room: on the coffee table (top y -0.296), 17 cm tall. Viewed from
    // the east-north-east (the free strip by the desk), so the view looks the
    // way the comet dives in. A view across the dive (it was from the south)
    // makes the comet hook up to 130° in the last metre: the arrival blend
    // then whipped the camera (250 deg/s)
    cherry: { x: -0.06, z: 0.13, y: -0.296, scale: 0.045, cam: [0.17, -0.12, 0.30], fitMax: 0.5, doors: [] },
    // kitchen-diner: on the dining table (cloth y -0.20), 35 cm tall
    vase:   { x: -1.92, z: 1.12, y: -0.20, scale: 0.095, cam: [-1.88, -0.10, 0.82], fitMax: 0.5, doors: [['LW1', -1], ['LH', -1]], light: 0.85 },
    // living room: on the desk by the east wall, next to the printer box, 30 cm long
    gpu:    { x: 0.72, z: 0.20, y: -0.18, scale: 0.067, cam: [0.35, -0.12, 0.20], fitMax: 0.5, doors: [['LH', 1], ['LW1', 1], ['LW2', 1]] },
    // kitchen-diner: pulled out at the corner of the dining table, 91 cm tall
    chair:  { x: -1.66, z: 0.97, cam: [-1.30, -0.12, 0.72], fitMax: 0.6, doors: [['LW2', -1], ['LW1', -1], ['LH', -1]], light: 0.75 },
    // hall: hung on the wall above the sofa (wall z = 0.124 x + 0.439, so the
    // camera looks along the wall normal), panel 1.15-1.85 m above the floor, 1 m wide
    board:  { x: -2.04, z: 0.245, y: -0.163, scale: 0.24, cam: [-2.114, -0.012, 0.840], fitMax: 0.66, doors: [], haloTilt: 90, light: 1.15 },
    // living room: on the floor with the toys by the bay window, 30 cm tall
    robot:  { x: 0.42, z: -0.18, scale: 0.083, cam: [0.25, -0.25, 0.12], fitMax: 0.5, doors: [['LH', 1], ['LW1', 1], ['LW2', 1]] },
};
// Object bounds (local units, objects.js): half width, height, and the
// height where the content starts (`bottom`: the board's panel)
const OBJECT_SIZE = {
    cherry: { hw: 0.4, h: 1.04 }, robot: { hw: 0.4, h: 1.0 }, vase: { hw: 0.4, h: 1.02 },
    chair: { hw: 0.25, h: 1.0 }, board: { hw: 0.58, h: 0.72, bottom: 0.27 }, gpu: { hw: 0.62, h: 0.64 },
};
// Halo ring round each object (Saturn style), radius in local units. The
// ring plane leans HALO_TILT up from the view direction, so it reads as a
// thin ellipse round the object's middle and never cuts through it. A
// subtle accent: HALO_INTENSITY stays under the bloom threshold indoors.
const HALO_R = { cherry: 0.6, robot: 0.5, vase: 0.52, chair: 0.5, board: 0.75, gpu: 0.72 };
const HALO_TILT = THREE.MathUtils.degToRad(15);
const HALO_POINTS = 120;
const HALO_DIM_ALPHA = 0.2;              // dim until the comet traces it
const HALO_INTENSITY = 0.8;              // colour × this (the text strokes use STROKE_INTENSITY 1.5)
const HALO_FADE_TIME = 0.5;              // s: a ring fades in (out) as its stop becomes (stops being) the focus
const OBJECT_PAD = 0.15;                 // × height: framing room above and below the object
const OBJECT_FRAME = 1.12;               // × the halo / object half width: framing room beside it (the fit)
const PLACE_TRIES = 12;
// The rocks after the apartment (education): placed once the apartment and
// the tunnel exist, clear of both, as one chain that turns smoothly back to
// the tunnel throat (placeAfterApartment)
const AFTER_TRIES = 1500;
const MAX_PITCH = 0.55;                  // |y| of hop direction — keeps text upright

// Overall outward drift of the journey
export const journeyDir = new THREE.Vector3(0.45, 0.08, -0.89).normalize();

// Visit order: the work first (the Giraffe360 rock, then the apartment of
// its R&D objects), then the education rocks, the projects tunnel and the
// contact landing. Planar stops carry their own paletteIdx (into the
// ATTRACTORS table) so every scene glows in a different color — the rocks
// share one palette.
// The text block is one stop; the comet traces it, spirals around it and
// flies on without a tap (orchestrator).
const ROUTE = [
    { id: 'traits',     universe: 'intro',      type: StopType.TEXT,    paletteIdx: 0,
      title: 'Traits', summary: 'Creative. Adaptive. Curious.' },
    { id: 'giraffe360', universe: 'work',       type: StopType.ROCK,    milestone: 3, paletteIdx: 1,
      summary: 'R&D engineer in 3D reconstruction and computer vision: 3DGS from sparse panorama views, benchmarking, research.' },
    { id: 'splatting',       universe: 'rnd', type: StopType.OBJECT, milestone: 10, object: 'cherry', paletteIdx: 3,
      summary: '3DGS reconstruction from sparse panorama views; influence accumulation, Analytic-Splatting, the pipeline restructuring.' },
    { id: 'windows-mirrors', universe: 'rnd', type: StopType.OBJECT, milestone: 11, object: 'vase', paletteIdx: 3,
      summary: 'Solved blurry windows, outdoor views and mirrors (a depth regularizer root cause); exterior splats and orbital videos.' },
    { id: 'benchmarking',    universe: 'rnd', type: StopType.OBJECT, milestone: 12, object: 'gpu', paletteIdx: 3,
      summary: 'Validation tools with ground-truth datasets, an experiment runner, artifact fixing on shared GPUs.' },
    { id: 'mesh-generation', universe: 'rnd', type: StopType.OBJECT, milestone: 13, object: 'chair', paletteIdx: 3,
      summary: 'Mesh generation, point-count reduction, an embeddable Rust/wgpu splat viewer and a comparison tool.' },
    { id: 'task-board-mcp',  universe: 'rnd', type: StopType.OBJECT, milestone: 14, object: 'board', paletteIdx: 3,
      summary: 'MCP server for the team task board; mentoring on a new depth algorithm; the looped drone video.' },
    { id: 'tour-narration',  universe: 'rnd', type: StopType.OBJECT, milestone: 15, object: 'robot', paletteIdx: 3,
      summary: 'Earlier (Jul - Oct 2025): a small LLM service that wrote tour narration.' },
    { id: 'rvkg',       universe: 'education',  type: StopType.ROCK,    milestone: 0, paletteIdx: 1,
      summary: 'Programming and mathematics track; state mathematics olympiads.' },
    { id: 'ai-talent',  universe: 'education',  type: StopType.ROCK,    milestone: 2, paletteIdx: 1,
      summary: 'Ponder AI talent program.' },
    { id: 'rtu',        universe: 'education',  type: StopType.ROCK,    milestone: 1, paletteIdx: 1,
      summary: 'Professional Bachelor in Financial Engineering.' },
    { id: 'flow',       universe: 'projects',   type: StopType.PROJECT, milestone: 5, paletteIdx: 2,
      summary: 'Offline workout tracker app (Dart/Flutter).' },
    { id: 'calculator', universe: 'projects',   type: StopType.PROJECT, milestone: 8, paletteIdx: 2,
      summary: 'Offline graphing calculator; 4th place in a programming competition.' },
    { id: 'sorting',    universe: 'projects',   type: StopType.PROJECT, milestone: 9, paletteIdx: 2,
      summary: 'Sorting algorithm visualizer (C++/SFML).' },
    { id: 'contact',    universe: 'contact',    type: StopType.LANDING, paletteIdx: 4,
      title: 'Contact', summary: 'Get in touch by email, LinkedIn or GitHub.' }
];
ROUTE.forEach((d, i) => {
    if (d.type === StopType.ROCK || (d.type === StopType.OBJECT && ROUTE[i - 1].type !== StopType.OBJECT)) SCENERY_LEGS.push(i);
});
// Universes are names, not indexes. A new universe is a new entry here
// plus ROUTE entries that use its id.
export const UNIVERSES = [
    { id: 'intro',      title: 'Intro' },
    { id: 'work',       title: 'Work' },
    { id: 'rnd',        title: 'Giraffe360 R&D' },
    { id: 'education',  title: 'Education' },
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
const TYPE_NAMES = { [StopType.TEXT]: 'text', [StopType.ROCK]: 'rock', [StopType.PROJECT]: 'project',
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
export function stopById(id) { return catalog.find(e => e.id === id) ?? null; }


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

// Shared materials: the outside world (rocks, text, galaxies) and the
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
export let scenery = [];
export let flybys = [];                  // { label, s, viz }
export let tunnelExitS = 0;              // s where the tunnel ends (the warp out)
let mailPlane = null;
export function getMailPlane() { return mailPlane; }

// The apartment frame (room units -> world): world = position + R(yaw) × room × scale.
// room.js renders the splat and the objects into it; `objects` lists the
// object stops (name, room position, yaw) for it.
export const apartment = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: 1,
    winDir: new THREE.Vector3(0, 0, -1),     // world direction out of the bay window (room -Z)
    entryDir: new THREE.Vector3(-1, 0, 0),   // room axes: horizontal heading of the entry dive
    box: ROOM_BOX,
    floor: ROOM_FLOOR,
    objects: []                              // { name, x, z, yaw } (room units, yaw about +Y)
};
export function roomToWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyQuaternion(apartment.quaternion)
        .multiplyScalar(apartment.scale).add(apartment.position);
}
export function roomDirToWorld(x, y, z, out = new THREE.Vector3()) {
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
    const tanV = Math.tan(camera.fov * Math.PI / 360);
    const fit = 1.25 * Math.max(halfH / (tanV * availH), halfW / (tanV * camera.aspect * availW));
    return THREE.MathUtils.clamp(fit, controls.minDistance, controls.maxDistance);
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
    // clamp the pitch, keeping the length 1 (scaling y alone and normalising
    // again lets a near-vertical kick through)
    if (Math.abs(out.y) > MAX_PITCH) {
        const h = Math.hypot(out.x, out.z), k = h > 1e-6 ? Math.sqrt(1 - MAX_PITCH * MAX_PITCH) / h : 0;
        out.set(out.x * k, Math.sign(out.y) * MAX_PITCH, out.z * k);
        if (h <= 1e-6) out.set(Math.sqrt(1 - MAX_PITCH * MAX_PITCH), Math.sign(out.y) * MAX_PITCH, 0);
    }
    return out;
}

// The rocks after the apartment (education), placed together as one chain
// from `prev` (the apartment) to the tunnel throat: each clear of the tunnel
// axis (all of it, the exit comes home too), of the apartment and of the
// other stops. The chain leaves the window (`fwd`) and must come back to
// the throat, behind it and along the tunnel axis (no hairpin into the
// warp), so it turns round somewhere: the best of the tries spreads that
// turn over all its corners (the smallest largest turn). Each rock faces
// its hop, so a corner is a turn at a departure; a sharp one makes the
// comet loop back past the camera (speed dips, a whipping view).
// tight[k]: rock k hops from a rock (the tight rock scene).
function placeAfterApartment(prev, placed, tight, fwd) {
    const T0 = tunnel.centreWorld(0, new THREE.Vector3()), e1 = tunnel.tangentWorld(0, new THREE.Vector3());
    const chain = tight.map(() => new THREE.Vector3()), dir = new THREE.Vector3(), d0 = new THREE.Vector3();
    const toThroat = new THREE.Vector3();
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < AFTER_TRIES; i++) {
        let p = prev, maxTurn = 0, sumTurn = 0;
        d0.copy(fwd);
        for (let k = 0; k < chain.length; k++) {
            randomHopDir(dir);
            const [hop0, hop1] = tight[k] ? [ROCK_HOP_MIN, ROCK_HOP_MAX] : [MIN_HOP, MAX_HOP];
            chain[k].copy(p).addScaledVector(dir, rand(hop0, hop1));
            const a = d0.angleTo(dir);
            maxTurn = Math.max(maxTurn, a); sumTurn += a;
            d0.copy(dir); p = chain[k];
        }
        toThroat.subVectors(T0, p).normalize();
        for (const a of [d0.angleTo(toThroat), toThroat.angleTo(e1)]) { maxTurn = Math.max(maxTurn, a); sumTurn += a; }
        const turnScore = 10 - maxTurn - 0.25 * sumTurn;
        if (turnScore <= bestScore) continue;            // a clear chain could not beat the best: skip the clearance
        let clear = Infinity;
        chain.forEach((c, k) => {
            const sep = tight[k] ? ROCK_SEPARATION : MIN_SEPARATION;
            clear = Math.min(clear, tunnel.axisDistance(c, tunnelExitS) / TUNNEL_CLEAR,
                             (c.distanceTo(apartmentCentre) - apartmentRadius) / sep);
            for (const q of placed) clear = Math.min(clear, c.distanceTo(q) / sep);
            for (let j = 0; j < k; j++) clear = Math.min(clear, c.distanceTo(chain[j]) / sep);
        });
        const score = clear >= 1 ? turnScore : clear;
        if (score > bestScore) { bestScore = score; best = chain.map(c => c.clone()); }
    }
    if (bestScore < 1) console.warn('rocks after the apartment: not fully clear', bestScore.toFixed(2));
    return best;
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
            d = Math.min(d, cand.distanceTo(apartmentCentre) - apartmentRadius - radius - 4);        // off the apartment
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
let insideFade = 0;                      // 0 = outside the tunnel, 1 = inside (cross-fade in the warp)
export function updateWorld(dt, headS) {
    for (const s of scenery) s.line.rotation.y += SCENERY_SPIN * dt;
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
    for (const f of flybys) updateViz(f.viz, f.s, headS, dt);
}
function updateViz(viz, s, headS, dt) {
    if (near(s, headS)) viz.update(dt);
    const v = (1 - THREE.MathUtils.smoothstep(Math.abs(s - headS), VIZ_FADE[0], VIZ_FADE[1])) * insideFade;
    viz.setVisibility(v, v > 0.002);
}
// Inside the tunnel the outside world (galaxies, rocks, landing) is
// hidden: the walls are see-through lines, and far glows would sit on
// top of the visualizations. The projects (stops and fly-bys) exist only
// inside. f = 0 outside .. 1 inside: the warp cross-fades the two worlds.
export function setInsideFade(f) {
    insideFade = f;
    const out = (1 - f) * (1 - roomFade);
    getStopMaterial('outside').uniforms.uVis.value = out;
    getStopMaterial('inside').uniforms.uVis.value = f;
    for (const s of scenery) s.line.visible = out > 0.002;
    for (const st of stops) {
        if (st.focusVis !== undefined) continue;              // updateWorld (focus fade)
        st.line.visible = st.type === StopType.PROJECT ? f > 0.002 : f < 0.998;
        if (st.viz) st.viz.group.visible = f > 0.002;
    }
    for (const fb of flybys) fb.viz.group.visible = f > 0.002;
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
// One rigid frame: the bay window sits a hop from GIRAFFE360 (direction d)
// and faces WINDOW_YAW off the way back (so the comet swings round to line
// up with it). The tunnel leaves the window along e1 (winDir, dipping
// EXIT_DIVE) and turns by tunnel.TUNNEL_TURN (almost a full circle), so the
// exit comes home behind the apartment, above it, heading towards it: the
// warp out ends with a short dive over the roof. Score: the rocks stay
// MIN_SEPARATION from the apartment and TUNNEL_CLEAR from the tunnel axis;
// the apartment stays TUNNEL_CLEAR from the axis except its last
// TUNNEL_EXIT_FREE units; among the clear candidates the one most ahead of
// the GIRAFFE360 view (`viewDir`) wins, as for the old tunnel placement.
let apartmentCentre = new THREE.Vector3(), apartmentRadius = 0;
function setApartmentFrame(W, winDir, s) {
    apartment.scale = s;
    apartment.winDir.copy(winDir);
    // room axes in world: z = -winDir, y = up, x = y × z
    const z = winDir.clone().negate(), y = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(y, z);
    apartment.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    // the window point lands on W
    apartment.position.set(0, 0, 0);
    const w = roomToWorld(...ROOM_WINDOW);
    apartment.position.copy(W).sub(w);
    const b = ROOM_BOX;
    roomToWorld((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2, apartmentCentre);
    apartmentRadius = 0.5 * s * Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
}
function apartmentCorners() {
    const b = ROOM_BOX, out = [];
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push(roomToWorld(x, y, z));
    return out;
}
function placeApartmentAndTunnel(from, viewDir, placed, length, s) {
    let best = null, bestScore = -Infinity;
    const d = new THREE.Vector3(), W = new THREE.Vector3(), winDir = new THREE.Vector3(), e1 = new THREE.Vector3();
    const T0 = new THREE.Vector3();
    for (let i = 0; i < APARTMENT_TRIES; i++) {
        randomHopDir(d);
        d.y = rand(APARTMENT_DROP[0], APARTMENT_DROP[1]);   // below GIRAFFE360: the comet sees the dollhouse from above and dives in
        d.normalize();
        W.copy(from).addScaledVector(d, rand(APARTMENT_HOP[0], APARTMENT_HOP[1]));
        // window facing: the way back (-d, flattened), turned by 90° ± spread
        const yaw = THREE.MathUtils.degToRad(90 + rand(-WINDOW_YAW_SPREAD, WINDOW_YAW_SPREAD));
        winDir.set(-d.x, 0, -d.z).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        setApartmentFrame(W, winDir, s);
        e1.copy(winDir).setY(-EXIT_DIVE).normalize();
        T0.copy(W).addScaledVector(e1, rand(TUNNEL_HOP[0], TUNNEL_HOP[1]));
        const turn = i % 2 ? 1 : -1;
        tunnel.setFrame(T0, e1, turn, length);
        let clear = Infinity;
        const corners = apartmentCorners();
        for (const p of placed) {
            clear = Math.min(clear, tunnel.axisDistance(p, length) / TUNNEL_CLEAR);
            for (const c of corners) clear = Math.min(clear, p.distanceTo(c) / MIN_SEPARATION);
        }
        for (const c of corners) clear = Math.min(clear, tunnel.axisDistance(c, length - TUNNEL_EXIT_FREE) / TUNNEL_CLEAR);
        const score = clear >= 1 ? 10 + d.dot(viewDir) : clear;
        if (score > bestScore) {
            bestScore = score;
            best = { W: W.clone(), winDir: winDir.clone(), T0: T0.clone(), e1: e1.clone(), turn };
        }
    }
    setApartmentFrame(best.W, best.winDir, s);
    tunnel.setFrame(best.T0, best.e1, best.turn, length);
    // the entry dive: the flight direction from GIRAFFE360, flattened, in room axes
    const h = worldToRoom(best.W.clone().add(best.W.clone().sub(from))).sub(worldToRoom(best.W.clone()));
    apartment.entryDir.set(h.x, 0, h.z).normalize();
    if (bestScore < 10) console.warn('apartment placement: not fully clear', bestScore.toFixed(2));
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
        fitMax: spot.fitMax * s
    };
}

// ── Indoor routes ──────────────────────────────────────────────────
// Via points of a flight (world space): [{ p, dir? }]. With `dir` the comet
// crosses the point exactly along it (doorways, the window). The
// orchestrator chains them (buildViaLegs).
function via(p, dir = null) {
    return { p: roomToWorld(...p), dir: dir ? roomDirToWorld(...dir) : null };
}
// A doorway is three vias in a line along its axis (DOOR_LEAD before, at,
// after it), so the comet (and the camera rail on its path) crosses it straight
function doorVias(name, sign) {
    const d = DOORS[name], a = d.axis.map(v => v * sign), lead = d.lead ?? DOOR_LEAD;
    return (lead ? [-lead, 0, lead] : [0]).map(k => via(d.p.map((v, i) => v + a[i] * k), a));
}
function windowVias() {
    // dive in over the cut ceiling, heading the way the comet comes from GIRAFFE360
    const h = apartment.entryDir;
    const P = via([ENTRY_TOP[0] - h.x * ENTRY_BACK, ENTRY_TOP[1], ENTRY_TOP[2] - h.z * ENTRY_BACK], [h.x, -ENTRY_DIVE, h.z]);
    // the line-up point is free (no direction): the flight bends onto the dive gradually
    return [{ p: P.p.clone().addScaledVector(P.dir, -WINDOW_STANDOFF), dir: null }, P];
}
// Out over the window wall, already turned towards `to` (the loop back to the first rock)
function exitTowards(to) {
    const W = via(WALL_TOP, WALL_OUT);
    const h = to.clone().sub(W.p).setY(0).normalize();
    W.dir.copy(h).setY(-WALL_OUT[1] / WALL_OUT[2]).normalize();
    return [W];
}
export function viasFor(from, dest) {
    const fromIn = from?.type === StopType.OBJECT || from?.type === StopType.LANDING;
    if (dest.type === StopType.OBJECT) {
        if (from?.type !== StopType.OBJECT) return windowVias();           // from outside: in through the window
        return OBJECT_SPOTS[dest.objectName].doors.flatMap(([n, sg]) => doorVias(n, sg));
    }
    if (dest.type === StopType.LANDING) {
        // over the roof, then a dive through the cut ceiling (down and towards the windows)
        return [{ p: roomToWorld(...ROOM_ROOF), dir: roomDirToWorld(0, -1, -1) }];
    }
    if (fromIn) return exitTowards(dest.center);                            // out over the window wall: to the first education rock, and the landing loop back
    return [];
}
export function isIndoorFlight(from, dest) {
    return from?.type === StopType.OBJECT && dest?.type === StopType.OBJECT;
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
    const projectS = k => TUNNEL_RUSH + FLYBY_GAP + 2 * k * FLYBY_GAP;
    tunnelExitS = projectS(nProjects - 1) + TUNNEL_EXIT_AFTER;
    // Fast zones: the middle of every stretch between throat, fly-bys, stops and exit
    const anchors = [0, TUNNEL_RUSH];
    for (let k = 0; k < nProjects; k++) anchors.push(projectS(k), projectS(k) + (k < nProjects - 1 ? FLYBY_GAP : TUNNEL_EXIT_AFTER));
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
    const roomScale = fitDistance(lx * TEXT_SCALE, ly * TEXT_SCALE) / (LANDING_CAM_Z - LANDING_TEXT[2]);
    apartment.objects = [];
    let afterApartment = false;   // rocks after it are placed clear of it and the tunnel
    let afterChain = [];          // ... as one chain (placeAfterApartment)

    for (const def of ROUTE) {
        // Rock → rock stays tight (the meteors are one scene);
        // everything else scatters far apart
        const tight = def.type === StopType.ROCK && prevDef?.type === StopType.ROCK;
        let center, tunnelS = null;
        if (def.type === StopType.OBJECT) {
            if (prevDef?.type !== StopType.OBJECT) {
                placeApartmentAndTunnel(prev, stops[stops.length - 1].normal, placed, tunnelExitS, roomScale);
                placed.push(apartmentCentre.clone());
                afterApartment = true;
            }
            const palette = ATTRACTORS[def.paletteIdx ?? 0].palette;
            const stop = { id: def.id, universe: def.universe, type: def.type, paletteIdx: def.paletteIdx ?? 0,
                           panel: MILESTONES[def.milestone].panel, tunnelS: null, viz: null, objectName: def.object,
                           ...buildObjectStop(def, palette) };
            scene.add(stop.line);
            stops.push(stop);
            prevDef = def;
            prev = stop.center;
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
        } else if (afterApartment) {
            if (!afterChain.length) {
                // this rock and the rocks right after it, as one chain (out over the window wall)
                const i0 = ROUTE.indexOf(def), tightK = [];
                for (let i = i0; ROUTE[i]?.type === StopType.ROCK; i++) tightK.push(ROUTE[i - 1].type === StopType.ROCK);
                afterChain = placeAfterApartment(prev, placed, tightK, apartment.winDir);
            }
            center = afterChain.shift();
        } else if (prevDef?.type === StopType.TEXT) {
            // The comet leaves the traits helix sideways, along -right
            // (orchestrator helixPos): no hop behind that, or the first leg
            // makes a hairpin (a cusp: the camera speed dips, acceleration spikes)
            const exit = stops[stops.length - 1].right.clone().negate(), h = new THREE.Vector3();
            center = placeNextCenter(prev, placed, MIN_HOP, MAX_HOP, MIN_SEPARATION,
                c => h.subVectors(c, prev).normalize().dot(exit) < TEXT_EXIT_MIN_DOT);
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
            viz = buildProjectViz(MILESTONES[def.milestone].label, { portal: !!MILESTONES[def.milestone].panel.portal });
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
        if (def.type === StopType.PROJECT) stop.line.material = getStopMaterial('inside');
        if (viz?.rim) {
            // A portal stop: the camera fit takes in the rim (fitHalfW/H), the comet loops round it
            stop.portal = stop.panel.portal;
            stop.rimR = viz.rim.outerR;
            stop.fitHalfW = Math.max(stop.halfW, viz.rim.outerR);
            stop.fitHalfH = Math.max(stop.halfH, viz.rim.outerR);
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
    const sOfStop = stops.filter(st => st.type === StopType.PROJECT).map(st => st.tunnelS);
    for (const fb of FLYBYS) {
        const s = fb.before === 0 ? TUNNEL_RUSH : (sOfStop[fb.before - 1] + sOfStop[fb.before]) / 2;
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
    setInsideFade(0);

    const landing = stops[stops.length - 1];
    scene.add(buildMailPlane(landing));
    // The warp out should come home: the exit sits a short flight behind the landing
    const exitD = tunnel.centreWorld(tunnelExitS, new THREE.Vector3()).distanceTo(roomToWorld(0, LANDING_TEXT[1], LANDING_CAM_Z));
    if (exitD < LANDING_EXIT_DIST[0] || exitD > LANDING_EXIT_DIST[1]) console.warn('tunnel exit -> landing camera', exitD.toFixed(1));
    return stops;
}
