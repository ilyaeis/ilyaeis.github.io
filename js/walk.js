// ── Walk mode ──────────────────────────────────────────────────────
// Walk through the apartment at eye height and collect the R&D objects of
// the tour (the object stops without `tour: false`, in route order). The site starts here: after the intro the orchestrator switches
// to Phase.EXPLORE (explore.js) and calls enterWalk / update / exitWalk /
// leaveInPlace; main.js routes input here (onTap, onDrag, setKeys, onEnter).
// This module owns the camera pose while walking (no camera.js changes) and
// its own DOM: the "Explore the flat" buttons, the HUD ("n / 4", and the
// back button when entered from a stop), and one bottom bar (.walk-tour):
// Collect (any walk, while a panel shows), then for the tour (entered from
// the intro or ?go=<object id>) the task line, "Next object" (also Enter:
// a guided walk to the first tour object not collected yet, then its panel;
// from the intro the first one starts by itself; a tap, Enter or Next object
// during it is the skip: a fade through black to the object; the hint "tap
// to skip · drag to look" shows only while it runs),
// "Skip the flat →" ("Continue →" once all are found) and an edge arrow to
// that object while it is off screen or out of sight. The two stops out of
// the tour (the wall board, the depth room) are reached by ?go: no halo
// hint, no count, no Collect.
// Panel text goes through the 'walk:panel' event to stopPanel.js.
//
// Walk grid: assets/room/walk.json (make_walk_grid.py, lazily loaded), a
// 2D occupancy grid in room units (the .sog frame: +Y up, 1 unit = 3.63 m).
// It is the configuration space: the 0.2 m body radius is baked in, so the
// walker collides as a thin skin (COLLIDE_R) and slides along the walls.
// `sight` marks cells that hide what is behind them at eye height (walls):
// object halos and taps need a clear line of sight.

import * as THREE from 'three';
import { scene, camera, ATTRACTORS, getPaletteColor, isMobile, setPixelRatioCap } from './attractors.js';
import { stops, StopType, planePointToWorld } from './world.js';
import { apartment, roomToWorld, worldToRoom, roomSharp } from './room.js';
import { registerWalker, enterExplore, exitExplore, skipFlat } from './explore.js';

const DEG = Math.PI / 180;

// ── Tuning ─────────────────────────────────────────────────────────
const GRID_URL = 'assets/room/walk.json';
const SPEED_M = 1.8;                   // m/s walk speed (a brisk walk: the tour should not drag)
const GUIDE_SPEED_M = 2.6;             // m/s: a guided walk (Next object, the tour) glides faster: nobody steers it
const CORNER_TURN = 20 * DEG;          // a guided walk slows to SPEED_M at path corners sharper than this ...
const CORNER_DECEL_M = 1.5;            // ... braking at most this (m/s2) before them (fast through a corner: wall contacts)
// The skip: a tap (or Enter) during a guided walk fades to black, moves the
// walker to the goal (facing the object) and fades back in (the panel opens)
const JUMP_FADE = 0.25;                // s: fade out, and fade in
const JUMP_HOLD = 0.06;                // s: black between them
const PREVIEW_SPEED = 0.5;             // × while the blurry preview splat still shows (a slow network): walk slowly until the full one is in
const WALK_PIXEL_RATIO = 1.25;         // phones: pixel ratio ceiling while walking (the splat fills the screen; adaptive resolution steps only after 40 slow frames)
const ACCEL_TIME = 0.25;               // s: velocity spring (eased start and stop)
const COLLIDE_M = 0.02;                // m: collision skin (the body radius is baked into the grid)
const YAW_TIME = 0.18, YAW_MAX = 120 * DEG;      // auto turns: smooth time, speed cap (drag look is direct)
const PITCH_TIME = 0.12, PITCH_MAX = 120 * DEG;
const PITCH_MIN = -60 * DEG, PITCH_TOP = 15 * DEG; // the ceiling is a black void above ~2.2 m
const LOOK_RAD_PER_PX = 0.0045;        // drag look sensitivity (drag the world)
const KEY_TURN = 100 * DEG;            // rad/s: arrow keys turn
const LOOKAHEAD_M = 0.6;               // path following: carrot distance (scaled with the walk speed: corners stay clear)
const ARRIVE_M = 0.75;                 // slow down within this of the goal (the braking stays gentle at the brisker pace)
const SNAP_M = 1.0;                    // a tap on a blocked spot walks to the nearest free cell within this
const WALL_SOFT = 8, WALL_COST = 0.15; // A*: extra cost per cell of clearance under WALL_SOFT (paths keep off the walls)
const GOAL_CLEAR = 3;                  // cells: a walk goal (or the start) keeps this clearance when it can
const AVOID_CELLS = 5;                 // gentle wall avoidance while moving: under this clearance (cells) ...
const AVOID_M = 0.3;                   // ... push away from the wall at up to this speed (m/s)
const FOV = 70;                        // vertical degrees while walking (portrait too: wider distorts)
const EASE_MIN = 1.0, EASE_PER_M = 0.15, EASE_MAX = 2.4; // s: enter / exit ease, longer for a longer way
const LIFT_ABOVE = 0.15;               // room units over the cut ceiling (0.30): an exit with no line of sight rises over the walls
const ROOM_CEIL = 0.30;
const LOS_END_M = 0.3;                 // line of sight stops this much more than the halo radius short of the object
const HALO_HINT = 0.3;                 // halo brightness of an object not collected yet (a hint where to look)
const HALO_LIT = 1.8;                  // ... collected: lit for good (HDR: over the indoor bloom threshold 0.75, it glows)
const HALO_FADE = 0.35;                // s: line-of-sight fade
const HIT_SCALE = 1.15;                // tap sphere radius × the object's halo / half height
const PANEL_SHIFT = [0.5, 0.45];       // turn-to: the object sits at this NDC offset off the panel (side x, bottom y)
const STORE_KEY = 'rnd.collected';
// The tour (Next object): a guided walk turns gently (auto turns capped at
// GUIDE_YAW_MAX, also the turn to the object at the end) and stops this far
// from the object, on the side its journey view looks from (further for a
// low object, so the view looks down at most GUIDE_PITCH)
const GUIDE_YAW_MAX = 85 * DEG;
const GUIDE_VIEW_M = 1.5;
const GUIDE_PITCH = 40 * DEG;
const GOAL_ROOMY = 8;                  // cells of clearance a guide goal should have
const ENTER_PITCH = -4 * DEG;          // the walk from the intro starts at eye level, a little down (the ceiling is a void)
const GUIDE_ARRIVE_M = 0.15;            // m: ... and counts as there when it has stopped within this of the goal
const ARROW_EVERY = 0.4;               // s: the edge arrow re-plans its way to the next object this often
const ARROW_INSET = 0.86;              // NDC: the arrow keeps this far inside the screen edge

// ── DOM ────────────────────────────────────────────────────────────
const exploreBtns = [...document.querySelectorAll('.walk-explore')];
const floatBtn = document.querySelector('.walk-explore-float');
const panelBtn = document.querySelector('.stop-panel .walk-explore');
const collectBtn = document.querySelector('.walk-collect');
const hudEl = document.querySelector('.walk-hud');
const countEl = document.querySelector('.walk-count');
const backBtn = document.querySelector('.walk-back');
const tourEl = document.querySelector('.walk-tour');
const taskEl = document.querySelector('.walk-task');
const hintEl = document.querySelector('.walk-hint');
const nextBtn = document.querySelector('.walk-next');
const skipBtn = document.querySelector('.walk-skip');
const arrowEl = document.querySelector('.walk-arrow');

