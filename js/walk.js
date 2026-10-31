// ── Walk mode ──────────────────────────────────────────────────────
// Walk through the apartment at eye height and collect the six R&D
// objects. The orchestrator switches to Phase.EXPLORE and calls
// enterWalk / update / exitWalk; main.js routes input here (onTap, onDrag,
// setKeys). This module owns the camera pose while walking (no camera.js
// changes) and its own DOM: the "Explore the flat" buttons, the HUD (back
// button and "n / 6") and the Collect button. Panel text goes through the
// 'walk:panel' event to stopPanel.js.
//
// Walk grid: assets/room/walk.json (make_walk_grid.py, lazily loaded), a
// 2D occupancy grid in room units (the .sog frame: +Y up, 1 unit = 3.63 m).
// It is the configuration space: the 0.2 m body radius is baked in, so the
// walker collides as a thin skin (COLLIDE_R) and slides along the walls.
// `sight` marks cells that hide what is behind them at eye height (walls):
// object halos and taps need a clear line of sight.

import * as THREE from 'three';
import { scene, camera, ATTRACTORS, getPaletteColor } from './attractors.js';
import { stops, StopType, planePointToWorld } from './world.js';
import { apartment, roomToWorld, worldToRoom } from './room.js';
import { registerWalker, enterExplore, exitExplore } from './explore.js';

const DEG = Math.PI / 180;

// ── Tuning ─────────────────────────────────────────────────────────
const GRID_URL = 'assets/room/walk.json';
const SPEED_M = 1.2;                   // m/s walk speed
const ACCEL_TIME = 0.25;               // s: velocity spring (eased start and stop)
const COLLIDE_M = 0.02;                // m: collision skin (the body radius is baked into the grid)
const YAW_TIME = 0.18, YAW_MAX = 120 * DEG;      // auto turns: smooth time, speed cap (drag look is direct)
const PITCH_TIME = 0.12, PITCH_MAX = 120 * DEG;
const PITCH_MIN = -60 * DEG, PITCH_TOP = 15 * DEG; // the ceiling is a black void above ~2.2 m
const LOOK_RAD_PER_PX = 0.0045;        // drag look sensitivity (drag the world)
const KEY_TURN = 100 * DEG;            // rad/s: arrow keys turn
const LOOKAHEAD_M = 0.45;              // path following: carrot distance
const ARRIVE_M = 0.5;                  // slow down within this of the goal
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

// ── DOM ────────────────────────────────────────────────────────────
const exploreBtns = [...document.querySelectorAll('.walk-explore')];
const floatBtn = document.querySelector('.walk-explore-float');
const panelBtn = document.querySelector('.stop-panel .walk-explore');
const collectBtn = document.querySelector('.walk-collect');
const hudEl = document.querySelector('.walk-hud');
const countEl = document.querySelector('.walk-count');
const backBtn = document.querySelector('.walk-back');

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
let path = null, pathLen = 0, pathS = 0, autoYaw = false, stuckT = 0, stuckS = 0;
let keys = new Set();
let selected = null;                   // the object stop whose panel shows
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
const total = () => objectStops().length;

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

