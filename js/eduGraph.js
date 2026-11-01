// ── The timeline graph (StopType.GRAPH): education and work, four frames ──
// Design: brain/reports/portfolio-site/edu-timeline-spec.md (prototype v3,
// branch edu-graph-proto, dev/edu-graph.html there). A horizontal timeline
// that grows to the right. Column 0 holds the three trait words, columns
// 1-4 school, AI Talent Program, university, Giraffe360. A time axis runs
// along the bottom. Frame k reveals column k: the comet (the journey's own
// trail, driven by the orchestrator) draws the axis to tick k, then sweeps
// up the column; each new node lights up as the comet passes it, its edge
// grows in from the parent just before. Earlier columns stay dim ("past").
// The shaders play each frame's timeline (aStart / aDur per vertex), so the
// whole frame is one draw per copy; frames cross-fade (COPY_FADE).
// world.js builds it (createGraph, fitGraph) and places `group`; it does
// not touch the DOM or the camera.

import * as THREE from 'three';
import { generateTextLines } from './strokeFont.js';

// ── Content table (edit here) ──────────────────────────────────────
// col: 0 traits, 1 school, 2 AI Talent, 3 university, 4 Giraffe360 (work). y: lane (graph units).
// parents: edges, always from an earlier column. caption: small lines
// under the node, '/' starts a new line. Font: A-Z, 0-9, '. , · - @'.
const NODES = [
    { id: 'curious',      label: 'CURIOUS',        col: 0, y: 1.0,  dom: 'core' },
    { id: 'creative',     label: 'CREATIVE',       col: 0, y: -0.6, dom: 'core' },
    { id: 'adaptive',     label: 'ADAPTIVE',       col: 0, y: -2.3, dom: 'core' },
    { id: 'geometry',     label: 'GEOMETRY',       col: 1, y: 1.4,  parents: ['curious'],     dom: 'math' },
    { id: 'math',         label: 'MATH',           col: 1, y: 1.0,  parents: ['curious'],     dom: 'math' },
    { id: 'algebra',      label: 'ALGEBRA',        col: 1, y: 0.6,  parents: ['curious'],     dom: 'math' },
    { id: 'programming',  label: 'PROGRAMMING',    col: 1, y: -0.6, parents: ['creative'],    dom: 'code' },
    { id: 'english',      label: 'ENGLISH',        col: 1, y: -2.1, parents: ['adaptive'],    dom: 'people' },
    { id: 'teamwork',     label: 'TEAMWORK',       col: 1, y: -2.5, parents: ['adaptive'],    dom: 'people' },
    { id: 'calculus',     label: 'CALCULUS',       col: 2, y: 1.4,  parents: ['math'],        dom: 'math' },
    { id: 'ai-math',      label: 'AI MATH',        col: 2, y: 1.0,  parents: ['math'],        dom: 'math' },
    { id: 'ai-models',    label: 'AI MODELS',      col: 2, y: -1.4, parents: ['programming'], dom: 'code',
      caption: 'CNN · TRANSFORMERS · GAN / VAE · RL · VISION · AI HISTORY' },
    { id: 'project-work', label: 'PROJECT WORK',   col: 2, y: -2.5, parents: ['teamwork'],    dom: 'people',
      caption: 'GIT BRANCHES · GITHUB' },
    { id: 'statistics',   label: 'STATISTICS',     col: 3, y: 0.6,  parents: ['math'],        dom: 'math' },
    { id: 'fin-math',     label: 'FINANCIAL MATH', col: 3, y: 0.2,  parents: ['algebra'],     dom: 'math' },
    { id: 'networks',     label: 'NETWORKS',       col: 3, y: -0.2, parents: ['programming'], dom: 'code',
      caption: 'LOAD BALANCERS / TCP · HTTPS' },
    { id: 'algorithms',   label: 'ALGORITHMS',     col: 3, y: -1.0, parents: ['programming'], dom: 'code',
      caption: 'GRAPHS · TSP · BINARY TREES' },
    // Giraffe360 (work) — a PROPOSAL from the user's list, to confirm.
    // 3DGS and DEPTH join AI MODELS with upper nodes, so their AI MODELS
    // edges must cross the column-3 lanes; every other edge is crossing-free.
    { id: '3dgs',         label: '3DGS',           col: 4, y: 1.6,  parents: ['calculus', 'ai-models'],     dom: 'code',
      caption: 'GAUSSIAN SPLATTING' },
    { id: 'depth',        label: 'DEPTH',          col: 4, y: 1.0,  parents: ['ai-models', 'statistics'],   dom: 'code',
      caption: 'DEPTH · RECONSTRUCTION' },
    { id: 'aws',          label: 'AWS',            col: 4, y: 0.2,  parents: ['networks'],                  dom: 'code',
      caption: 'S3 · CLOUD WORKERS' },
    { id: 'docker',       label: 'DOCKER',         col: 4, y: -0.5, parents: ['networks'],                  dom: 'code' },
    { id: 'gpu-code',     label: 'GPU CODE',       col: 4, y: -1.0, parents: ['algorithms', 'programming'], dom: 'code',
      caption: 'PYTORCH · CUDA' },
    { id: 'mentoring',    label: 'MENTORING',      col: 4, y: -2.2, parents: ['english', 'project-work'],   dom: 'people' },
    { id: 'gitlab-ci',    label: 'GITLAB CI',      col: 4, y: -2.55, parents: ['project-work'],             dom: 'code',
      caption: 'TESTS · PIPELINES' },
];
const NFRAMES = 4;
// Axis label under ticks 1-3 (tick 0 has none)
const AXIS_LABELS = [null, 'RIGA STATE / CLASSICAL GYMNASIUM', 'AI TALENT PROGRAM', 'RIGA TECHNICAL / UNIVERSITY', 'GIRAFFE360'];