// ── State ──────────────────────────────────────────────────────────
let G = null, gridPromise = null;      // the grid (walk.json) and its decoded fields
let bits, sightBits, nx, nz, cell, x0, z0, clear, CL_MIN = 1;
let M = 1 / 3.63;                      // one metre in room units (from the grid)
let SPEED, COLLIDE_R, LOOKAHEAD, ARRIVE_R;
let mode = 'off';                      // off | wait (grid loading) | in | walk | out
let onDone = null;
let immediate = false;
const pos = new THREE.Vector2(), vel = new THREE.Vector2(), acc = new THREE.Vector2();
const look = { yaw: 0, pitch: 0, yawT: 0, pitchT: 0, yawV: 0, pitchV: 0 };
let path = null, pathCum = null, pathLen = 0, pathS = 0, autoYaw = false, stuckT = 0, stuckS = 0;
let keys = new Set();
let selected = null;                   // the object stop whose panel shows
let tour = false;                      // entered from the intro (or ?go): the tour HUD
let barTour = false;                   // the bottom bar shows the tour (task, Next object, Skip)
let guide = null;                      // the object a Next-object walk goes to
let autoNext = false;                  // the walk from the intro: Next object as soon as the walk starts
let slowTurn = false;                  // auto turns at GUIDE_YAW_MAX (a guided walk and its turn)
let arrived = false;                   // the path ended at its goal this step
let jumpT = -1;                         // s into the skip's fade (-1: none)
const fadeEl = document.querySelector('.walk-fade');
let arrowT = 0, arrowWay = null;       // edge arrow: re-plan timer, { stop, raw } to the next object
const collected = new Set(load());
let halos = null;                      // [{ stop, line, vis }]
let marker = null, group = null;
const ease = { t: 0, T: 1, lift: 0 };
const fromPos = new THREE.Vector3(), fromQ = new THREE.Quaternion(); let fromFov = 60;
const toPos = new THREE.Vector3(), toQ = new THREE.Quaternion(); let toFov = 60;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector2(), _a = new THREE.Vector2();
const ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _sphere = new THREE.Sphere();

function load() {
    try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch { return []; }
}
function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...collected])); } catch { /* private mode: this visit only */ }
}
const objectStops = () => stops.filter(s => s.type === StopType.OBJECT && s.universe === 'rnd');
const tourStops = () => objectStops().filter(s => s.tour);
const total = () => tourStops().length;

// ── Grid ───────────────────────────────────────────────────────────
function loadGrid() {
    if (!gridPromise) gridPromise = fetch(GRID_URL).then(r => r.json()).then(initGrid)
        .catch(err => { console.error('walk grid load failed', err); gridPromise = null; throw err; });
    return gridPromise;
}
const unpack = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
function initGrid(g) {
    G = g;
    ({ nx, nz, cell, x0, z0 } = g);
    bits = unpack(g.bits);
    sightBits = g.sight ? unpack(g.sight) : new Uint8Array(bits.length);
    M = 1 / g.unit_m;
    SPEED = SPEED_M * M; COLLIDE_R = COLLIDE_M * M; LOOKAHEAD = LOOKAHEAD_M * M; ARRIVE_R = ARRIVE_M * M;
    // Clearance: 8-neighbour BFS distance (cells) to the nearest blocked cell.
    // Paths use only cells with clearance >= CL_MIN, so the collision circle
    // never touches a wall on a planned path (no jams at door corners).
    CL_MIN = Math.max(1, Math.ceil(COLLIDE_R / cell + 0.5));
    clear = new Uint8Array(nx * nz).fill(255);
    const qu = new Int32Array(nx * nz); let h = 0, t = 0;
    for (let i = 0; i < nx * nz; i++) { const ix = i % nx, iz = (i - ix) / nx; if (!free(ix, iz)) { clear[i] = 0; qu[t++] = i; } }
    while (h < t) {
        const i = qu[h++], ix = i % nx, iz = (i - ix) / nx;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
            const j = jz * nx + jx; if (clear[j] === 255) { clear[j] = Math.min(254, clear[i] + 1); qu[t++] = j; }
        }
    }
}
const bit = (arr, ix, iz) => ((arr[(iz * nx + ix) >> 3] >> ((iz * nx + ix) & 7)) & 1) === 1;
const inside = (ix, iz) => ix >= 0 && iz >= 0 && ix < nx && iz < nz;
const free = (ix, iz) => inside(ix, iz) && bit(bits, ix, iz);
const cx = x => Math.floor((x - x0) / cell), cz = z => Math.floor((z - z0) / cell);
const roomy = (ix, iz) => inside(ix, iz) && clear[iz * nx + ix] >= CL_MIN;
const clearAt = (ix, iz) => inside(ix, iz) ? clear[iz * nx + ix] : 0;

// Nearest roomy cell (ring search) within r room units, or null. With
// minClear: prefer cells with that clearance (off the wall), else any.
function nearestFree(x, z, r, minClear = 0) {
    const ix = cx(x), iz = cz(z), R = Math.ceil(r / cell);
    let best = null, bd = Infinity, bestC = null, bdC = Infinity;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d = dx * dx + dz * dz;
        if (d > R * R || !roomy(ix + dx, iz + dz)) continue;
        if (d < bd) { bd = d; best = [ix + dx, iz + dz]; }
        if (minClear && d < bdC && clear[(iz + dz) * nx + ix + dx] >= minClear) { bdC = d; bestC = [ix + dx, iz + dz]; }
    }
    return bestC && bdC <= Math.max(bd, 1) * 9 ? bestC : best;   // the clear cell if it is not much further
}

// Circle vs blocked cells: push the centre out of every overlapping
// blocked cell (closest point on the cell box). Moving into a wall at an
// angle leaves the tangential part: that is the slide. Adds the total
// push to `push` (the caller removes the velocity into the wall).
function collide(p, push) {
    const R = Math.ceil(COLLIDE_R / cell) + 1;
    for (let it = 0; it < 3; it++) {
        const ix = cx(p.x), iz = cz(p.y);
        let moved = false;
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
            const jx = ix + dx, jz = iz + dz;
            if (free(jx, jz)) continue;
            const ax = x0 + jx * cell, az = z0 + jz * cell;
            const qx = Math.min(Math.max(p.x, ax), ax + cell), qz = Math.min(Math.max(p.y, az), az + cell);
            const ex = p.x - qx, ez = p.y - qz;
            const d = Math.hypot(ex, ez);
            if (d >= COLLIDE_R) continue;
            if (d < 1e-9) {               // centre inside a blocked cell: jump to the nearest free cell centre
                const n = nearestFree(p.x, p.y, 0.5 * M);
                if (n) {
                    const nx_ = x0 + (n[0] + 0.5) * cell, nz_ = z0 + (n[1] + 0.5) * cell;
                    if (push) { push.x += nx_ - p.x; push.y += nz_ - p.y; }
                    p.x = nx_; p.y = nz_;
                }
                return;
            }
            p.x += ex / d * (COLLIDE_R - d); p.y += ez / d * (COLLIDE_R - d);
            if (push) { push.x += ex / d * (COLLIDE_R - d); push.y += ez / d * (COLLIDE_R - d); }
            moved = true;
        }
        if (!moved) return;
    }
}