// A* (8-connected, no corner cutting, octile heuristic, binary heap)
function astar(sx, sz, gx, gz) {
    const N = nx * nz, gS = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N), heap = [];
    const h = (ix, iz) => { const dx = Math.abs(ix - gx), dz = Math.abs(iz - gz); return Math.max(dx, dz) + 0.41421356 * Math.min(dx, dz); };
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
            heap[0] = last; let k = 0;
            for (;;) {
                const l = 2 * k + 1, r = l + 1; let m = k;
                if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                if (m === k) break;
                [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
            }
        }
        return top;
    };
    const s = sz * nx + sx, goal = gz * nx + gx;
    gS[s] = 0; push(h(sx, sz), s);
    while (heap.length) {
        const [, i] = pop();
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
    if (from[goal] < 0 && goal !== s) return null;
    const out = [];
    for (let i = goal; i >= 0; i = from[i]) { const ix = i % nx; out.push([x0 + (ix + 0.5) * cell, z0 + ((i - ix) / nx + 0.5) * cell]); if (i === s) break; }
    return out.reverse();
}

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
    raw[0] = [pos.x, pos.y];
    path = smooth(raw);
    pathLen = 0; for (let i = 1; i < path.length; i++) pathLen += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    pathS = 0; stuckT = 0; stuckS = 0; autoYaw = true;
    if (marker) { marker.position.set(path.at(-1)[0], G.floor + 0.003, path.at(-1)[1]); marker.visible = true; }
    return { ok: true, nodes: raw.length, smoothNodes: path.length, len_m: +(pathLen / M).toFixed(2) };
}
function endPath() { path = null; if (marker) marker.visible = false; }
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
function step(dt) {
    _w.set(0, 0);
    const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const r = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const turn = (keys.has('arrowleft') || keys.has('q') ? 1 : 0) - (keys.has('arrowright') || keys.has('e') ? 1 : 0);
    if (turn) { look.yaw += turn * KEY_TURN * dt; look.yawT = look.yaw; look.yawV = 0; autoYaw = false; }
    if (f || r) {
        endPath();
        const sy = Math.sin(look.yaw), cy = Math.cos(look.yaw);
        _w.set(-sy * f + cy * r, -cy * f - sy * r).normalize().multiplyScalar(SPEED);
    } else if (path) {
        pathS = Math.max(pathS, projectS());
        const left = pathLen - pathS;
        // carrot: LOOKAHEAD along the path, pulled in until it is in sight
        // (a carrot behind a corner pushes straight into the wall: no slide)
        let la = LOOKAHEAD, c = pathPoint(Math.min(pathLen, pathS + la));
        while (la > cell && !clearLine(pos.x, pos.y, c[0], c[1], 0)) { la *= 0.6; c = pathPoint(Math.min(pathLen, pathS + la)); }
        _w.set(c[0] - pos.x, c[1] - pos.y);
        const d = _w.length();
        const sp = SPEED * Math.min(1, Math.sqrt(Math.max(left, 0) / ARRIVE_R));   // eased arrival
        if (d > 1e-6) _w.multiplyScalar(sp / d);
        if (left < 0.03 * M && Math.hypot(path.at(-1)[0] - pos.x, path.at(-1)[1] - pos.y) < 0.05 * M) endPath();
        // stuck guard: no progress for 1.5 s cancels the walk
        stuckT += dt;
        if (path && stuckT > 1.5) { if (pathS - stuckS < 0.02 * M) endPath(); stuckT = 0; stuckS = pathS; }
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
    [look.yaw, look.yawV] = smoothDamp(look.yaw, yT, look.yawV, YAW_TIME, YAW_MAX, dt);
    look.yawT = look.yaw + wrap(look.yawT - look.yaw);
    [look.pitch, look.pitchV] = smoothDamp(look.pitch, look.pitchT, look.pitchV, PITCH_TIME, PITCH_MAX, dt);
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
        const see = mode === 'walk' && seeLine(pos.x, pos.y, h.room.x, h.room.z, h.end) ? 1 : 0;
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
    // "n / 6" on screen; screen readers get it in words (the halos are the only other sign)
    const n = objectStops().filter(s => collected.has(s.id)).length;
    const [shown, words] = countEl.children;
    if (shown) shown.textContent = `${n} / ${total()}`;
    if (words) words.textContent = `${n} of ${total()} objects collected`;
}
function showCollect(stop) {
    if (!collectBtn) return;
    collectBtn.hidden = !stop;
    if (!stop) return;
    const have = collected.has(stop.id);
    collectBtn.disabled = have;
    collectBtn.textContent = have ? 'Collected' : 'Collect';
}
function select(stop) {
    selected = stop;
    if (!stop) { panel(null); showCollect(null); return; }
    panel(stop.panel);
    showCollect(stop);
    turnTo(stop.center);
}
function allFound() {
    selected = null;
    showCollect(null);
    panel({
        title: `You found all ${total() === 6 ? 'six' : total()}`,
        subtitle: 'Every R&D object in the flat is lit.',
        items: [{ text: 'The full story of each one is in the resume.' }],
        more: { href: 'resume.html', label: 'read the resume' }
    });
}
function collect() {
    if (!selected || collected.has(selected.id)) return;
    collected.add(selected.id);
    save();
    updateHud();
    if (objectStops().every(s => collected.has(s.id))) allFound();
    else showCollect(selected);
}

// Turn (capped auto turn) so the world point sits beside the panel
function turnTo(world) {
    const r = worldToRoom(_v.copy(world));
    const dx = r.x - pos.x, dy = r.y - G.eye, dz = r.z - pos.y;
    let yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const t = Math.tan(camera.fov * DEG / 2);
    if (window.matchMedia('(min-width: 700px) and (orientation: landscape)').matches) yaw -= Math.atan(PANEL_SHIFT[0] * t * camera.aspect);
    else pitch -= Math.atan(PANEL_SHIFT[1] * t);
    endPath(); autoYaw = false;
    look.yawT = look.yaw + wrap(yaw - look.yaw);
    look.pitchT = Math.max(PITCH_MIN, Math.min(PITCH_TOP, pitch));
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
exploreBtns.forEach(b => b.addEventListener('click', () => enterExplore()));
backBtn?.addEventListener('click', () => exitExplore());
collectBtn?.addEventListener('click', collect);

// ── API (explore.js) ───────────────────────────────────────────────
// Is walking possible here (an apartment stop or the landing)?
function canWalk(stop) { return stop?.universe === 'rnd' || stop?.type === StopType.LANDING; }

// Start walking from the current camera pose. opts.immediate: no ease (dev).
function enterWalk(opts = {}) {
    immediate = !!opts.immediate;
    mode = 'wait';
    setExploreButtons(null);
    selected = null; panel(null); showCollect(null);
    if (hudEl) hudEl.hidden = false;
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
        look.pitch = look.pitchT = Math.max(PITCH_MIN, Math.min(PITCH_TOP, Math.asin(THREE.MathUtils.clamp(_v.y, -1, 1))));
        look.yawV = look.pitchV = 0;
        group.visible = true;
        startEase('in', fromPos.distanceTo(roomToWorld(pos.x, G.eye, pos.y, _p)), 0);
    }).catch(() => { mode = 'off'; if (hudEl) hudEl.hidden = true; exitExplore(); });
}