// ── Tuning ─────────────────────────────────────────────────────────
const COL_DX = 2.2;
const AXIS_Y = -3.0, AXIS_X0 = -0.25, AXIS_TAIL = 0.5, TICK_H = 0.12;
const PEN_Z = 0.05;
const PT = 0.045, PT_CORE = 0.05, PT_INT = 1.4;
const CAP_WORD = 0.17, CAP_LABEL = 0.15, CAP_CAPTION = 0.10, CAP_CAPTION_PHONE = 0.12, CAP_AXIS = 0.11;
const LABEL_GAP = 0.06 + 0.02;           // point → label bottom (gap 0.06 + the point's glow core)
const CAPTION_DROP = 0.16;               // point → first caption line top
const AXIS_LABEL_DROP = 0.12;            // axis → axis label top
const LABEL_INT = 1.1, CAPTION_INT = 0.8, AXIS_LABEL_INT = 0.7, AXIS_INT = 0.45, EDGE_INT = 0.55;
const EDGE_END = 0.10, EDGE_SEGS = 160;   // spec 40: steep column-4 S-curves need finer steps for the text breaks
const TEXT_CLEAR = 0.03;                 // edges break this close round text (column-4 S-curves crossed labels)
const PAST_GEO = 0.55, PAST_LABEL = 0.5, PAST_CAPTION = 0.35, PAST_AXIS_LABEL = 0.6;
const PARENT_FLASH = 0.5, PARENT_FLASH_T = 0.4;   // past parent ×1.5 when its new edge starts
const PEN_SPEED_AXIS = 3.75, PEN_SPEED_SWEEP = 2.1, PEN_EASE = 0.3, PEN_STEP = 0.015;   // (1.5x the prototype: less waiting)
const PEN_ENTER = 1.0;                   // pen enters the axis this far left of tick k−1
const PEN_ENTER_F1 = -1.2;               // frame 1: from this x
const CONNECT_SPEED = 7.5;               // peak speed flying from the idle loop to the axis entry
const SWEEP_OVER = 0.25;                 // the sweep runs this far past the top node
const EDGE_GROW = 0.7, IGNITE = 0.5, IGNITE_PEAK = 2.4;
const LABEL_FADE = 0.3, CAPTION_FADE = 0.4, AXIS_LABEL_FADE = 0.4, WORDS_FADE = 0.5;
const COPY_FADE = 0.4, GROW_EL = 0.08;
export const CAM_PAN = 1.0;               // s: the camera pans to the next frame's window (orchestrator)
export const EARLY_TAP = 1.0;             // s: a tap before this waits, after it (before the end) grows the frame at once (>= CAM_PAN: a pan never restarts mid-way)
const LOOP_SETTLE = 1.5;
const IDLE_PAD = 0.35, IDLE_R = 0.5, IDLE_PERIOD = 18, IDLE_Z = 0.15;
const IDLE_PAD_X = 0.15;                 // sideways pad (spec 0.35 ran into the panel: the fit leaves 0.15 each side)
const COMET_SMOOTH = 0.05;
export const PEN_INTENSITY = 3.0;         // the comet trail's point intensity while it draws the graph
const LABEL_HALF_W = 0.81;               // half the widest label / caption (window width)
const GRAPH_TOP = 1.85, GRAPH_BOTTOM = -3.4; // top label to bottom axis label (GRAPH_H ≈ 5.0)
const FIT_MARGIN_H = 1.06;               // a little air above and below (the exact fit touched the screen top and the panel)
const PHONE_Y_SCALE = 1.0;              // spec 0.9: the NETWORKS caption then touched the ALGORITHMS label
const DOMAIN = {
    core: new THREE.Color(0xff8800),
    math: new THREE.Color(0x3a7fd5),
    code: new THREE.Color(0x00ddbb),
    people: new THREE.Color(0xeecc44).lerp(new THREE.Color(0xffffff), 0.5),
};
const AXIS_COLOR = new THREE.Color(0xffbb66).lerp(new THREE.Color(0xffffff), 0.5);
// Site camera fit (orchestrator fitFor, camera.js shift)
const FIT_SIDE = 0.5, FIT_BOTTOM = 0.55;
const SHIFT_BOTTOM_Y = 0.18;
const NAV_SHARE = 0.06;                  // bottom layout: the graph sits this share of the height lower (under the site nav)