// Line of sight for the walker: every sample keeps `margin` cells more than
// CL_MIN off the walls, so a pulled string never grazes a corner
function clearLine(ax, az, bx, bz, margin = 1) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (cell * 0.5)));
    for (let i = 1; i < n; i++) {
        const ix = cx(ax + (bx - ax) * i / n), iz = cz(az + (bz - az) * i / n);
        if (!roomy(ix, iz) || clear[iz * nx + ix] < CL_MIN + margin) return false;
    }
    return true;
}

// Eye line of sight (walls at eye height), stopping `end` short of b
function seeLine(ax, az, bx, bz, end) {
    const L = Math.hypot(bx - ax, bz - az), stop = Math.max(0, L - end), n = Math.ceil(stop / (cell * 0.5));
    for (let i = 1; i <= n; i++) {
        const t = (i / n) * stop / L, ix = cx(ax + (bx - ax) * t), iz = cz(az + (bz - az) * t);
        if (inside(ix, iz) && bit(sightBits, ix, iz)) return false;
    }
    return true;
}

// A* (8-connected, no corner cutting, octile heuristic, binary heap on
// typed arrays: a full flood is about 2x faster than with [f, i] pairs).
// With gx < 0: no goal, a flood from the start (Dijkstra): { gS, from } for every cell
let heapF = new Float64Array(1 << 16), heapI = new Int32Array(1 << 16);
function search(sx, sz, gx, gz) {
    const N = nx * nz, gS = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    let n = 0;
    const h = gx < 0 ? () => 0
        : (ix, iz) => { const dx = Math.abs(ix - gx), dz = Math.abs(iz - gz); return Math.max(dx, dz) + 0.41421356 * Math.min(dx, dz); };
    const push = (f, i) => {
        if (n === heapF.length) {
            const F = new Float64Array(n * 2), I = new Int32Array(n * 2);
            F.set(heapF); I.set(heapI); heapF = F; heapI = I;
        }
        let k = n++;
        while (k > 0) {
            const p = (k - 1) >> 1;
            if (heapF[p] <= f) break;
            heapF[k] = heapF[p]; heapI[k] = heapI[p]; k = p;
        }
        heapF[k] = f; heapI[k] = i;
    };
    const pop = () => {
        const top = heapI[0];
        const f = heapF[--n], i = heapI[n];
        let k = 0;
        for (;;) {
            const l = 2 * k + 1, r = l + 1;
            if (l >= n) break;
            const m = r < n && heapF[r] < heapF[l] ? r : l;
            if (heapF[m] >= f) break;
            heapF[k] = heapF[m]; heapI[k] = heapI[m]; k = m;
        }
        heapF[k] = f; heapI[k] = i;
        return top;
    };
    const s = sz * nx + sx, goal = gx < 0 ? -1 : gz * nx + gx;
    gS[s] = 0; push(h(sx, sz), s);
    while (n) {
        const i = pop();
        if (closed[i]) continue;
        if (i === goal) break;
        closed[i] = 1;
        const ix = i % nx, iz = (i - ix) / nx;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const jx = ix + dx, jz = iz + dz;
            if (!roomy(jx, jz)) continue;
            if (dx && dz && (!roomy(ix + dx, iz) || !roomy(ix, iz + dz))) continue;
            const j = jz * nx + jx, c = clear[j];
            const g = gS[i] + (dx && dz ? 1.41421356 : 1) * (1 + (c < WALL_SOFT ? (WALL_SOFT - c) * WALL_COST : 0));
            if (g < gS[j]) { gS[j] = g; from[j] = i; push(g + h(jx, jz), j); }
        }
    }
    return { gS, from, s };
}
// The cell path from the search start to cell `goal` (room units), or null
function cellPath({ from, s }, goal) {
    if (from[goal] < 0 && goal !== s) return null;
    const out = [];
    for (let i = goal; i >= 0; i = from[i]) { const ix = i % nx; out.push([x0 + (ix + 0.5) * cell, z0 + ((i - ix) / nx + 0.5) * cell]); if (i === s) break; }
    return out.reverse();
}
function astar(sx, sz, gx, gz) { return cellPath(search(sx, sz, gx, gz), gz * nx + gx); }

// String pulling: keep only the nodes needed for line of sight
function smooth(pts) {
    const out = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
        let b = pts.length - 1;
        while (b > a + 1 && !clearLine(pts[a][0], pts[a][1], pts[b][0], pts[b][1])) b--;
        out.push(pts[b]); a = b;
    }
    return out;
}