// Ease back to the journey VIEW pose; done() runs when it is reached
// (instant: at the next update)
function exitWalk(viewPos, viewTarget, viewFov, done, instant = false) {
    selected = null; panel(null); showCollect(null);
    if (hudEl) hudEl.hidden = true;
    endPath();
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
    if (group) group.visible = false;
    if (halos) for (const h of halos) { h.line.visible = false; h.vis.x = h.vis.v = 0; }
    const cb = onDone; onDone = null;
    cb?.();
}

// Per frame (Phase.EXPLORE). Sets the camera pose.
function update(dt) {
    if (mode === 'off' || mode === 'wait') return;
    if (mode === 'walk') {
        if (dt > 0) step(dt);
        walkPose(camera.position, camera.quaternion);
        if (camera.fov !== FOV) { camera.fov = FOV; camera.updateProjectionMatrix(); }
    } else {
        ease.t += dt;
        const w = ease.T > 0 ? smoother(Math.min(1, ease.t / ease.T)) : 1;
        if (mode === 'in') { walkPose(toPos, toQ); toFov = FOV; }
        camera.position.lerpVectors(fromPos, toPos, w);
        if (ease.lift) camera.position.addScaledVector(camera.up, ease.lift * Math.sin(Math.PI * w));
        camera.quaternion.slerpQuaternions(fromQ, toQ, w);
        camera.fov = fromFov + (toFov - fromFov) * w; camera.updateProjectionMatrix();
        if (w >= 1) {
            if (mode === 'in') mode = 'walk';
            else { updateHalos(dt); finish(); return; }
        }
    }
    updateHalos(dt);
}

export function isWalking() { return mode !== 'off'; }

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
        _sphere.set(st.center, Math.max(st.haloR, st.halfH) * HIT_SCALE);
        if (!ray.ray.intersectSphere(_sphere, _p)) continue;
        const d = _p.distanceTo(ray.ray.origin);
        if (d < bestD && seeLine(pos.x, pos.y, h.room.x, h.room.z, h.end)) { best = st; bestD = d; }
    }
    if (best) { select(best); return { ok: true, object: best.id }; }
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

registerWalker({ canWalk, enterWalk, exitWalk, update });

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
    // run the walker offline with a fixed dt (no frames needed)
    simulate(seconds, dt = 1 / 60) {
        let contacts = 0, maxYawRate = 0, maxAcc = 0, pv = vel.length(), py = look.yaw, t = 0;
        for (; t < seconds; t += dt) {
            update(dt);
            const v = vel.length(); maxAcc = Math.max(maxAcc, Math.abs(v - pv) / dt / M); pv = v;
            maxYawRate = Math.max(maxYawRate, Math.abs(wrap(look.yaw - py)) / dt / DEG); py = look.yaw;
            if (lastPush > 0) contacts++;
            const settled = Math.abs(wrap(look.yawT - look.yaw)) < 1e-3 && Math.abs(look.pitchT - look.pitch) < 1e-3;
            if (mode === 'walk' && !path && v < 1e-4 && !keys.size && settled) break;
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