// ── Helpers ────────────────────────────────────────────────────────
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BLACK = new THREE.Color(0, 0, 0);
const byId = Object.fromEntries(NODES.map(n => [n.id, n]));
const smooth = u => u * u * (3 - 2 * u);
const smoother = u => u * u * u * (u * (u * 6 - 15) + 10);
const col = (c, k) => c.clone().multiplyScalar(k);
function polyLen(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += pts[i].distanceTo(pts[i - 1]); return l; }

let phone = false;
const yS = () => (phone ? PHONE_Y_SCALE : 1);
const colX = c => c * COL_DX;
const nodePos = n => V(colX(n.col), n.y * yS(), 0);
const axisY = () => AXIS_Y * yS();
// Columns in view for frame k: desktop three, phone two
const windowCols = k => (phone ? [Math.max(0, k - 1), k] : [Math.max(0, k - 2), k]);
const nWindowCols = () => (phone ? 2 : 3);

// ── Stroke-font text, centred above / below a point ────────────────
const textCache = {};
function textRaw(lines) {
    const key = lines.join('\n');
    if (!textCache[key]) {
        const { points } = generateTextLines(lines, 90);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const p of points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
        textCache[key] = { points, x0, x1, y0, y1 };
    }
    return textCache[key];
}
// side 'above': block bottom at y; 'below': block top at y
function placeText(text, x, y, cap, side) {
    const lines = text.split('/').map(s => s.trim());
    const { points, x0, x1, y0, y1 } = textRaw(lines);
    const ox = x - (x0 + x1) / 2 * cap;
    const oy = side === 'above' ? y - y0 * cap : y - y1 * cap;
    const pts = points.map(p => V(ox + p.x * cap, oy + p.y * cap, 0));
    const seg = points.map((p, i) => i < points.length - 1 && p.c === 1 && points[i + 1].c === 1);
    return { pts, seg };
}

// ── Edge path: S-curve over the first column, then flat in the child's lane ──
function edgePath(par, child) {
    const a = nodePos(par), b = nodePos(child);
    const x0 = a.x + EDGE_END, xEnd = b.x - EDGE_END;
    const xS = Math.min(a.x + COL_DX, xEnd);     // end of the S
    const xm = (x0 + xS) / 2;
    const pts = [];
    for (let i = 0; i <= EDGE_SEGS; i++) {
        const t = i / EDGE_SEGS, u = 1 - t;
        pts.push(V(u * u * u * x0 + 3 * u * u * t * xm + 3 * u * t * t * xm + t * t * t * xS,
                   (u * u * u + 3 * u * u * t) * a.y + (3 * u * t * t + t * t * t) * b.y, 0));
    }
    const skip = Math.round((xEnd - xS) / COL_DX * EDGE_SEGS);
    for (let i = 1; i <= skip; i++) pts.push(V(xS + (xEnd - xS) * i / skip, b.y, 0));
    return pts;
}

// ── Geometry buffers (one per copy; the shader plays the timeline) ──
// aStart of an element that shows from the start (the copy clock starts below 0 while the connector runs)
const ALWAYS = -1e4;
function makeBuf() { return { P: [], C0: [], C1: [], S: [], D: [], FL: [], K: [], PH: [], SZ: [] }; }
const at = (v, i) => (Array.isArray(v) ? v[i] : v);
function vtx(b, p, o, i) {
    const c0 = at(o.c0, i), c1 = at(o.c1, i);
    b.P.push(p.x, p.y, p.z);
    b.C0.push(c0.r, c0.g, c0.b); b.C1.push(c1.r, c1.g, c1.b);
    b.S.push(at(o.start ?? ALWAYS, i)); b.D.push(o.dur ?? 0);
    b.FL.push(o.flash ?? 0, o.flashDur ?? 1);
    b.K.push(o.kind ?? 0); b.PH.push(o.phase ?? 0); b.SZ.push(o.size ?? 0);
}
function addLine(b, pts, o) {
    for (let i = 0; i < pts.length - 1; i++) {
        if (o.seg && !o.seg[i]) continue;
        vtx(b, pts[i], o, i); vtx(b, pts[i + 1], o, i + 1);
    }
}
function toGeometry(b) {
    const g = new THREE.BufferGeometry();
    const f = (a, n) => new THREE.Float32BufferAttribute(a, n);
    g.setAttribute('position', f(b.P, 3));
    g.setAttribute('aC0', f(b.C0, 3)); g.setAttribute('aC1', f(b.C1, 3));
    g.setAttribute('aStart', f(b.S, 1)); g.setAttribute('aDur', f(b.D, 1));
    g.setAttribute('aFlash', f(b.FL, 2)); g.setAttribute('aKind', f(b.K, 1));
    g.setAttribute('aPhase', f(b.PH, 1)); g.setAttribute('aSize', f(b.SZ, 1));
    return g;
}