// ── Springs ────────────────────────────────────────────────────────
// Unity-style SmoothDamp with a speed cap (critically damped spring)
function smoothDamp(cur, target, v, time, maxSpeed, dt) {
    const omega = 2 / time, x = omega * dt, exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const maxChange = maxSpeed * time;
    const change = Math.max(-maxChange, Math.min(maxChange, cur - target));
    const tgt = cur - change;
    const temp = (v + omega * change) * dt;
    let nv = (v - omega * temp) * exp, out = tgt + (change + temp) * exp;
    if ((target - cur > 0) === (out > target)) { out = target; nv = (out - target) / dt; }
    return [out, nv];
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const smoother = t => t * t * t * (t * (6 * t - 15) + 10);

// ── Path ───────────────────────────────────────────────────────────
function setPath(gx, gz) {
    const s = nearestFree(pos.x, pos.y, 0.3 * M), g = nearestFree(gx, gz, SNAP_M * M, GOAL_CLEAR);
    if (!s || !g) return { ok: false, why: !s ? 'start' : 'goal' };
    const raw = astar(s[0], s[1], g[0], g[1]);
    if (!raw) return { ok: false, why: 'no path' };
    guide = null; slowTurn = false;
    return followRaw(raw);
}
function followRaw(raw) {
    raw[0] = [pos.x, pos.y];
    path = smooth(raw);
    pathLen = 0; pathCum = [0];
    for (let i = 1; i < path.length; i++) pathCum.push(pathLen += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    pathS = 0; stuckT = 0; stuckS = 0; autoYaw = true;
    if (marker) { marker.position.set(path.at(-1)[0], G.floor + 0.003, path.at(-1)[1]); marker.visible = true; }
    return { ok: true, nodes: raw.length, smoothNodes: path.length, len_m: +(pathLen / M).toFixed(2) };
}
function endPath() { path = null; if (marker) marker.visible = false; }

// ── The tour: the first object not collected yet (route order) ──
// The goal: GUIDE_VIEW_M from the object, on the side its journey view
// looks from (stop.normal points from that view to the object). Of a few
// spots round that one (turned, nearer, further) the one with room round it
// (GOAL_ROOMY cells of clearance: a cramped goal is hard to walk out of)
// and a line of sight wins. Fixed per object: computed once.
function objectGoal(h) {
    if (h.goal !== undefined) return h.goal;
    // a room stop: its fixed goal just inside the door
    if (h.stop.walkGoal) return (h.goal = nearestFree(...h.stop.walkGoal, 0.3 * M, GOAL_CLEAR));
    const n = worldToRoom(_v.copy(h.stop.center).sub(h.stop.normal)).sub(h.room).setY(0).normalize();
    const d0 = Math.max((h.stop.walkM ?? GUIDE_VIEW_M) * M, (G.eye - h.room.y) / Math.tan(GUIDE_PITCH)), a0 = Math.atan2(n.z, n.x);
    let best = null, bestS = Infinity;
    for (const da of [0, 0.35, -0.35, 0.7, -0.7]) for (const k of [1, 0.85, 1.2]) {
        const x = h.room.x + Math.cos(a0 + da) * d0 * k, z = h.room.z + Math.sin(a0 + da) * d0 * k;
        const g = nearestFree(x, z, 0.3 * M, GOAL_CLEAR);
        if (!g) continue;
        const gx = x0 + (g[0] + 0.5) * cell, gz = z0 + (g[1] + 0.5) * cell, c = clearAt(g[0], g[1]);
        if (!seeLine(gx, gz, h.room.x, h.room.z, h.end)) continue;
        const sc = 0.5 * Math.abs(da) + Math.abs(k - 1) + Math.hypot(gx - x, gz - z) / M + 0.3 * Math.max(0, GOAL_ROOMY - c);
        if (sc < bestS) { bestS = sc; best = g; }
    }
    h.goal = best ?? nearestFree(h.room.x + n.x * d0, h.room.z + n.z * d0, SNAP_M * M, GOAL_CLEAR);
    return h.goal;
}
// { stop, raw, len } of the first uncollected tour object (not `skip`), or null.
// Each object has a flood from its goal (the grid and the goals are fixed:
// built once), so a plan is a lookup at the walker's cell and a walk down
// `from` (each step one cell nearer the goal), not a flood per plan.
// `oneFlood`: build at most one missing flood and return undefined (plan
// again next frame), so the edge arrow never builds several in one frame.
function nextWay(skip = null, oneFlood = false) {
    const st = nearestFree(pos.x, pos.y, 0.3 * M);
    if (!st || !halos) return null;
    const s = st[1] * nx + st[0];
    let best = null;
    for (const h of halos) {
        if (!h.stop.tour || collected.has(h.stop.id) || h.stop === skip) continue;
        const g = objectGoal(h);
        if (!g) continue;
        if (!h.flood) {
            h.flood = search(g[0], g[1], -1, -1);
            if (oneFlood) return undefined;
        }
        const len = h.flood.gS[s];
        if (len < Infinity) { best = { stop: h.stop, from: h.flood.from, goal: h.flood.s, len }; break; }
    }
    if (!best) return null;
    const raw = [];
    for (let i = s; i >= 0; i = best.from[i]) {
        const ix = i % nx;
        raw.push([x0 + (ix + 0.5) * cell, z0 + ((i - ix) / nx + 0.5) * cell]);
        if (i === best.goal) break;
    }
    return { stop: best.stop, raw, len: best.len };
}
// "Next object": walk to the first tour object not collected yet (the one
// whose panel shows is done: the next one), then turn to it and show its
// panel (from the intro the first one starts by itself)
function next() {
    if (mode !== 'walk') return { ok: false, why: 'not walking' };
    if (guide && path) return skipGuide() ? { ok: true, skip: true, object: guide.id } : { ok: false, why: 'skipping' };   // (pressed again on the way: the skip)
    const way = nextWay(selected);
    if (!way) return { ok: false, why: 'all collected' };
    select(null);
    const r = followRaw(way.raw);
    guide = way.stop; slowTurn = true;
    return { ...r, object: way.stop.id };
}
// A guided walk to one object (the agent API: journey.goTo(<object id>) while walking)
function guideTo(stop) {
    if (mode !== 'walk') return { ok: false, why: 'not walking' };
    const h = halos.find(x => x.stop === stop), g = h && objectGoal(h), st = nearestFree(pos.x, pos.y, 0.3 * M);
    const raw = g && st && astar(st[0], st[1], g[0], g[1]);
    if (!raw) return { ok: false, why: 'no path' };
    select(null);
    const r = followRaw(raw);
    guide = stop; slowTurn = true;
    return { ...r, object: stop.id };
}
const allCollected = () => tourStops().every(s => collected.has(s.id));
function onArrive() {
    if (!guide) return;
    const st = guide;
    guide = null;
    select(st);   // (a room: turns to face into it, walkLook)
}
// Room stops (the depth room): walking into the box opens its panel (no
// turn), but only for a tour stop; walking out closes it. A guided walk
// (?go, the agent API) opens it on arrival instead.
const ROOM_OUT = 0.02;                 // room units: hysteresis on the way out
function updateRooms() {
    for (const h of halos) {
        const b = h.stop.roomBox;
        if (!b) continue;
        const m = h.inside ? ROOM_OUT : 0;
        const inside = pos.x > b.min[0] - m && pos.x < b.max[0] + m && pos.y > b.min[1] - m && pos.y < b.max[1] + m;
        if (inside && !h.inside && !guide && selected !== h.stop && h.stop.tour) select(h.stop, false);
        else if (!inside && h.inside && selected === h.stop) select(null);
        h.inside = inside;
    }
}
function pathPoint(s) {
    for (let i = 1; i < path.length; i++) {
        const L = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        if (s <= L || i === path.length - 1) {
            const t = Math.min(1, s / (L || 1));
            return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
        }
        s -= L;
    }
    return path.at(-1);
}
function projectS() {
    let best = Infinity, bs = 0, run = 0;
    for (let i = 1; i < path.length; i++) {
        const ax = path[i - 1][0], az = path[i - 1][1], dx = path[i][0] - ax, dz = path[i][1] - az, L2 = dx * dx + dz * dz;
        const t = L2 ? Math.max(0, Math.min(1, ((pos.x - ax) * dx + (pos.y - az) * dz) / L2)) : 0;
        const d = Math.hypot(ax + dx * t - pos.x, az + dz * t - pos.y);
        if (d < best && run + t * Math.sqrt(L2) >= pathS - 0.05 * M) { best = d; bs = run + t * Math.sqrt(L2); }
        run += Math.sqrt(L2);
    }
    return bs;
}

// Gentle wall avoidance: away from the walls (clearance gradient), stronger
// the closer they are; zero beyond AVOID_CELLS
function avoidance(out) {
    const ix = cx(pos.x), iz = cz(pos.y), c = clearAt(ix, iz);
    out.set(0, 0);
    if (c >= AVOID_CELLS) return out;
    const gx = clearAt(ix + 1, iz) - clearAt(ix - 1, iz), gz = clearAt(ix, iz + 1) - clearAt(ix, iz - 1);
    const L = Math.hypot(gx, gz);
    if (!L) return out;
    const k = 1 - c / AVOID_CELLS;
    return out.set(gx / L, gz / L).multiplyScalar(AVOID_M * M * k * k);
}

// ── Walker step (room units) ───────────────────────────────────────
let lastPush = 0;
// (a guided walk glides faster, and faster still after a tap: the skip;
// it brakes to the walk speed before each sharp corner of its path)
function speedNow() {
    let v = SPEED;
    if (guide && path) {
        v = SPEED * GUIDE_SPEED_M / SPEED_M;
        const A = CORNER_DECEL_M * M;
        for (let i = 1; i < path.length - 1; i++) {
            const d = pathCum[i] - pathS - vel.length() * ACCEL_TIME;   // (the velocity spring lags: brake early)
            if (pathCum[i] < pathS) continue;
            const ax = path[i][0] - path[i - 1][0], az = path[i][1] - path[i - 1][1], bx = path[i + 1][0] - path[i][0], bz = path[i + 1][1] - path[i][1];
            const turn = Math.abs(wrap(Math.atan2(bz, bx) - Math.atan2(az, ax)));
            if (turn > CORNER_TURN) v = Math.min(v, Math.sqrt(SPEED * SPEED + 2 * A * Math.max(0, d)));
        }
    }
    return v * (roomSharp() ? 1 : PREVIEW_SPEED);
}
function step(dt) {
    _w.set(0, 0);
    const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const r = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const turn = (keys.has('arrowleft') || keys.has('q') ? 1 : 0) - (keys.has('arrowright') || keys.has('e') ? 1 : 0);
    if (turn) { look.yaw += turn * KEY_TURN * dt; look.yawT = look.yaw; look.yawV = 0; autoYaw = false; }
    if (f || r) {
        endPath(); guide = null; slowTurn = false;
        const sy = Math.sin(look.yaw), cy = Math.cos(look.yaw);
        _w.set(-sy * f + cy * r, -cy * f - sy * r).normalize().multiplyScalar(speedNow());
    } else if (path) {
        pathS = Math.max(pathS, projectS());
        const left = pathLen - pathS;
        // carrot: LOOKAHEAD along the path, pulled in until it is in sight
        // (a carrot behind a corner pushes straight into the wall: no slide)
        const fast = speedNow() / SPEED;   // the carrot and the braking scale with the speed
        let la = LOOKAHEAD, c = pathPoint(Math.min(pathLen, pathS + la));
        while (la > cell && !clearLine(pos.x, pos.y, c[0], c[1], 0)) { la *= 0.6; c = pathPoint(Math.min(pathLen, pathS + la)); }
        _w.set(c[0] - pos.x, c[1] - pos.y);
        const d = _w.length();
        const sp = speedNow() * Math.min(1, Math.sqrt(Math.max(left, 0) / (ARRIVE_R * Math.max(1, fast))));   // eased arrival
        if (d > 1e-6) _w.multiplyScalar(sp / d);
        if (left < 0.03 * M && Math.hypot(path.at(-1)[0] - pos.x, path.at(-1)[1] - pos.y) < 0.05 * M) { endPath(); arrived = true; }
        // a guided walk is there when it has (almost) stopped close to the goal
        // (the wall avoidance can hold it a few cm short)
        if (path && guide && left < GUIDE_ARRIVE_M * M && vel.length() < 0.05 * SPEED) { endPath(); arrived = true; }
        // stuck guard: no progress for 1.5 s cancels the walk
        stuckT += dt;
        if (path && stuckT > 1.5) { if (pathS - stuckS < 0.02 * M) { endPath(); guide = null; } stuckT = 0; stuckS = pathS; }
        if (autoYaw && vel.length() > 0.3 * SPEED) look.yawT = look.yaw + wrap(Math.atan2(-vel.x, -vel.y) - look.yaw);
    }
    if (_w.lengthSq() > 0) _w.addScaledVector(avoidance(_a), _w.length() / SPEED);
    // velocity spring (critically damped): eased start, stop and turns
    [vel.x, acc.x] = smoothDamp(vel.x, _w.x, acc.x, ACCEL_TIME, Infinity, dt);
    [vel.y, acc.y] = smoothDamp(vel.y, _w.y, acc.y, ACCEL_TIME, Infinity, dt);
    // move in sub-steps under half a cell, colliding each step
    const n = Math.max(1, Math.ceil(vel.length() * dt / (cell * 0.4)));
    _a.set(0, 0);
    for (let i = 0; i < n; i++) { pos.x += vel.x * dt / n; pos.y += vel.y * dt / n; collide(pos, _a); }
    lastPush = _a.length();
    // slide: drop only the velocity (and its rate) that points into the wall
    if (lastPush > 0) {
        _a.normalize();
        const vn = vel.dot(_a); if (vn < 0) vel.addScaledVector(_a, -vn);
        const an = acc.dot(_a); if (an < 0) acc.addScaledVector(_a, -an);
    }
    // look springs: auto turns capped (YAW_MAX); drag look moves both pose and target
    look.pitchT = Math.max(PITCH_MIN, Math.min(PITCH_TOP, look.pitchT));
    const yT = look.yaw + wrap(look.yawT - look.yaw);
    [look.yaw, look.yawV] = smoothDamp(look.yaw, yT, look.yawV, YAW_TIME, slowTurn ? GUIDE_YAW_MAX : YAW_MAX, dt);
    look.yawT = look.yaw + wrap(look.yawT - look.yaw);
    [look.pitch, look.pitchV] = smoothDamp(look.pitch, look.pitchT, look.pitchV, PITCH_TIME, slowTurn ? GUIDE_YAW_MAX : PITCH_MAX, dt);
}

// Camera pose of the walker (world)
function walkPose(outPos, outQ) {
    roomToWorld(pos.x, G.eye, pos.y, outPos);
    _e.set(look.pitch, look.yaw, 0, 'YXZ');
    outQ.copy(apartment.quaternion).multiply(_q.setFromEuler(_e));
}

// ── Visuals: halos (lit when collected) and the walk target ring ──
function buildVisuals() {
    if (halos) return;
    halos = objectStops().map(stop => {
        const pal = ATTRACTORS[stop.paletteIdx ?? 0].palette, pts = stop.points2d;
        const posA = new Float32Array(pts.length * 3), colA = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => {
            planePointToWorld(_p, stop.center, stop.right, stop.up, 1, p);
            posA.set([_p.x, _p.y, _p.z], i * 3);
            const c = getPaletteColor(pal, i / (pts.length - 1));
            colA.set([c.r, c.g, c.b], i * 3);
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
            depthTest: false, depthWrite: false }));
        line.renderOrder = 20; line.visible = false; line.frustumCulled = false;
        scene.add(line);
        const room = worldToRoom(stop.center.clone());
        // line of sight ends short of the object by its halo radius (a wall board, its table)
        return { stop, line, vis: { x: 0, v: 0 }, room, end: LOS_END_M * M + stop.haloR / apartment.scale };
    });
    group = new THREE.Group();
    group.position.copy(apartment.position); group.quaternion.copy(apartment.quaternion); group.scale.setScalar(apartment.scale);
    marker = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.04, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }));
    marker.renderOrder = 20; marker.visible = false;
    group.add(marker);
    group.visible = false;
    scene.add(group);
}
function updateHalos(dt) {
    if (!halos) return;
    for (const h of halos) {
        // (a stop out of the tour: its ring only while its panel shows)
        const see = mode === 'walk' && (h.stop.tour || selected === h.stop) && seeLine(pos.x, pos.y, h.room.x, h.room.z, h.end) ? 1 : 0;
        [h.vis.x, h.vis.v] = smoothDamp(h.vis.x, see, h.vis.v, HALO_FADE, Infinity, Math.max(dt, 1e-4));
        h.line.material.opacity = h.vis.x;
        h.line.material.color.setScalar(collected.has(h.stop.id) ? HALO_LIT : HALO_HINT);
        h.line.visible = h.vis.x > 0.003;
    }
}

// ── UI ─────────────────────────────────────────────────────────────
function panel(p) { window.dispatchEvent(new CustomEvent('walk:panel', { detail: { panel: p } })); }
function updateHud() {
    if (!countEl) return;
    // "n / 4" on screen; screen readers get it in words (the halos are the only other sign)
    const n = tourStops().filter(s => collected.has(s.id)).length;
    const [shown, words] = countEl.children;
    if (shown) shown.textContent = `${n} / ${total()}`;
    if (words) words.textContent = `${n} of ${total()} objects collected`;
    syncBar();
}
// The bottom bar: [Collect] [Next object] [Skip the flat →]. Collect shows
// with a panel (any walk); the rest is the tour's. One primary (white):
// Collect until collected, else Next object; once all are found "Next object" goes and
// the text button "Skip the flat →" becomes the primary "Continue →".
function syncBar() {
    if (!tourEl) return;
    const collectOn = !!collectBtn && !collectBtn.hidden;
    tourEl.hidden = !(barTour || collectOn);
    if (taskEl) taskEl.hidden = !barTour;
    const all = allCollected();
    const collectFirst = collectOn && !collectBtn.disabled;
    if (collectBtn) collectBtn.classList.toggle('walk-primary', collectFirst);
    if (nextBtn) {
        nextBtn.hidden = !barTour || all;
        nextBtn.classList.toggle('walk-primary', !collectFirst);
    }
    if (skipBtn) {
        skipBtn.hidden = !barTour;
        skipBtn.textContent = all ? 'Continue →' : 'Skip the flat →';
        skipBtn.classList.toggle('walk-primary', all && !collectFirst);
        skipBtn.classList.toggle('walk-link', !(all && !collectFirst));
    }
}
function showTour(on) {
    barTour = on;
    syncBar();
    if (backBtn) backBtn.hidden = on;
    document.body.classList.toggle('walk-touring', on);
    if (!on) { hideHint(); if (arrowEl) arrowEl.hidden = true; }
}
function hideHint() {
    if (hintEl) hintEl.hidden = true;
}
// The hint ("tap to skip · drag to look") shows only while a guided walk of
// the tour runs (not yet skipped): never over a panel, never when idle
function syncHint() {
    if (!hintEl) return;
    const want = tour && mode === 'walk' && !!guide && !!path && jumpT < 0;
    if (hintEl.hidden === want) hintEl.hidden = !want;
}
// The skip: a tap (or Enter) during a guided walk speeds it up
function skipGuide() {
    if (!guide || !path || jumpT >= 0) return false;
    jumpT = 0;
    syncHint();
    return true;
}
// Per frame while a skip runs: the fade; at full black the walker is at the goal
function updateJump(dt) {
    if (jumpT < 0) return;
    const was = jumpT;
    jumpT += dt;
    if (was < JUMP_FADE && jumpT >= JUMP_FADE && guide && path) {
        const g = path.at(-1), st = guide;
        pos.set(g[0], g[1]); vel.set(0, 0); acc.set(0, 0);
        endPath(); guide = null; slowTurn = false;
        const a = aimAt(st.walkLook ?? st.center);
        look.yaw = look.yawT = a.yaw; look.pitch = look.pitchT = a.pitch; look.yawV = look.pitchV = 0;
        select(st, false);
    }
    const T = 2 * JUMP_FADE + JUMP_HOLD;
    const o = jumpT < JUMP_FADE ? jumpT / JUMP_FADE : jumpT < JUMP_FADE + JUMP_HOLD ? 1 : Math.max(0, (T - jumpT) / JUMP_FADE);
    if (jumpT >= T) endJump();
    else if (fadeEl) { fadeEl.hidden = false; fadeEl.style.opacity = smoother(o).toFixed(3); }
}
function endJump() {
    jumpT = -1;
    if (fadeEl) { fadeEl.hidden = true; fadeEl.style.opacity = '0'; }
}
function showCollect(stop) {
    if (!collectBtn) return;
    collectBtn.hidden = !stop?.tour;           // (no Collect out of the tour)
    if (stop) {
        const have = collected.has(stop.id);
        collectBtn.disabled = have;
        collectBtn.textContent = have ? 'Collected' : 'Collect';
    }
    syncBar();
}
function select(stop, turn = true) {
    selected = stop;
    if (!stop) { panel(null); showCollect(null); return; }
    panel(stop.panel);
    showCollect(stop);
    if (turn) turnTo(stop.walkLook ?? stop.center);
}
function allFound() {
    selected = null;
    showCollect(null);
    panel({
        title: `You found all ${['', 'one', 'two', 'three', 'four', 'five', 'six'][total()] ?? total()}`,
        subtitle: 'Every R&D object in the flat is lit.',
        items: [{ text: 'The full story of each one is in the resume.' }],
        more: { href: 'resume.html', label: 'read the resume' }
    });
}
function collect() {
    if (!selected?.tour || collected.has(selected.id)) return;
    collected.add(selected.id);
    save();
    window.dispatchEvent(new CustomEvent('walk:collect'));   // music.js: a chime
    updateHud();
    if (allCollected()) allFound();
    else showCollect(selected);
}