// A vertex fades from aC0 to aC1 over [aStart, aStart + aDur]; aFlash
// (amp, s) is a brightness kick that decays from aStart; aKind 2 twinkles.
const VERT_COMMON = `
    attribute vec3 aC0, aC1;
    attribute float aStart, aDur, aKind, aPhase, aSize;
    attribute vec2 aFlash;
    uniform float uTime, uFade;
    varying vec3 vCol;
    vec3 play() {
        float g = aDur > 0.0 ? clamp((uTime - aStart) / aDur, 0.0, 1.0) : step(aStart, uTime);
        vec3 col = mix(aC0, aC1, g);
        if (aFlash.x > 0.0 && uTime >= aStart)
            col *= 1.0 + aFlash.x * (1.0 - clamp((uTime - aStart) / aFlash.y, 0.0, 1.0));
        if (aKind == 2.0) col *= 1.0 + 0.12 * sin(6.2832 * (0.2 + 0.2 * fract(aPhase * 0.37)) * uTime + aPhase);
        return col * uFade;
    }
`;
const LINE_VERT = VERT_COMMON + `
    void main() {
        vCol = play();
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
const POINT_VERT = VERT_COMMON + `
    uniform float uPx;
    void main() {
        vCol = play();
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(aSize * uPx * 6.0 / -mv.z, 1.0);
        gl_Position = projectionMatrix * mv;
    }`;
const LINE_FRAG = `
    varying vec3 vCol;
    void main() { if (max(vCol.r, max(vCol.g, vCol.b)) < 0.002) discard; gl_FragColor = vec4(vCol, 1.0); }`;
const POINT_FRAG = `
    varying vec3 vCol;
    void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-r * r * 30.0) + 0.25 * exp(-r * r * 6.0);
        if (a < 0.003 || max(vCol.r, max(vCol.g, vCol.b)) < 0.002) discard;
        gl_FragColor = vec4(vCol * a, 1.0);
    }`;
const uPx = { value: 400 };
function material(vert, frag, extra = {}) {
    return new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, ...extra },
        vertexShader: vert, fragmentShader: frag,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    });
}

// ── Comet pen: a path with a time per point ────────────────────────
// Speed changes ease over PEN_EASE s (setSpeed); a curve may carry its own
// speed profile (vFn of the curve parameter).
class Pen {
    constructor(p0, v0) { this.pts = [p0.clone()]; this.times = [0]; this.t = 0; this.vFrom = v0; this.vTo = v0; this.tSet = 0; this.vFn = null; this.u = 0; }
    get pos() { return this.pts[this.pts.length - 1]; }
    speed() {
        if (this.vFn) return this.vFn(this.u);
        return this.vFrom + (this.vTo - this.vFrom) * smooth(Math.min((this.t - this.tSet) / PEN_EASE, 1));
    }
    setSpeed(v) { this.vFrom = this.speed(); this.vTo = v; this.tSet = this.t; }
    add(p) {
        const d = p.distanceTo(this.pos);
        if (d < 1e-7) return;
        this.t += d / this.speed();
        this.pts.push(p.clone()); this.times.push(this.t);
    }
    curve(fn, len, vFn = null) {
        const n = Math.max(2, Math.ceil(len / PEN_STEP));
        this.vFn = vFn;
        for (let i = 1; i <= n; i++) { this.u = (i - 0.5) / n; this.add(fn(i / n)); }
        this.vFn = null;
    }
    line(to) { const a = this.pos.clone(); this.curve(u => a.clone().lerp(to, u), a.distanceTo(to)); }
    cubic(p1, p2, p3, vFn) {
        const p0 = this.pos.clone();
        this.curve(u => {
            const w = 1 - u;
            return V().addScaledVector(p0, w * w * w).addScaledVector(p1, 3 * w * w * u)
                .addScaledVector(p2, 3 * w * u * u).addScaledVector(p3, u * u * u);
        }, polyLen([p0, p1, p2, p3]), vFn);
    }
    // time at which the pen first reaches coordinate v on axis 'x' or 'y' after index i0
    timeAt(axis, v, i0 = 0) {
        for (let i = Math.max(1, i0); i < this.pts.length; i++) {
            const a = this.pts[i - 1][axis], b = this.pts[i][axis];
            if ((a - v) * (b - v) <= 0 && a !== b) {
                const f = (v - a) / (b - a);
                return this.times[i - 1] + f * (this.times[i] - this.times[i - 1]);
            }
        }
        return this.t;
    }
}

// Idle loop: rounded rectangle IDLE_PAD outside the window's content,
// clockwise, IDLE_PERIOD s per lap. Returns { at(s), len, sOfTopX(x) }.
function idleLoop(k) {
    const [c0, c1] = windowCols(k);
    const x0 = colX(c0) - LABEL_HALF_W - IDLE_PAD_X, x1 = colX(c1) + LABEL_HALF_W + IDLE_PAD_X;
    const y0 = GRAPH_BOTTOM * yS() - IDLE_PAD, y1 = GRAPH_TOP * yS() + IDLE_PAD;
    const r = IDLE_R, w = x1 - x0 - 2 * r, h = y1 - y0 - 2 * r, q = Math.PI * r / 2;
    const segs = [w, q, h, q, w, q, h, q];
    const len = 2 * w + 2 * h + 4 * q;
    function at(s) {
        let d = ((s % len) + len) % len, i = 0;
        while (i < 7 && d > segs[i]) { d -= segs[i]; i++; }
        let x, y, a;
        switch (i) {   // from the top-left, clockwise (right along the top first)
            case 0: x = x0 + r + d; y = y1; break;
            case 1: a = Math.PI / 2 - d / r; x = x1 - r + r * Math.cos(a); y = y1 - r + r * Math.sin(a); break;
            case 2: x = x1; y = y1 - r - d; break;
            case 3: a = -d / r; x = x1 - r + r * Math.cos(a); y = y0 + r + r * Math.sin(a); break;
            case 4: x = x1 - r - d; y = y0; break;
            case 5: a = -Math.PI / 2 - d / r; x = x0 + r + r * Math.cos(a); y = y0 + r + r * Math.sin(a); break;
            case 6: x = x0; y = y0 + r + d; break;
            default: a = Math.PI - d / r; x = x0 + r + r * Math.cos(a); y = y1 - r + r * Math.sin(a);
        }
        return V(x, y, IDLE_Z * Math.sin(2 * Math.PI * s / len));
    }
    return { at, len, sOfTopX: x => THREE.MathUtils.clamp(x - (x0 + r), 0, w) };
}

// ── One stop's copy: columns < k past, column k grows ──────────────
// The heavy part (geometry, materials) does not depend on where the comet
// is, so all four frames are built ahead (prebuild, idle slots; a tap then
// only starts one). The pen here starts at the axis entry; start() puts the
// connector from the comet in front of it and shifts the copy's clock by
// its duration (tOff). The build is a generator: it yields after each node
// (prebuild spreads it over idle slots, a few ms each; buildCopy runs it
// through at once).
const entryOf = k => V(k === 1 ? PEN_ENTER_F1 : colX(k - 1) - PEN_ENTER, axisY(), PEN_Z);
function buildCopy(k) {
    const steps = copySteps(k);
    for (;;) { const r = steps.next(); if (r.done) return r.value; }
}
function* copySteps(k) {
    const L = makeBuf(), Pt = makeBuf();
    const ay = axisY();
    // 1. the pen: axis from tick k−1 to tick k → up column k
    const xPrev = colX(k - 1), xk = colX(k);
    const pen = new Pen(entryOf(k), PEN_SPEED_AXIS);
    const iAxis = 0;
    const turnR = TICK_H;
    pen.line(V(xk - turnR, ay, PEN_Z));
    pen.setSpeed(PEN_SPEED_SWEEP);
    pen.cubic(V(xk - turnR * 0.45, ay, PEN_Z), V(xk, ay + turnR * 0.55, PEN_Z), V(xk, ay + turnR, PEN_Z));
    const iSweep = pen.pts.length - 1;
    const newNodes = NODES.filter(n => n.col === k).sort((a, b) => a.y - b.y);
    const yTop = Math.max(...newNodes.map(n => nodePos(n).y));
    pen.line(V(xk, yTop + SWEEP_OVER, PEN_Z));
    const tAxis = x => pen.timeAt('x', x, iAxis);
    const tTick = pen.timeAt('y', ay + turnR * 0.5, iAxis);
    const tPass = {};
    for (const n of newNodes) tPass[n.id] = pen.timeAt('y', nodePos(n).y, iSweep);
    let end = pen.t;
    const mark = t => { end = Math.max(end, t); };

    // 2. the axis: past part, new part under the pen, fading tail
    const axisCol = col(AXIS_COLOR, AXIS_INT);
    const xNew0 = k === 1 ? AXIS_X0 : xPrev;
    if (k > 1) addLine(L, [V(AXIS_X0, ay, 0), V(xPrev, ay, 0)], { c0: col(axisCol, PAST_GEO), c1: col(axisCol, PAST_GEO) });
    const nA = Math.max(2, Math.ceil((xk - xNew0) / 0.03));
    const axPts = Array.from({ length: nA + 1 }, (_, i) => V(xNew0 + (xk - xNew0) * i / nA, ay, 0));
    addLine(L, axPts, { c0: BLACK, c1: axisCol, start: axPts.map(p => tAxis(p.x)), dur: GROW_EL });
    const tail = Array.from({ length: 11 }, (_, i) => V(xk + AXIS_TAIL * i / 10, ay, 0));
    addLine(L, tail, { c0: BLACK, c1: tail.map((_, i) => col(axisCol, 1 - i / 10)), start: tail.map((_, i) => tTick + 0.05 * i), dur: GROW_EL });
    for (let j = 0; j <= k; j++) {
        const tick = [V(colX(j), ay, 0), V(colX(j), ay + TICK_H, 0)];
        const isNew = j === k || (k === 1 && j === 0);
        const tj = j === k ? tTick : tAxis(colX(j));
        if (isNew) addLine(L, tick, { c0: BLACK, c1: axisCol, start: [tj, tj + 0.05], dur: GROW_EL });
        else addLine(L, tick, { c0: col(axisCol, PAST_GEO), c1: col(axisCol, PAST_GEO) });
        if (AXIS_LABELS[j]) {
            const lab = placeText(AXIS_LABELS[j], colX(j), ay - AXIS_LABEL_DROP, CAP_AXIS, 'below');
            const lc = col(AXIS_COLOR, AXIS_LABEL_INT);
            if (j === k) { addLine(L, lab.pts, { seg: lab.seg, c0: BLACK, c1: lc, start: tTick, dur: AXIS_LABEL_FADE }); mark(tTick + AXIS_LABEL_FADE); }
            else addLine(L, lab.pts, { seg: lab.seg, c0: col(lc, PAST_AXIS_LABEL), c1: col(lc, PAST_AXIS_LABEL) });
        }
    }

    // 3. nodes, labels, captions, edges
    const flashAt = {};   // past parent → time its first new edge starts
    for (const n of newNodes) for (const pid of n.parents || []) {
        const t = tPass[n.id] - EDGE_GROW;
        flashAt[pid] = Math.min(flashAt[pid] ?? Infinity, t);
    }
    const capCap = phone ? CAP_CAPTION_PHONE : CAP_CAPTION;
    // Text boxes in this copy: edges break where they pass behind text
    const boxes = [];
    const boxOf = t => {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const q of t.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
        boxes.push([x0 - TEXT_CLEAR, x1 + TEXT_CLEAR, y0 - TEXT_CLEAR, y1 + TEXT_CLEAR]);
    };
    for (const n of NODES) {
        if (n.col > k) continue;
        const p = nodePos(n);
        boxOf(placeText(n.label, p.x, p.y + LABEL_GAP, n.col === 0 ? CAP_WORD : CAP_LABEL, 'above'));
        if (n.caption && (n.col === k || !phone)) boxOf(placeText(n.caption, p.x, p.y - CAPTION_DROP, capCap, 'below'));
    }
    const hidden = q => boxes.some(b => q.x > b[0] && q.x < b[1] && q.y > b[2] && q.y < b[3]);
    for (const n of NODES) {
        if (n.col > k) continue;
        const p = nodePos(n), c = DOMAIN[n.dom];
        const isNew = n.col === k, words = n.col === 0;
        const ph = (n.id.length * 1.7 + n.id.charCodeAt(0) * 0.31) % 6.283;
        const size = words ? PT_CORE : PT;
        const pc = col(c, PT_INT);
        const lab = placeText(n.label, p.x, p.y + LABEL_GAP, words ? CAP_WORD : CAP_LABEL, 'above');
        const lc = col(c, LABEL_INT);
        if (words && k === 1) {
            // frame 1: the three words and their points fade in
            vtx(Pt, p, { c0: BLACK, c1: pc, start: 0, dur: WORDS_FADE, size, kind: 2, phase: ph }, 0);
            addLine(L, lab.pts, { seg: lab.seg, c0: BLACK, c1: lc, start: 0, dur: WORDS_FADE });
        } else if (isNew) {
            const tp = tPass[n.id];
            vtx(Pt, p, { c0: BLACK, c1: pc, start: tp, dur: 0.05, flash: IGNITE_PEAK / PT_INT - 1, flashDur: IGNITE, size, kind: 2, phase: ph }, 0);
            addLine(L, lab.pts, { seg: lab.seg, c0: BLACK, c1: lc, start: tp + 0.1, dur: LABEL_FADE });
            mark(tp + 0.1 + LABEL_FADE);
        } else {
            const past = col(pc, PAST_GEO);
            vtx(Pt, p, { c0: past, c1: past, size, kind: 2, phase: ph,
                         start: flashAt[n.id] ?? ALWAYS, flash: flashAt[n.id] !== undefined ? PARENT_FLASH : 0, flashDur: PARENT_FLASH_T }, 0);
            addLine(L, lab.pts, { seg: lab.seg, c0: col(lc, PAST_LABEL), c1: col(lc, PAST_LABEL) });
        }
        if (n.caption) {
            const cap = placeText(n.caption, p.x, p.y - CAPTION_DROP, capCap, 'below');
            const cc = col(c, CAPTION_INT);
            if (isNew) { addLine(L, cap.pts, { seg: cap.seg, c0: BLACK, c1: cc, start: tPass[n.id] + 0.3, dur: CAPTION_FADE }); mark(tPass[n.id] + 0.3 + CAPTION_FADE); }
            else if (!phone) addLine(L, cap.pts, { seg: cap.seg, c0: col(cc, PAST_CAPTION), c1: col(cc, PAST_CAPTION) });
        }
        for (const pid of n.parents || []) {
            const par = byId[pid], pts = edgePath(par, n);
            const hid = pts.map(hidden);
            const seg = pts.map((_, i) => !hid[i] && !hid[i + 1]);
            const len = polyLen(pts);
            let acc = 0;
            const f = pts.map((q, i) => (acc += i ? q.distanceTo(pts[i - 1]) : 0) / len);
            const cols = f.map(u => DOMAIN[par.dom].clone().lerp(c, u).multiplyScalar(EDGE_INT));
            if (isNew) {
                const t0 = tPass[n.id] - EDGE_GROW;
                addLine(L, pts, { seg, c0: BLACK, c1: cols, start: f.map(u => t0 + EDGE_GROW * u), dur: GROW_EL });
            } else {
                const pastC = cols.map(x => x.clone().multiplyScalar(PAST_GEO));
                addLine(L, pts, { seg, c0: pastC, c1: pastC });
            }
            yield;   // (an edge is the largest step: a few hundred vertices)
        }
        yield;
    }

    const loop = idleLoop(k);
    const lineMat = material(LINE_VERT, LINE_FRAG), pointMat = material(POINT_VERT, POINT_FRAG, { uPx });
    const group = new THREE.Group();
    const lines = new THREE.LineSegments(toGeometry(L), lineMat);
    yield;
    const points = new THREE.Points(toGeometry(Pt), pointMat);
    for (const o of [lines, points]) { o.frustumCulled = false; group.add(o); }
    return { k, group, mats: [lineMat, pointMat], penPts: pen.pts, penTimes: pen.times, loop,
             loopS0: loop.sOfTopX(xk), end0: end + 0.3, tOff: 0, end: end + 0.3 };
}

// Start a built copy from `start` (local; null: at the axis entry): the
// connector from the comet to the entry, then the copy's own pen path; the
// comet path is smoothed over both
function startCopy(cp, start) {
    const entry = entryOf(cp.k);
    let pts = cp.penPts, times = cp.penTimes, tOff = 0;
    if (start && start.distanceTo(entry) > 0.05) {
        const D = start.distanceTo(entry), v0 = CONNECT_SPEED * 0.4;
        const pen = new Pen(start, v0);
        pen.cubic(start.clone().add(V(0, -D * 0.35, 0)), entry.clone().add(V(-D * 0.35, 0, 0)), entry,
                  u => v0 + (PEN_SPEED_AXIS - v0) * smooth(u) + (CONNECT_SPEED - PEN_SPEED_AXIS) * Math.sin(Math.PI * u) ** 2);
        tOff = pen.t;
        pts = [...pen.pts, ...cp.penPts.slice(1)];
        times = [...pen.times, ...cp.penTimes.slice(1).map(t => t + tOff)];
    }
    // the comet: smoothed pen path, then the idle loop
    const n = pts.length, w = Math.max(1, Math.round(COMET_SMOOTH / PEN_STEP));
    const cometPts = pts.map((p, i) => {
        const a = Math.max(0, i - w), b = Math.min(n - 1, i + w);
        const out = V();
        for (let j = a; j <= b; j++) out.add(pts[j]);
        return out.multiplyScalar(1 / (b - a + 1));
    });
    cometPts[0] = pts[0].clone(); cometPts[n - 1] = pts[n - 1].clone();
    cp.cometPts = cometPts; cp.cometTimes = times; cp.tOff = tOff; cp.end = cp.end0 + tOff;
}

// Comet position at copy time t: the pen path, then the idle loop eased on
function cometAt(cp, t, out) {
    const ts = cp.cometTimes, P = cp.cometPts, n = ts.length;
    if (t <= ts[n - 1]) {
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
        const f = (t - ts[lo]) / Math.max(ts[hi] - ts[lo], 1e-9);
        return out.copy(P[lo]).lerp(P[hi], THREE.MathUtils.clamp(f, 0, 1));
    }
    const u = t - ts[n - 1], L = cp.loop;
    const base = s => L.at(cp.loopS0 + s * L.len / IDLE_PERIOD);
    const off = P[n - 1].clone().sub(base(0));
    return out.copy(base(u)).addScaledVector(off, Math.exp(-LOOP_SETTLE * u));
}

// ── The GRAPH stop's controller (world.js builds it, the orchestrator drives it) ──
// Graph units in a local plane (x right, y up, z to the camera). world.js
// puts `group` at the stop (position, orientation, scale = the fit scale);
// the orchestrator maps the local comet and frame targets to world space.
export function createGraph({ phone: isPhone }) {
    phone = isPhone;
    const group = new THREE.Group();
    let cur = null, prev = null, time = 0;
    const built = [], steps = [];          // built[k]: frame k, ready to start; steps[k]: its build in progress (prebuild)
    const take = k => {                    // a built copy, or a new one (the old one may still show)
        if (steps[k]) prebuild(k);         // (finish a build in progress)
        const cp = built[k];
        if (cp && cp !== cur && cp !== prev) return cp;
        return (built[k] = buildCopy(k));
    };
    // Build frame k ahead, for at most budget ms (true: built)
    function prebuild(k, budget = Infinity) {
        if (built[k]) return true;
        steps[k] ??= copySteps(k);
        const t0 = performance.now();
        for (;;) {
            const r = steps[k].next();
            if (r.done) { built[k] = r.value; steps[k] = null; return true; }
            if (performance.now() - t0 > budget) return false;
        }
    }
    let outside = 1;                       // the outside-world fade (the warp, indoors): world.js
    const applyFade = () => {
        const fadeIn = prev ? Math.min(time / COPY_FADE, 1) : 1;
        if (cur) cur.mats.forEach(m => { m.uniforms.uTime.value = time - cur.tOff; m.uniforms.uFade.value = fadeIn * outside; });
        if (prev) {
            const f = Math.max(0, 1 - time / COPY_FADE);
            prev.mats.forEach(m => { m.uniforms.uFade.value = f * outside; });
            if (f <= 0) { group.remove(prev.group); prev = null; }
        }
    };
    return {
        group, NFRAMES,
        get k() { return cur?.k ?? 0; },
        get time() { return time; },
        get end() { return cur?.end ?? 0; },
        // The camera target of frame k (local): the window centre, the graph middle
        // (the bottom layout drops it by `drop` graph units: see fitGraph)
        frameTarget(k, drop = 0) {
            const [c0, c1] = windowCols(k);
            return V((colX(c0) + colX(c1)) / 2, (GRAPH_TOP + GRAPH_BOTTOM) / 2 * yS() - drop, 0);
        },
        // Where the pen enters frame 1 (the flight into the stop ends here)
        entry() { return V(PEN_ENTER_F1, axisY(), PEN_Z); },
        // Frame k: columns < k past, column k grows under the pen; `start`
        // (local) = where the comet is now (it flies on to the axis entry)
        start(k, start = null) {
            if (prev) group.remove(prev.group);
            prev = cur;
            cur = take(k);
            startCopy(cur, start);
            group.add(cur.group);
            time = 0;
            applyFade();
        },
        update(dt) { if (!cur) return; time += dt; applyFade(); },
        // Grow the frame fully at once (an early tap)
        snap() { if (!cur) return; time = Math.max(time, cur.end + 2); applyFade(); },
        cometAt(t, out) { return cometAt(cur, t, out); },
        setOutside(v) { outside = v; applyFade(); },
        setPx(px) { uPx.value = px; },
        // Build frame k ahead (world.js: in idle slots, `budget` ms at a time), so a tap does not stall
        prebuild,
        builtGroup: k => built[k]?.group ?? null,
    };
}

// The fit: one scale per device, constant across frames (the camera only
// pans). camDist = the camera distance, tanV = tan(vertical FOV / 2),
// aspect, side = the panel side layout (else bottom; phone rules there).
// Returns { scale (world units per graph unit), drop (graph units the
// target moves down on the bottom layout: the view offset puts it 32 %
// from the top, the free area's middle is at 27.5 %, + NAV_SHARE under the
// nav), phone }.
export function fitGraph(camDist, tanV, aspect, side) {
    phone = !side;
    const [aw, ah] = side ? [FIT_SIDE, 1] : [1, FIT_BOTTOM];
    const availH = 2 * camDist * tanV * ah, availW = 2 * camDist * tanV * aspect * aw;
    const windowW = (nWindowCols() - 1) * COL_DX + 2 * LABEL_HALF_W + 0.3;
    const graphH = (GRAPH_TOP - GRAPH_BOTTOM) * yS() * FIT_MARGIN_H;
    const scale = Math.min(availW / windowW, availH / graphH);
    const drop = side ? 0 : (0.5 - SHIFT_BOTTOM_Y - FIT_BOTTOM / 2 - NAV_SHARE) * 2 * camDist * tanV / scale;
    return { scale, drop, phone, labelPx: CAP_LABEL * scale, captionPx: (phone ? CAP_CAPTION_PHONE : CAP_CAPTION) * scale };
}