// The look (yaw, pitch) that puts the world point beside the panel
function aimAt(world) {
    const r = worldToRoom(_v.copy(world));
    const dx = r.x - pos.x, dy = r.y - G.eye, dz = r.z - pos.y;
    let yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const t = Math.tan(FOV * DEG / 2);
    if (window.matchMedia('(min-width: 700px) and (orientation: landscape)').matches) yaw -= Math.atan(PANEL_SHIFT[0] * t * camera.aspect);
    else pitch -= Math.atan(PANEL_SHIFT[1] * t);
    return { yaw, pitch: Math.max(PITCH_MIN, Math.min(PITCH_TOP, pitch)) };
}
// Turn (capped auto turn) so the world point sits beside the panel
function turnTo(world) {
    const { yaw, pitch } = aimAt(world);
    endPath(); autoYaw = false;
    look.yawT = look.yaw + wrap(yaw - look.yaw);
    look.pitchT = pitch;
}

function setExploreButtons(stop) {
    const rnd = stop?.universe === 'rnd', landing = stop?.type === StopType.LANDING;
    if (panelBtn) panelBtn.hidden = !rnd;
    if (floatBtn) floatBtn.hidden = !landing;
    if (rnd || landing) loadGrid().catch(() => {});   // so the walk starts at once
}

window.addEventListener('journey:stop', e => {
    const d = e.detail || {};
    if (mode !== 'off') return;
    setExploreButtons(d.phase === 'enter' ? { universe: d.universe, type: d.type } : null);
});
// the grid is small: fetch it with the intro, so the walk starts at once
window.addEventListener('journey:intro', e => { if (e.detail?.phase === 'enter') loadGrid().catch(() => {}); });
exploreBtns.forEach(b => b.addEventListener('click', () => enterExplore()));
backBtn?.addEventListener('click', () => exitExplore());
collectBtn?.addEventListener('click', collect);
nextBtn?.addEventListener('click', () => next());
skipBtn?.addEventListener('click', () => skipFlat());

// ── API (explore.js) ───────────────────────────────────────────────
// Is walking possible here (an apartment stop or the landing)?
function canWalk(stop) { return stop?.universe === 'rnd' || stop?.type === StopType.LANDING; }

// Start walking from the current camera pose. opts.immediate: no ease;
// opts.tour: the tour HUD; opts.at: start at that object, facing it, its panel open;
// opts.next: walk to the first object at once (no press: the walk from the intro).
function enterWalk(opts = {}) {
    immediate = !!opts.immediate;
    autoNext = !!opts.next;
    mode = 'wait';
    setExploreButtons(null);
    selected = null; panel(null); showCollect(null);
    guide = null; slowTurn = false; arrowWay = null; arrowT = 0;
    tour = !!opts.tour;
    if (hudEl) hudEl.hidden = false;
    showTour(tour);
    hideHint();
    updateHud();
    fromPos.copy(camera.position); fromQ.copy(camera.quaternion); fromFov = camera.fov;
    loadGrid().then(() => {
        if (mode !== 'wait') return;
        buildVisuals();
        // start on the nearest free cell under the camera, facing its way
        const r = worldToRoom(_v.copy(camera.position));
        let n = null;
        for (let R = 0.5; !n && R < 8; R *= 2) n = nearestFree(r.x, r.z, R * M, GOAL_CLEAR);
        pos.set(x0 + (n[0] + 0.5) * cell, z0 + (n[1] + 0.5) * cell);
        vel.set(0, 0); acc.set(0, 0); endPath();
        _v.set(0, 0, -1).applyQuaternion(camera.quaternion).applyQuaternion(_q.copy(apartment.quaternion).invert());
        look.yaw = look.yawT = Math.atan2(-_v.x, -_v.z);
        look.pitch = look.pitchT = Math.max(PITCH_MIN, Math.min(tour ? ENTER_PITCH : PITCH_TOP, Math.asin(THREE.MathUtils.clamp(_v.y, -1, 1))));
        look.yawV = look.pitchV = 0;
        const h = opts.at && halos.find(x => x.stop === opts.at);
        const g = h && objectGoal(h);
        if (g) {
            // at the object: on its view side, facing it, its panel open
            pos.set(x0 + (g[0] + 0.5) * cell, z0 + (g[1] + 0.5) * cell);
            const a = aimAt(h.stop.walkLook ?? h.stop.center);
            look.yaw = look.yawT = a.yaw; look.pitch = look.pitchT = a.pitch;
            selected = h.stop; panel(h.stop.panel); showCollect(h.stop);
        }
        group.visible = true;
        startEase('in', fromPos.distanceTo(roomToWorld(pos.x, G.eye, pos.y, _p)), 0);
    }).catch(() => { mode = 'off'; if (hudEl) hudEl.hidden = true; showTour(false); exitExplore(); });
}

// Leave walk mode where the camera is (the journey flies on from here)
function leaveInPlace() {
    autoNext = false;
    selected = null; panel(null); showCollect(null);
    if (hudEl) hudEl.hidden = true;
    showTour(false);
    endPath(); guide = null; slowTurn = false;
    finish();
}

// Ease back to the journey VIEW pose; done() runs when it is reached
// (instant: at the next update)
function exitWalk(viewPos, viewTarget, viewFov, done, instant = false) {
    autoNext = false;
    endJump();
    selected = null; panel(null); showCollect(null);
    if (hudEl) hudEl.hidden = true;
    showTour(false);
    endPath(); guide = null; slowTurn = false;
    fromPos.copy(camera.position); fromQ.copy(camera.quaternion); fromFov = camera.fov;
    toPos.copy(viewPos);
    toQ.setFromRotationMatrix(_m.lookAt(viewPos, viewTarget, camera.up));
    toFov = viewFov;
    onDone = done;
    // no line of sight (another room): rise over the cut ceiling on the way
    let lift = 0;
    if (G && mode === 'walk') {
        const r = worldToRoom(_v.copy(viewPos));
        if (!seeLine(pos.x, pos.y, r.x, r.z, 0)) lift = (ROOM_CEIL + LIFT_ABOVE - G.eye) * apartment.scale;
    }
    if (instant || mode === 'wait' || !G) immediate = true;
    startEase('out', fromPos.distanceTo(toPos), lift);
}

function startEase(kind, dist, lift) {
    mode = kind;
    ease.t = 0; ease.lift = lift;
    ease.T = immediate ? 0 : THREE.MathUtils.clamp(EASE_MIN + EASE_PER_M * dist / (apartment.scale * M), EASE_MIN, EASE_MAX);
    immediate = false;
}

function finish() {
    mode = 'off';
    endJump();
    if (group) group.visible = false;
    if (halos) for (const h of halos) { h.line.visible = false; h.vis.x = h.vis.v = 0; }
    const cb = onDone; onDone = null;
    cb?.();
}

// Per frame (Phase.EXPLORE). Sets the camera pose.
function update(dt) {
    if (mode === 'off' || mode === 'wait') return;
    if (mode === 'walk') {
        arrived = false;
        if (dt > 0) step(dt);
        if (arrived) onArrive();
        updateJump(dt);
        updateRooms();
        walkPose(camera.position, camera.quaternion);
        if (camera.fov !== FOV) { camera.fov = FOV; camera.updateProjectionMatrix(); }
        if (tour) updateTour(dt);
    } else {
        ease.t += dt;
        const w = ease.T > 0 ? smoother(Math.min(1, ease.t / ease.T)) : 1;
        if (mode === 'in') { walkPose(toPos, toQ); toFov = FOV; }
        camera.position.lerpVectors(fromPos, toPos, w);
        if (ease.lift) camera.position.addScaledVector(camera.up, ease.lift * Math.sin(Math.PI * w));
        camera.quaternion.slerpQuaternions(fromQ, toQ, w);
        camera.fov = fromFov + (toFov - fromFov) * w; camera.updateProjectionMatrix();
        if (w >= 1) {
            if (mode === 'in') {
                mode = 'walk';
                if (autoNext) { autoNext = false; next(); }
            }
            else { updateHalos(dt); finish(); return; }
        }
    }
    updateHalos(dt);
}

// The tour HUD per frame: the hint times out; the edge arrow points to the
// next object not collected yet while it is off screen or out of sight
// (to the next corner of the way there when a wall is in between)
const _c3 = new THREE.Vector3();
function updateTour(dt) {
    syncHint();
    if (!arrowEl) return;
    arrowT -= dt;
    if (arrowT <= 0) {
        const way = nextWay(null, true);
        if (way !== undefined) { arrowT = ARROW_EVERY; arrowWay = way; }
    }
    const st = arrowWay?.stop;
    const h = st && halos.find(x => x.stop === st);
    let show = !!h && selected !== st;
    if (show) {
        const sees = seeLine(pos.x, pos.y, h.room.x, h.room.z, h.end);
        camera.updateMatrixWorld();
        const ahead = _c3.copy(st.center).applyMatrix4(camera.matrixWorldInverse).z < 0;
        _c3.copy(st.center).project(camera);
        show = !(sees && ahead && Math.abs(_c3.x) < 0.95 && Math.abs(_c3.y) < 0.95);
        if (show) {
            // the target: the object, or the next corner of the way when a wall is in between
            let tgt = st.center;
            if (!sees) {
                const sm = smooth([[pos.x, pos.y], ...arrowWay.raw.slice(1)]);
                const c = sm[Math.min(1, sm.length - 1)];
                tgt = roomToWorld(c[0], G.eye, c[1], _p);
            }
            const behind = _c3.copy(tgt).applyMatrix4(camera.matrixWorldInverse).z > 0;
            _c3.copy(tgt).project(camera);
            let x = behind ? -_c3.x : _c3.x, y = behind ? -_c3.y : _c3.y;
            const L = Math.max(Math.abs(x), Math.abs(y), 1e-6);
            if (behind || L > ARROW_INSET) { x = x / L * ARROW_INSET; y = y / L * ARROW_INSET; }
            const ang = Math.atan2(-y * window.innerHeight, x * window.innerWidth);
            arrowEl.style.left = `${(x + 1) / 2 * 100}%`;
            arrowEl.style.top = `${(1 - y) / 2 * 100}%`;
            arrowEl.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
        }
    }
    if (arrowEl.hidden === show) arrowEl.hidden = !show;   // (no DOM write while it stays)
}

// ── Input (main.js) ────────────────────────────────────────────────
// A tap: an object in sight (hit sphere) shows its panel and turns to it;
// the floor walks there (A*, smoothed); anything else does nothing.
export function onTap(px, py) {
    if (mode !== 'walk') return { ok: false, why: 'not walking' };
    _ndc.set(px / window.innerWidth * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    camera.updateMatrixWorld();
    ray.setFromCamera(_ndc, camera);
    let best = null, bestD = Infinity;
    for (const h of halos) {
        const st = h.stop;
        if (st.roomBox) continue;           // a room opens by walking in
        _sphere.set(st.center, Math.max(st.haloR, st.halfH) * HIT_SCALE);
        if (!ray.ray.intersectSphere(_sphere, _p)) continue;
        const d = _p.distanceTo(ray.ray.origin);
        if (d < bestD && seeLine(pos.x, pos.y, h.room.x, h.room.z, h.end)) { best = st; bestD = d; }
    }
    if (best) { guide = null; slowTurn = false; select(best); return { ok: true, object: best.id }; }
    // a guided walk: a tap on the floor skips (the walk speeds up), it does not turn off the way
    if (skipGuide()) return { ok: true, skip: true };
    // floor plane, in room units
    const o = worldToRoom(_v.copy(ray.ray.origin)), o2 = worldToRoom(_p.copy(ray.ray.origin).add(ray.ray.direction));
    const dy = o2.y - o.y;
    if (dy >= -1e-6) return { ok: false, why: 'sky' };
    const t = (G.floor - o.y) / dy;
    if (selected) select(null);
    return setPath(o.x + (o2.x - o.x) * t, o.z + (o2.z - o.z) * t);
}

// A drag in pixels: direct look (no speed cap), drag the world
export function onDrag(dx, dy) {
    if (mode !== 'walk') return;
    autoYaw = false;
    look.yaw += dx * LOOK_RAD_PER_PX; look.yawT = look.yaw; look.yawV = 0;
    look.pitch = Math.max(PITCH_MIN, Math.min(PITCH_TOP, look.pitch + dy * LOOK_RAD_PER_PX));
    look.pitchT = look.pitch; look.pitchV = 0;
}

// The keys held down (lower case): WASD / arrows walk, Q/E and left/right turn
export function setKeys(set) { keys = set; }
// Enter (not on a link or button): "Next object" in the tour
// (during a guided walk: the skip)
export function onEnter() {
    if (mode !== 'walk' || skipGuide()) return;
    if (tour && nextBtn && !nextBtn.hidden) next();
}

// Phones: a lower pixel ratio ceiling while walking (explore.js events)
if (isMobile) window.addEventListener('journey:explore', e => setPixelRatioCap(e.detail?.phase === 'enter' ? WALK_PIXEL_RATIO : null));

registerWalker({ canWalk, enterWalk, exitWalk, leaveInPlace, update, next, guideTo, allCollected, get touring() { return tour && mode !== 'off'; } });

// ── Dev (checks and screenshots): window.__walk ────────────────────
window.__walk = {
    get state() {
        return { mode, x: pos.x, z: pos.y, yaw: look.yaw / DEG, pitch: look.pitch / DEG, v: vel.length() / M,
                 walking: !!path, selected: selected?.id ?? null, collected: [...collected], total: total() };
    },
    setPose(x, z, yawDeg, pitchDeg = 0) {
        pos.set(x, z); collide(pos); vel.set(0, 0); acc.set(0, 0); endPath();
        if (selected) select(null);
        look.yaw = look.yawT = yawDeg * DEG; look.pitch = look.pitchT = pitchDeg * DEG; look.yawV = look.pitchV = 0;
        if (mode === 'walk') walkPose(camera.position, camera.quaternion);
    },
    walkTo(x, z) { return setPath(x, z); },
    next, skip: skipGuide,
    get guide() { return guide?.id ?? null; },
    cellInfo(x, z) { const ix = cx(x), iz = cz(z); return { free: free(ix, iz), clear: clearAt(ix, iz), CL_MIN, path: path?.map(p => p.map(v => +v.toFixed(3))) }; },
    // run the walker offline with a fixed dt (no frames needed)
    simulate(seconds, dt = 1 / 60) {
        let contacts = 0, maxYawRate = 0, maxAcc = 0, pv = vel.length(), py = look.yaw, t = 0;
        for (; t < seconds; t += dt) {
            update(dt);
            const v = vel.length(); maxAcc = Math.max(maxAcc, Math.abs(v - pv) / dt / M); pv = v;
            maxYawRate = Math.max(maxYawRate, Math.abs(wrap(look.yaw - py)) / dt / DEG); py = look.yaw;
            if (lastPush > 0) contacts++;
            const settled = Math.abs(wrap(look.yawT - look.yaw)) < 1e-3 && Math.abs(look.pitchT - look.pitch) < 1e-3;
            if (mode === 'walk' && !path && !guide && v < 1e-4 && !keys.size && settled) break;
        }
        return { arrived: !path, t, x: pos.x, z: pos.y, maxYawRate, maxAcc_ms2: maxAcc, contacts };
    },
    // screen position of an object (for tap checks), or null when off screen
    screenOf(id) {
        const st = stops.find(s => s.id === id);
        if (!st) return null;
        camera.updateMatrixWorld();
        _p.copy(st.center).project(camera);
        if (_p.z > 1 || Math.abs(_p.x) > 1 || Math.abs(_p.y) > 1) return null;
        return [(_p.x + 1) / 2 * window.innerWidth, (1 - _p.y) / 2 * window.innerHeight];
    },
    lookAt(id) { const st = stops.find(s => s.id === id); if (st) turnTo(st.center); },
    onTap, onDrag, collect,
    sees(id) { const h = halos?.find(h => h.stop.id === id); return h ? seeLine(pos.x, pos.y, h.room.x, h.room.z, h.end) : null; },
};
