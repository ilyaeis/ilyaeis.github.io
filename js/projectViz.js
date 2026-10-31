// ── Project visualizations ─────────────────────────────────────────
// One small live animation per project stop in the tunnel. Each is a
// THREE.Group in a local plane: x right, y up, z towards the camera,
// content inside x ±HALF_W, y ±HALF_H. world.js places the group at the
// stop and calls update(dt) only for the stops next to the comet.
// Everything is dt-based. Lines are 1 px, so curves that must read well
// are soft ribbons (3 vertices across: transparent edge, bright core).
// Colours > 1 feed the bloom; structure stays dim (alpha < 0.5).

import * as THREE from 'three';
import { isMobile, renderer } from './attractors.js';
import { generateTextLines } from './strokeFont.js';

export const HALF_W = 1.3;
export const HALF_H = 1.0;

// ── Palette ────────────────────────────────────────────────────────
const C = {
    purple: new THREE.Color(0x8833cc),
    pink: new THREE.Color(0xcc33aa),
    magenta: new THREE.Color(0xff44cc),
    cyan: new THREE.Color(0x44ccff),
    amber: new THREE.Color(0xffaa44),
    white: new THREE.Color(1, 1, 1),
    red: new THREE.Color(0xff3344)
};
const _c = new THREE.Color();
const BRACKET_ALPHA = 0.28;              // corner brackets round every viz

// ── Shaders ────────────────────────────────────────────────────────
const VERT = `
    attribute vec3 color;
    attribute float aAlpha;
    uniform float uOpacity, uVis;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        vColor = color;
        vAlpha = aAlpha * uOpacity * uVis;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
const FRAG = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        if (vAlpha < 0.003) discard;
        gl_FragColor = vec4(vColor, vAlpha);
    }
`;
const POINT_VERT = `
    attribute vec3 color;
    attribute float aAlpha;
    attribute float aSize;
    uniform float uOpacity, uVis, uPx;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        vColor = color;
        vAlpha = aAlpha * uOpacity * uVis;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(aSize * uPx / max(-mv.z, 0.01), 1.0);
        gl_Position = projectionMatrix * mv;
    }
`;
const POINT_FRAG = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(1.0 - r, 0.0), 1.6) * vAlpha;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vColor, a);
    }
`;
// Monte Carlo paths: each vertex knows its time share (aPath.x) and its
// path's start delay (aPath.y); the path grows on the GPU.
const PATH_VERT = `
    attribute vec3 color;
    attribute float aAlpha;
    attribute vec2 aPath;
    uniform float uOpacity, uVis, uT, uDur;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        float prog = clamp((uT - aPath.y) / uDur, 0.0, 1.0);
        float vis = 1.0 - smoothstep(prog, prog + 0.012, aPath.x);
        float head = exp(-abs(prog - aPath.x) * 50.0) * (1.0 - step(0.999, prog));
        vColor = color * (1.0 + 2.5 * head);
        vAlpha = aAlpha * vis * uOpacity * uVis * (1.0 + 1.5 * head);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// uVis: the whole viz fades with its distance down the tunnel (one
// uniform object per viz, set while its builder runs)
let curVis = { value: 1 };
function material(vert = VERT, frag = FRAG, extra = {}) {
    return new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 1 }, uVis: curVis, ...extra },
        vertexShader: vert, fragmentShader: frag,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
}

let pxScale = 700;                       // set in buildProjectViz (needs the renderer)

// ── Geometry helpers ───────────────────────────────────────────────
function attrs(n, index = null) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), alp = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    if (index) g.setIndex(index);
    return { g, pos, col, alp, n };
}
function dirty(o) {
    const a = o.g.attributes;
    a.position.needsUpdate = true; a.color.needsUpdate = true; a.aAlpha.needsUpdate = true;
    if (a.aSize) a.aSize.needsUpdate = true;
}
function setV(o, i, x, y, color, k, alpha, z = 0) {
    o.pos[i * 3] = x; o.pos[i * 3 + 1] = y; o.pos[i * 3 + 2] = z;
    o.col[i * 3] = color.r * k; o.col[i * 3 + 1] = color.g * k; o.col[i * 3 + 2] = color.b * k;
    o.alp[i] = alpha;
}
function lineSegs(group, n) {
    const o = attrs(n);
    o.obj = new THREE.LineSegments(o.g, material());
    group.add(o.obj);
    return o;
}
function lineStrip(group, n) {
    const o = attrs(n);
    o.obj = new THREE.Line(o.g, material());
    group.add(o.obj);
    return o;
}
function points(group, n) {
    const o = attrs(n);
    o.size = new Float32Array(n);
    o.g.setAttribute('aSize', new THREE.BufferAttribute(o.size, 1));
    o.obj = new THREE.Points(o.g, material(POINT_VERT, POINT_FRAG, { uPx: { value: pxScale } }));
    group.add(o.obj);
    return o;
}
function quadIndex(nQuads) {
    const idx = [];
    for (let q = 0; q < nQuads; q++) { const b = q * 4; idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); }
    return idx;
}
// Quads: 4 vertices each (bottom-left, bottom-right, top-left, top-right)
function quads(group, nQuads) {
    const o = attrs(nQuads * 4, quadIndex(nQuads));
    o.obj = new THREE.Mesh(o.g, material());
    group.add(o.obj);
    return o;
}
// Gradient quad, from (x0, y0) to (x1, y1); bottom colour/alpha, top colour/alpha
function setQuad(o, q, x0, y0, x1, y1, cb, kb, ab, ct, kt, at) {
    setV(o, q * 4, x0, y0, cb, kb, ab);
    setV(o, q * 4 + 1, x1, y0, cb, kb, ab);
    setV(o, q * 4 + 2, x0, y1, ct, kt, at);
    setV(o, q * 4 + 3, x1, y1, ct, kt, at);
}

// Soft ribbon along a polyline in the plane: 3 vertices per sample (edge,
// core, edge). reveal(k) draws only the first k samples.
function ribbon(group, n, width, vert = VERT, extra = {}, extraAttr = null) {
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
        const a = i * 3, b = (i + 1) * 3;
        idx.push(a, a + 1, b, b, a + 1, b + 1, a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
    }
    const o = attrs(n * 3, idx);
    if (extraAttr) o.g.setAttribute(extraAttr.name, new THREE.BufferAttribute(new Float32Array(n * 3 * extraAttr.size), extraAttr.size));
    o.obj = new THREE.Mesh(o.g, material(vert, FRAG, extra));
    o.xs = new Float32Array(n); o.ys = new Float32Array(n);
    o.width = width; o.samples = n;
    group.add(o.obj);
    return o;
}
// Write the ribbon from o.xs/o.ys; colour per sample from colorAt(i) (or one colour)
function ribbonWrite(o, color, k = 1, alpha = 1, colorAt = null) {
    const n = o.samples, hw = o.width / 2;
    for (let i = 0; i < n; i++) {
        const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, n - 1);
        let tx = o.xs[i1] - o.xs[i0], ty = o.ys[i1] - o.ys[i0];
        const l = Math.hypot(tx, ty) || 1;
        const nx = -ty / l * hw, ny = tx / l * hw;
        const c = colorAt ? colorAt(i) : color;
        setV(o, i * 3, o.xs[i] + nx, o.ys[i] + ny, c, k, 0);
        setV(o, i * 3 + 1, o.xs[i], o.ys[i], c, k, alpha);
        setV(o, i * 3 + 2, o.xs[i] - nx, o.ys[i] - ny, c, k, 0);
    }
    dirty(o);
}
function ribbonReveal(o, samples) {
    o.g.setDrawRange(0, Math.max(0, Math.floor(samples) - 1) * 12);
}

// Stroke-font text as static segments; left edge at x, vertical middle at y.
// The glyph height is `height`, or less if the line would be wider than maxW.
function strokeText(group, str, x, y, height, color, k, alpha, maxW = Infinity) {
    const { points } = generateTextLines([str], 120);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const s = Math.min(height / Math.max(maxY - minY, 1e-3), maxW / Math.max(maxX - minX, 1e-3)), my = (minY + maxY) / 2;
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
        if (points[i].c === 1 && points[i + 1].c === 1) segs.push(points[i], points[i + 1]);
    }
    const o = lineSegs(group, segs.length);
    segs.forEach((p, i) => setV(o, i, x + (p.x - minX) * s, y + (p.y - my) * s, color, k, alpha));
    dirty(o);
    return o;
}

function brackets(group, hw = HALF_W, hh = HALF_H) {
    const L = 0.16;
    const o = lineSegs(group, 16);
    let i = 0;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x = sx * hw, y = sy * hh;
        setV(o, i++, x, y, C.purple, 1, BRACKET_ALPHA); setV(o, i++, x - sx * L, y, C.purple, 1, BRACKET_ALPHA);
        setV(o, i++, x, y, C.purple, 1, BRACKET_ALPHA); setV(o, i++, x, y - sy * L, C.purple, 1, BRACKET_ALPHA);
    }
    dirty(o);
}

function smooth01(x) { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); }
function ease(cur, target, rate, dt) { return target + (cur - target) * Math.exp(-rate * dt); }
function shuffled(n, random = Math.random) {
    const a = Array.from({ length: n }, (_, i) => (i + 1) / n);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
function gauss() {
    let u = 0;
    while (u === 0) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// ── SORTING ────────────────────────────────────────────────────────
// The showpiece, after the original C++/SFML project: real algorithms
// sort live (the op list of compares / swaps / writes is recorded on a
// copy, then replayed at an adaptive rate). Compared items flash white.
// Each run uses one of the project's layouts (columns, circle, points,
// spiral, pyramid); when sorted, a wave runs across, then the items
// shuffle while the layout morphs into the next one.
const SORT_N = isMobile ? 40 : 64;
const SORT_TIME = 5.0;                   // s per sort (the op rate adapts)
const SORT_SWEEP = 1.2;                  // s: the "sorted" wave
const SORT_SHUFFLE = 1.3;                // s: shuffle + layout morph
// Value gradient: violet → magenta → orange → pale gold
const SORT_GRADIENT = [new THREE.Color(0x5b2cff), new THREE.Color(0xff3fcf), new THREE.Color(0xff9a3c), new THREE.Color(0xffe7a3)];

function opsInsertion(a) {
    const ops = [];
    for (let i = 1; i < a.length; i++) {
        for (let j = i; j > 0; j--) {
            ops.push([0, j - 1, j]);
            if (a[j - 1] <= a[j]) break;
            [a[j - 1], a[j]] = [a[j], a[j - 1]]; ops.push([1, j - 1, j]);
        }
    }
    return ops;
}
function opsQuick(a) {
    const ops = [], stack = [[0, a.length - 1]];
    while (stack.length) {
        const [lo, hi] = stack.pop();
        if (lo >= hi) continue;
        let i = lo;
        for (let j = lo; j < hi; j++) {
            ops.push([0, j, hi]);
            if (a[j] < a[hi]) { if (i !== j) { [a[i], a[j]] = [a[j], a[i]]; ops.push([1, i, j]); } i++; }
        }
        if (i !== hi) { [a[i], a[hi]] = [a[hi], a[i]]; ops.push([1, i, hi]); }
        stack.push([lo, i - 1], [i + 1, hi]);
    }
    return ops;
}
function opsHeap(a) {
    const ops = [], n = a.length;
    const sift = (start, end) => {
        let root = start;
        while (2 * root + 1 <= end) {
            const child = 2 * root + 1;
            let sw = root;
            ops.push([0, sw, child]);
            if (a[sw] < a[child]) sw = child;
            if (child + 1 <= end) { ops.push([0, sw, child + 1]); if (a[sw] < a[child + 1]) sw = child + 1; }
            if (sw === root) return;
            [a[root], a[sw]] = [a[sw], a[root]]; ops.push([1, root, sw]);
            root = sw;
        }
    };
    for (let s = Math.floor((n - 2) / 2); s >= 0; s--) sift(s, n - 1);
    for (let end = n - 1; end > 0; end--) { [a[0], a[end]] = [a[end], a[0]]; ops.push([1, 0, end]); sift(0, end - 1); }
    return ops;
}
function opsShell(a) {
    const ops = [];
    for (let gap = Math.floor(a.length / 2); gap > 0; gap = Math.floor(gap / 2.2)) {
        for (let i = gap; i < a.length; i++) {
            for (let j = i; j >= gap; j -= gap) {
                ops.push([0, j - gap, j]);
                if (a[j - gap] <= a[j]) break;
                [a[j - gap], a[j]] = [a[j], a[j - gap]]; ops.push([1, j - gap, j]);
            }
        }
    }
    return ops;
}
function opsMerge(a) {
    const ops = [];
    for (let w = 1; w < a.length; w *= 2) {
        for (let lo = 0; lo < a.length - w; lo += 2 * w) {
            const mid = lo + w, hi = Math.min(lo + 2 * w, a.length);
            const left = a.slice(lo, mid), right = a.slice(mid, hi);
            let i = 0, j = 0, k = lo;
            while (i < left.length && j < right.length) {
                ops.push([0, lo + i, mid + j]);
                a[k] = left[i] <= right[j] ? left[i++] : right[j++];
                ops.push([2, k, a[k]]); k++;
            }
            while (i < left.length) { a[k] = left[i++]; ops.push([2, k, a[k]]); k++; }
            while (j < right.length) { a[k] = right[j++]; ops.push([2, k, a[k]]); k++; }
        }
    }
    return ops;
}
function opsCocktail(a) {
    const ops = [];
    let lo = 0, hi = a.length - 1, swapped = true;
    while (swapped) {
        swapped = false;
        for (let j = lo; j < hi; j++) {
            ops.push([0, j, j + 1]);
            if (a[j] > a[j + 1]) { [a[j], a[j + 1]] = [a[j + 1], a[j]]; ops.push([1, j, j + 1]); swapped = true; }
        }
        hi--;
        for (let j = hi; j > lo; j--) {
            ops.push([0, j - 1, j]);
            if (a[j - 1] > a[j]) { [a[j - 1], a[j]] = [a[j], a[j - 1]]; ops.push([1, j - 1, j]); swapped = true; }
        }
        lo++;
    }
    return ops;
}

// Layouts: corners of item i (value v) as [x0,y0, x1,y1, x2,y2, x3,y3]
// (base-left, base-right, tip-left, tip-right) and the tip point.
const SORT_X0 = -1.18, SORT_X1 = 1.18, SORT_Y0 = -0.9, SORT_H = 1.66;
function layoutColumns(i, v, n, out) {
    const step = (SORT_X1 - SORT_X0) / n, x = SORT_X0 + (i + 0.5) * step, hw = step * 0.32, top = SORT_Y0 + 0.02 + v * SORT_H;
    out.set([x - hw, SORT_Y0, x + hw, SORT_Y0, x - hw, top, x + hw, top]); out.tx = x; out.ty = top;
}
function layoutPyramid(i, v, n, out) {
    const step = (SORT_X1 - SORT_X0) / n, x = SORT_X0 + (i + 0.5) * step, hw = step * 0.32, h = 0.01 + v * SORT_H / 2, c = -0.07;
    out.set([x - hw, c - h, x + hw, c - h, x - hw, c + h, x + hw, c + h]); out.tx = x; out.ty = c + h;
}
function layoutPoints(i, v, n, out) {
    const step = (SORT_X1 - SORT_X0) / n, x = SORT_X0 + (i + 0.5) * step, y = SORT_Y0 + 0.02 + v * SORT_H, s = 0.012;
    out.set([x - s, y - s, x + s, y - s, x - s, y + s, x + s, y + s]); out.tx = x; out.ty = y;
}
function layoutCircle(i, v, n, out) {
    const a = Math.PI / 2 - (i + 0.5) / n * Math.PI * 2, d = Math.PI / n * 0.7, r0 = 0.16, r = r0 + 0.02 + v * 0.74, cy = -0.06;
    out.set([Math.cos(a + d) * r0, cy + Math.sin(a + d) * r0, Math.cos(a - d) * r0, cy + Math.sin(a - d) * r0,
             Math.cos(a + d) * r, cy + Math.sin(a + d) * r, Math.cos(a - d) * r, cy + Math.sin(a - d) * r]);
    out.tx = Math.cos(a) * r; out.ty = cy + Math.sin(a) * r;
}
function layoutSpiral(i, v, n, out) {
    const a = Math.PI / 2 - (i + 0.5) / n * Math.PI * 2, r = 0.1 + v * 0.8, cy = -0.06, s = 0.013;
    const x = Math.cos(a) * r, y = cy + Math.sin(a) * r;
    out.set([x - s, y - s, x + s, y - s, x - s, y + s, x + s, y + s]); out.tx = x; out.ty = y;
}
const SORT_LAYOUTS = [layoutColumns, layoutCircle, layoutPoints, layoutSpiral, layoutPyramid];

function sortingViz(group) {
    const N = SORT_N;
    const ALGOS = [['QUICK SORT', opsQuick], ['INSERTION SORT', opsInsertion], ['HEAP SORT', opsHeap],
                   ['MERGE SORT', opsMerge], ['SHELL SORT', opsShell], ['COCKTAIL SHAKER SORT', opsCocktail]];
    const items = quads(group, N);
    const tips = points(group, N);
    const names = ALGOS.map(([name]) => strokeText(group, name, -1.06, 0.87, 0.065, C.magenta, 1.1, 0.75));
    const base = lineSegs(group, 2);
    brackets(group);

    let vals = shuffled(N);
    const disp = vals.slice(), hi = new Float32Array(N);
    let algo = 0, layout = 0, prevLayout = 0, ops = [], opIdx = 0, opAcc = 0, rate = 1, mode = 'sort', timer = 0;
    const la = new Float32Array(8), lb = new Float32Array(8);
    function start() {
        ops = ALGOS[algo][1](vals.slice());
        opIdx = 0; opAcc = 0; rate = ops.length / SORT_TIME; mode = 'sort'; timer = 0;
        names.forEach((t, i) => { t.obj.visible = i === algo; });
    }
    start();
    const grad = v => {
        const u = Math.min(Math.max(v, 0), 1) * (SORT_GRADIENT.length - 1), k = Math.min(Math.floor(u), SORT_GRADIENT.length - 2);
        return _c.copy(SORT_GRADIENT[k]).lerp(SORT_GRADIENT[k + 1], u - k);
    };
    const tipCol = new THREE.Color(), baseCol = new THREE.Color();

    function update(dt) {
        timer += dt;
        let morph = 1;
        if (mode === 'sort') {
            opAcc += rate * dt;
            let n = Math.floor(opAcc); opAcc -= n;
            while (n-- > 0 && opIdx < ops.length) {
                const [t, i, j] = ops[opIdx++];
                if (t === 1) { [vals[i], vals[j]] = [vals[j], vals[i]]; hi[i] = hi[j] = 1; }
                else if (t === 2) { vals[i] = j; hi[i] = 1; }
                else { hi[i] = Math.max(hi[i], 0.25); hi[j] = Math.max(hi[j], 0.25); }
            }
            if (opIdx >= ops.length) { mode = 'sweep'; timer = 0; }
        } else if (mode === 'sweep') {
            const front = timer / (SORT_SWEEP * 0.75) * (N + 8) - 4;
            for (let i = 0; i < N; i++) hi[i] = Math.max(hi[i], Math.exp(-((i - front) ** 2) / 5) * 0.9);
            if (timer >= SORT_SWEEP) {
                vals = shuffled(N); mode = 'shuffle'; timer = 0;
                prevLayout = layout; layout = (layout + 1) % SORT_LAYOUTS.length;
            }
        } else {
            morph = smooth01(timer / SORT_SHUFFLE);
            if (timer >= SORT_SHUFFLE) { algo = (algo + 1) % ALGOS.length; start(); }
        }
        const k = Math.exp(-11 * dt);
        const follow = mode === 'shuffle' ? 5 : 30;
        const A = SORT_LAYOUTS[prevLayout], B = SORT_LAYOUTS[layout];
        for (let i = 0; i < N; i++) {
            hi[i] *= k;
            disp[i] = ease(disp[i], vals[i], follow, dt);
            B(i, disp[i], N, lb);
            if (morph < 1) {
                A(i, disp[i], N, la);
                for (let c = 0; c < 8; c++) lb[c] = la[c] + (lb[c] - la[c]) * morph;
                lb.tx = la.tx + (lb.tx - la.tx) * morph; lb.ty = la.ty + (lb.ty - la.ty) * morph;
            }
            baseCol.copy(grad(disp[i]));
            tipCol.copy(baseCol).lerp(C.white, hi[i] * 0.85);
            const kt = 0.75 + hi[i] * 0.95;
            setV(items, i * 4, lb[0], lb[1], baseCol, 0.4, 0.22);
            setV(items, i * 4 + 1, lb[2], lb[3], baseCol, 0.4, 0.22);
            setV(items, i * 4 + 2, lb[4], lb[5], tipCol, kt, 0.8 + 0.2 * hi[i]);
            setV(items, i * 4 + 3, lb[6], lb[7], tipCol, kt, 0.8 + 0.2 * hi[i]);
            setV(tips, i, lb.tx, lb.ty, tipCol, 1.0 + 1.1 * hi[i], 0.8);
            tips.size[i] = 0.034 + 0.03 * hi[i];
        }
        // Baseline only under the column layouts
        const colA = prevLayout === 0 ? 1 - morph : 0, colB = layout === 0 ? morph : 0;
        const baseA = 0.4 * (colA + colB);
        setV(base, 0, SORT_X0 - 0.04, SORT_Y0, C.purple, 1, baseA); setV(base, 1, SORT_X1 + 0.04, SORT_Y0, C.purple, 1, baseA);
        dirty(items); dirty(tips); dirty(base);
    }
    return update;
}

// ── Portal rim (SORTING) ───────────────────────────────────────────
// A ring of radial ticks just outside the corner brackets: a shuffled
// array in the "circle" layout of the original. Hover sorts it (quick
// sort ops, replayed fast); after the hover it shuffles again. The lit
// share of the ticks (clockwise from the top) is the loading progress of
// the app behind the portal. hit = an invisible ring mesh: main.js
// raycasts it (via the orchestrator) for clicks and the cursor.
const RIM_N = isMobile ? 240 : 500;
export const RIM_R0 = 1.74;              // inner radius of the ticks (the bracket corners sit at 1.64)
const RIM_LEN = [0.03, 0.17];            // tick length: min + value × span
const RIM_SORT_TIME = 1.2;               // s for the hover sort
const RIM_RESHUFFLE = 1.5;               // s after the hover ends: shuffle again
const RIM_HIT = [1.5, 2.05];             // hit ring radii (a tap on the viz itself still advances the journey)
const RIM_FILL_RATE = 3;                 // 1/s: the lit share follows the loading progress
// Own random numbers: the rim must not change the seeded route (dev/camlog.html)
let rimSeed = 0x2545f491;
function rimRandom() { rimSeed = (Math.imul(rimSeed, 1664525) + 1013904223) >>> 0; return rimSeed / 4294967296; }
function portalRim(group) {
    const N = RIM_N;
    const ticks = lineSegs(group, N * 2);
    let vals = shuffled(N, rimRandom);
    const disp = vals.slice(), hi = new Float32Array(N);
    let ops = [], opIdx = 0, opAcc = 0, rate = 0, hover = false, idle = 0, progress = 0, lit = 0, time = 0;
    const geo = new THREE.RingGeometry(RIM_HIT[0], RIM_HIT[1], 96);
    const hit = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    group.add(hit);
    const col = new THREE.Color(), tip = new THREE.Color();
    const grad = v => {
        const u = Math.min(Math.max(v, 0), 1) * (SORT_GRADIENT.length - 1), k = Math.min(Math.floor(u), SORT_GRADIENT.length - 2);
        return col.copy(SORT_GRADIENT[k]).lerp(SORT_GRADIENT[k + 1], u - k);
    };
    function update(dt) {
        time += dt;
        if (hover && !ops.length && opIdx === 0) {
            ops = opsQuick(vals.slice()); opIdx = 0; opAcc = 0; rate = ops.length / RIM_SORT_TIME;
        }
        if (opIdx < ops.length) {
            opAcc += rate * dt;
            let n = Math.floor(opAcc); opAcc -= n;
            while (n-- > 0 && opIdx < ops.length) {
                const [t, i, j] = ops[opIdx++];
                if (t === 1) { [vals[i], vals[j]] = [vals[j], vals[i]]; hi[i] = hi[j] = 1; }
                else { hi[i] = Math.max(hi[i], 0.3); hi[j] = Math.max(hi[j], 0.3); }
            }
        }
        idle = hover ? 0 : idle + dt;
        if (!hover && opIdx > 0 && opIdx >= ops.length && idle > RIM_RESHUFFLE) {
            vals = shuffled(N, rimRandom); ops = []; opIdx = 0;
        }
        lit += (progress - lit) * (1 - Math.exp(-RIM_FILL_RATE * dt));
        const k = Math.exp(-9 * dt), pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
        for (let i = 0; i < N; i++) {
            hi[i] *= k;
            disp[i] = ease(disp[i], vals[i], 14, dt);
            const a = Math.PI / 2 - (i + 0.5) / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
            const r1 = RIM_R0 + RIM_LEN[0] + disp[i] * RIM_LEN[1];
            const on = (i + 0.5) / N <= lit;
            grad(disp[i]);
            tip.copy(col).lerp(C.white, hi[i] * 0.8);
            const kt = on ? 1.15 + 0.25 * pulse * (hover ? 1 : 0.4) + hi[i] : 0.55;
            setV(ticks, i * 2, c * RIM_R0, s * RIM_R0, col, on ? 0.6 : 0.3, on ? 0.35 : 0.12);
            setV(ticks, i * 2 + 1, c * r1, s * r1, tip, kt, on ? 0.9 : 0.28);
        }
        dirty(ticks);
    }
    return {
        update, hit, outerR: RIM_R0 + RIM_LEN[0] + RIM_LEN[1],
        setHover(v) { hover = v; },
        setProgress(p) { progress = Math.min(Math.max(p, 0), 1); }
    };
}

// ── CALCULATOR ─────────────────────────────────────────────────────
// A graphing calculator: grid and axes, then three functions plot
// themselves left to right with a glowing pen; roots light up as the
// pen crosses them; the last curve morphs live; all fade and repeat.
const CALC_SAMPLES = isMobile ? 140 : 220;
const CALC_DRAW = 1.7;                   // s per curve
const CALC_GAP = 0.3;
const CALC_HOLD = 3.2;
const CALC_FADE = 0.8;

function calculatorViz(group) {
    const X0 = -1.2, X1 = 1.2, MX = 6, MY = 3, SY = 0.9 / MY, SX = (X1 - X0) / (2 * MX);
    const toX = x => x * SX, toY = y => THREE.MathUtils.clamp(y * SY, -0.98, 0.98);
    // Grid, axes, ticks
    const gridN = (2 * MX + 1) + (2 * MY + 1);
    const grid = lineSegs(group, gridN * 2 + 4 + (2 * MX + 2 * MY) * 2);
    let g = 0;
    for (let x = -MX; x <= MX; x++) { setV(grid, g++, toX(x), -0.9, C.purple, 1, 0.07); setV(grid, g++, toX(x), 0.9, C.purple, 1, 0.07); }
    for (let y = -MY; y <= MY; y++) { setV(grid, g++, X0, toY(y), C.purple, 1, 0.07); setV(grid, g++, X1, toY(y), C.purple, 1, 0.07); }
    setV(grid, g++, X0 - 0.04, 0, C.pink, 1, 0.5); setV(grid, g++, X1 + 0.04, 0, C.pink, 1, 0.5);
    setV(grid, g++, 0, -0.95, C.pink, 1, 0.5); setV(grid, g++, 0, 0.95, C.pink, 1, 0.5);
    for (let x = -MX; x <= MX; x++) if (x) { setV(grid, g++, toX(x), -0.025, C.pink, 1, 0.5); setV(grid, g++, toX(x), 0.025, C.pink, 1, 0.5); }
    for (let y = -MY; y <= MY; y++) if (y) { setV(grid, g++, -0.025, toY(y), C.pink, 1, 0.5); setV(grid, g++, 0.025, toY(y), C.pink, 1, 0.5); }
    grid.g.setDrawRange(0, g);
    dirty(grid);
    brackets(group);

    let a = 1.0;                         // live parameter of the third curve
    const FUNCS = [
        { f: x => 2.4 * Math.sin(1.3 * x) * Math.exp(-x * x / 40), color: C.magenta },
        { f: x => x * x * x / 45 - 0.75 * x, color: C.cyan },
        { f: x => 1.6 * Math.sin(a * x) / (1 + 0.04 * x * x) - 0.4, color: C.amber }
    ];
    const curves = FUNCS.map(fn => {
        const r = ribbon(group, CALC_SAMPLES, 0.022);
        r.fn = fn;
        return r;
    });
    function plot(r) {
        for (let i = 0; i < CALC_SAMPLES; i++) {
            const mx = -MX + 2 * MX * i / (CALC_SAMPLES - 1);
            r.xs[i] = toX(mx); r.ys[i] = toY(r.fn.f(mx));
        }
        ribbonWrite(r, r.fn.color, 1.25, 1);
    }
    curves.forEach(plot);
    const pens = points(group, 3);
    // Root markers: up to 8 per curve
    const MAXR = 8;
    const roots = points(group, 3 * MAXR);
    let rootX = [];
    function findRoots() {
        rootX = curves.map(r => {
            const out = [];
            for (let i = 1; i < CALC_SAMPLES && out.length < MAXR; i++) {
                if ((r.ys[i - 1] > 0) !== (r.ys[i] > 0)) out.push(i);
            }
            return out;
        });
    }
    findRoots();

    let t = 0;
    const cycle = 3 * (CALC_DRAW + CALC_GAP) + CALC_HOLD + CALC_FADE;
    function update(dt) {
        t = (t + dt) % cycle;
        // Third curve morphs while it is on screen
        a = 1 + 0.45 * Math.sin(t * 0.9);
        plot(curves[2]);
        const fadeStart = cycle - CALC_FADE;
        const fade = t > fadeStart ? 1 - smooth01((t - fadeStart) / CALC_FADE) : 1;
        let ri = 0;
        curves.forEach((r, k) => {
            const t0 = k * (CALC_DRAW + CALC_GAP);
            const prog = smooth01((t - t0) / CALC_DRAW);
            const shown = prog * (CALC_SAMPLES - 1) + 1;
            ribbonReveal(r, t < t0 ? 0 : shown);
            r.obj.material.uniforms.uOpacity.value = fade;
            const drawing = t >= t0 && prog < 1;
            const i = Math.min(Math.floor(shown) - 1, CALC_SAMPLES - 1);
            setV(pens, k, r.xs[Math.max(i, 0)], r.ys[Math.max(i, 0)], _c.copy(r.fn.color).lerp(C.white, 0.6), 2.2, drawing ? 1 : 0);
            pens.size[k] = 0.075;
            for (let m = 0; m < MAXR; m++, ri++) {
                const idx = rootX[k][m];
                const on = idx !== undefined && t >= t0 && idx < shown;
                const x = on ? r.xs[idx] : 0;
                setV(roots, ri, x, 0, r.fn.color, 1.6, on ? 0.9 * fade : 0);
                roots.size[ri] = 0.055;
            }
        });
        dirty(pens); dirty(roots);
        if (t < dt) findRoots();
    }
    return update;
}

// ── MONTE CARLO ────────────────────────────────────────────────────
// Option pricing by simulation: a fan of geometric Brownian motion price
// paths grows left to right from one start point (dim, a few bright),
// and a histogram on the right fills as paths arrive, settling into a
// log-normal shape. Paths that end above the strike K glow pink.
const MC_PATHS = isMobile ? 36 : 72;
const MC_STEPS = isMobile ? 60 : 96;
const MC_BRIGHT = 5;
const MC_BINS = 24;
const MC_DELAY = 1.8;                    // start delays spread over this
const MC_DUR = 2.2;                      // s for one path to grow
const MC_HOLD = 1.0;
const MC_FADE = 0.6;
const MC_SIGMA = 0.38, MC_MU = 0.08, MC_STRIKE = 1.15;

function monteCarloViz(group) {
    const PX0 = -1.22, PX1 = 0.74, HX0 = 0.82, HW = 0.44, Y0 = -0.38, KY = 0.6;
    const yOf = S => THREE.MathUtils.clamp(Y0 + KY * (S - 1), -0.96, 0.96);
    const yK = yOf(MC_STRIKE);
    // Axes, strike line
    const axes = lineSegs(group, 4 + 40);
    setV(axes, 0, PX0, -0.97, C.purple, 1, 0.4); setV(axes, 1, PX1, -0.97, C.purple, 1, 0.4);
    setV(axes, 2, PX0, -0.97, C.purple, 1, 0.4); setV(axes, 3, PX0, 0.97, C.purple, 1, 0.4);
    for (let i = 0; i < 20; i++) {
        const x0 = PX0 + (HX0 + HW - PX0) * i / 20;
        setV(axes, 4 + i * 2, x0, yK, C.pink, 1, 0.3);
        setV(axes, 5 + i * 2, x0 + (HX0 + HW - PX0) / 40, yK, C.pink, 1, 0.3);
    }
    dirty(axes);
    strokeText(group, 'K', HX0 + HW + 0.03, yK, 0.07, C.pink, 1, 0.6);
    brackets(group);

    // Dim paths: one LineSegments; aPath = (time share, start delay)
    const nSeg = MC_PATHS * (MC_STEPS - 1) * 2;
    const dimO = attrs(nSeg);
    const dimPath = new Float32Array(nSeg * 2);
    dimO.g.setAttribute('aPath', new THREE.BufferAttribute(dimPath, 2));
    const uT = { value: 0 };
    dimO.obj = new THREE.LineSegments(dimO.g, material(PATH_VERT, FRAG, { uT, uDur: { value: MC_DUR } }));
    group.add(dimO.obj);
    // Bright paths: ribbons with the same growth shader
    const bright = [];
    for (let b = 0; b < MC_BRIGHT; b++) {
        bright.push(ribbon(group, MC_STEPS, 0.02, PATH_VERT, { uT, uDur: { value: MC_DUR } }, { name: 'aPath', size: 2 }));
    }
    const start = points(group, 1);
    setV(start, 0, PX0, Y0, C.white, 2, 1); start.size[0] = 0.09; dirty(start);
    // Histogram and its log-normal density
    const bars = quads(group, MC_BINS);
    const pdf = lineStrip(group, 64);
    const pdfW = new Float32Array(64);       // alpha weight: no line where the density is ~0
    const binH = 1.92 / MC_BINS, binOf = y => Math.min(MC_BINS - 1, Math.max(0, Math.floor((y + 0.96) / binH)));
    const count = new Float32Array(MC_BINS), shown = new Float32Array(MC_BINS);
    let maxCount = 1, ends = [], delays = [], arrived = [];
    let t = 0;
    const cycle = MC_DELAY + MC_DUR + MC_HOLD + MC_FADE;

    function generate() {
        const dt = 1 / (MC_STEPS - 1);
        ends = []; delays = []; arrived = [];
        const finals = new Float32Array(MC_BINS);
        const brightSet = new Set();
        while (brightSet.size < MC_BRIGHT) brightSet.add(Math.floor(Math.random() * MC_PATHS));
        let bi = 0, v = 0;
        for (let p = 0; p < MC_PATHS; p++) {
            const delay = MC_DELAY * p / MC_PATHS + Math.random() * 0.1;
            const ys = new Float32Array(MC_STEPS);
            let lnS = 0;
            for (let k = 0; k < MC_STEPS; k++) {
                if (k) lnS += (MC_MU - MC_SIGMA * MC_SIGMA / 2) * dt + MC_SIGMA * Math.sqrt(dt) * gauss();
                ys[k] = yOf(Math.exp(lnS));
            }
            const S = Math.exp(lnS), itm = S > MC_STRIKE;
            ends.push(ys[MC_STEPS - 1]); delays.push(delay); arrived.push(false);
            finals[binOf(ys[MC_STEPS - 1])]++;
            const col = itm ? C.magenta : C.purple, k = itm ? 0.9 : 0.8, al = itm ? 0.2 : 0.11;
            for (let s = 0; s < MC_STEPS - 1; s++) {
                for (const e of [0, 1]) {
                    setV(dimO, v, PX0 + (PX1 - PX0) * (s + e) / (MC_STEPS - 1), ys[s + e], col, k, al);
                    dimPath[v * 2] = (s + e) / (MC_STEPS - 1); dimPath[v * 2 + 1] = delay;
                    v++;
                }
            }
            if (brightSet.has(p)) {
                const r = bright[bi++];
                const ap = r.g.attributes.aPath.array;
                for (let s = 0; s < MC_STEPS; s++) {
                    r.xs[s] = PX0 + (PX1 - PX0) * s / (MC_STEPS - 1); r.ys[s] = ys[s];
                    for (let e = 0; e < 3; e++) { ap[(s * 3 + e) * 2] = s / (MC_STEPS - 1); ap[(s * 3 + e) * 2 + 1] = delay; }
                }
                ribbonWrite(r, _c.copy(itm ? C.magenta : C.cyan).lerp(C.white, 0.25), 1.05, 0.9);
                r.g.attributes.aPath.needsUpdate = true;
            }
        }
        dirty(dimO); dimO.g.attributes.aPath.needsUpdate = true;
        maxCount = Math.max(...finals, 1);
        count.fill(0);
        // Log-normal density of S_T, scaled to the expected peak bar
        const m = (MC_MU - MC_SIGMA * MC_SIGMA / 2), sd = MC_SIGMA;
        let peak = 0;
        const dens = [];
        for (let i = 0; i < 64; i++) {
            const y = -0.96 + 1.92 * i / 63, S = 1 + (y - Y0) / KY;
            const d = S > 0.01 ? Math.exp(-((Math.log(S) - m) ** 2) / (2 * sd * sd)) / (S * sd) : 0;
            dens.push([y, d]); peak = Math.max(peak, d);
        }
        dens.forEach(([y, d], i) => { setV(pdf, i, HX0 + HW * 0.95 * d / peak, y, C.white, 0.9, 0); pdfW[i] = Math.min(1, 12 * d / peak); });
        dirty(pdf);
    }
    generate();

    function update(dt) {
        t += dt;
        if (t >= cycle) { t -= cycle; generate(); }
        uT.value = t;
        const fade = t > cycle - MC_FADE ? 1 - smooth01((t - (cycle - MC_FADE)) / MC_FADE) : 1;
        let nArr = 0;
        for (let p = 0; p < MC_PATHS; p++) {
            if (!arrived[p] && t >= delays[p] + MC_DUR) { arrived[p] = true; count[binOf(ends[p])]++; }
            if (arrived[p]) nArr++;
        }
        for (let b = 0; b < MC_BINS; b++) {
            shown[b] = ease(shown[b], count[b], 10, dt);
            const y0 = -0.96 + b * binH + binH * 0.12, y1 = y0 + binH * 0.76;
            const len = HW * shown[b] / maxCount;
            const above = (y0 + y1) / 2 > yK;
            const col = above ? C.magenta : C.purple;
            // Horizontal bar: left edge dim, right edge bright (quad rotated: use x as "height")
            setV(bars, b * 4, HX0, y0, col, 0.4, 0.25);
            setV(bars, b * 4 + 1, HX0 + len, y0, col, 1.1, 0.85);
            setV(bars, b * 4 + 2, HX0, y1, col, 0.4, 0.25);
            setV(bars, b * 4 + 3, HX0 + len, y1, col, 1.1, 0.85);
        }
        dirty(bars);
        const pa = pdf.alp, frac = nArr / MC_PATHS;
        for (let i = 0; i < 64; i++) pa[i] = 0.55 * frac * frac * pdfW[i];
        pdf.g.attributes.aAlpha.needsUpdate = true;
        for (const o of [dimO, ...bright, bars, pdf, start]) o.obj.material.uniforms.uOpacity.value = fade;
    }
    return update;
}

// ── BALANCER ───────────────────────────────────────────────────────
// Consistent hashing: a hash ring, five servers on it, each owning the
// arc before it (ring coloured by owner). Requests fly from the clients
// on the left to their hash point, then slide along the ring to the next
// live server, which flashes and grows its load bar. Now and then a
// server fails its health check: its arc joins the next server's.
const LB_POOL = isMobile ? 24 : 40;
const LB_RATE = 7;                       // requests per second
const LB_RING_PTS = 160;

function balancerViz(group) {
    const CX = 0.05, CY = -0.02, R = 0.78;
    const SERVERS = [0.35, 1.55, 2.7, 3.95, 5.3];
    const COLS = [C.magenta, C.cyan, C.amber, C.pink, new THREE.Color(0x9a66ff)];
    const up = SERVERS.map(() => true);
    const load = new Float32Array(SERVERS.length), flash = new Float32Array(SERVERS.length);
    const ring = lineStrip(group, LB_RING_PTS + 1);
    const ticks = lineSegs(group, 64);
    for (let i = 0; i < 32; i++) {
        const a = i / 32 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        setV(ticks, i * 2, CX + c * (R - 0.03), CY + s * (R - 0.03), C.purple, 1, 0.3);
        setV(ticks, i * 2 + 1, CX + c * (R - 0.07), CY + s * (R - 0.07), C.purple, 1, 0.3);
    }
    dirty(ticks);
    const client = lineSegs(group, 2);
    setV(client, 0, -1.22, -0.85, C.purple, 1, 0.4); setV(client, 1, -1.22, 0.85, C.purple, 1, 0.4); dirty(client);
    const srv = points(group, SERVERS.length);
    const bars = lineSegs(group, SERVERS.length * 2);
    const req = points(group, LB_POOL);
    const tails = lineSegs(group, LB_POOL * 2);
    brackets(group);

    const owner = a => {                 // next live server at or after angle a
        let best = -1, bestD = Infinity;
        SERVERS.forEach((sa, i) => {
            if (!up[i]) return;
            const d = ((sa - a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            if (d < bestD) { bestD = d; best = i; }
        });
        return best;
    };
    function paintRing() {
        for (let i = 0; i <= LB_RING_PTS; i++) {
            const a = i / LB_RING_PTS * Math.PI * 2;
            setV(ring, i, CX + Math.cos(a) * R, CY + Math.sin(a) * R, COLS[owner(a)], 0.9, 0.55);
        }
        dirty(ring);
    }
    paintRing();

    const pool = Array.from({ length: LB_POOL }, () => ({ live: false }));
    let spawnAcc = 0, t = 0, downIdx = -1, downT = 0, nextFail = 4;
    function update(dt) {
        t += dt;
        // Health checks: one server fails for a while, then recovers
        if (downIdx < 0 && t >= nextFail) { downIdx = Math.floor(Math.random() * SERVERS.length); up[downIdx] = false; downT = 0; paintRing(); }
        if (downIdx >= 0 && (downT += dt) > 2.8) { up[downIdx] = true; downIdx = -1; nextFail = t + 4 + Math.random() * 2; paintRing(); }
        spawnAcc += LB_RATE * dt;
        while (spawnAcc >= 1) {
            spawnAcc--;
            const r = pool.find(p => !p.live);
            if (!r) break;
            r.live = true; r.phase = 0; r.u = 0;
            r.sx = -1.22; r.sy = (Math.random() * 2 - 1) * 0.8;
            r.h = Math.random() * Math.PI * 2;
            r.x = r.sx; r.y = r.sy; r.px = r.x; r.py = r.y;
        }
        pool.forEach((r, i) => {
            if (!r.live) { setV(req, i, 0, 0, C.white, 0, 0); setV(tails, i * 2, 0, 0, C.white, 0, 0); setV(tails, i * 2 + 1, 0, 0, C.white, 0, 0); return; }
            r.px = r.x; r.py = r.y;
            const hx = CX + Math.cos(r.h) * R, hy = CY + Math.sin(r.h) * R;
            if (r.phase === 0) {
                r.u = Math.min(r.u + dt / 0.7, 1);
                const e = smooth01(r.u), cx = (r.sx + hx) / 2, cy = r.sy * 0.3 + hy * 0.7 + 0.25;
                r.x = (1 - e) * (1 - e) * r.sx + 2 * (1 - e) * e * cx + e * e * hx;
                r.y = (1 - e) * (1 - e) * r.sy + 2 * (1 - e) * e * cy + e * e * hy;
                if (r.u >= 1) { r.phase = 1; r.a = r.h; r.target = owner(r.h); }
            } else {
                const ta = SERVERS[r.target];
                if (!up[r.target]) r.target = owner(r.a);
                const d = ((SERVERS[r.target] - r.a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                const stepA = 2.6 * dt;
                if (d <= stepA || ta === undefined) {
                    load[r.target] += 1; flash[r.target] = 1; r.live = false;
                } else r.a += stepA;
                r.x = CX + Math.cos(r.a) * R; r.y = CY + Math.sin(r.a) * R;
            }
            const col = r.phase === 1 ? COLS[r.target] : C.white;
            setV(req, i, r.x, r.y, _c.copy(col).lerp(C.white, 0.5), 1.8, 1);
            req.size[i] = 0.05;
            const vx = r.x - r.px, vy = r.y - r.py, l = Math.hypot(vx, vy) || 1;
            const tl = Math.min(0.12, l * 4);
            setV(tails, i * 2, r.x, r.y, col, 1.2, 0.8);
            setV(tails, i * 2 + 1, r.x - vx / l * tl, r.y - vy / l * tl, col, 1.2, 0);
        });
        SERVERS.forEach((a, i) => {
            load[i] *= Math.exp(-0.6 * dt);
            flash[i] *= Math.exp(-6 * dt);
            const c = Math.cos(a), s = Math.sin(a);
            const col = up[i] ? COLS[i] : C.red;
            setV(srv, i, CX + c * R, CY + s * R, _c.copy(col).lerp(C.white, 0.3 + 0.5 * flash[i]), up[i] ? 1.6 + 1.5 * flash[i] : 0.6, up[i] ? 1 : 0.5);
            srv.size[i] = 0.13 + 0.08 * flash[i];
            const L = Math.min(0.42, 0.05 * load[i]);
            setV(bars, i * 2, CX + c * (R + 0.1), CY + s * (R + 0.1), col, 1.2, up[i] ? 0.9 : 0);
            setV(bars, i * 2 + 1, CX + c * (R + 0.1 + L), CY + s * (R + 0.1 + L), col, 1.2, up[i] ? 0.9 : 0);
        });
        dirty(req); dirty(tails); dirty(srv); dirty(bars);
    }
    return update;
}

// ── FLOW ───────────────────────────────────────────────────────────
// A workout tracker: a rest timer sweeps round; each finished set fills
// a dot and grows today's volume bar; after five sets the next day
// starts. Below, acute vs chronic training load (ACWR) scrolls by, with
// the safe band shaded.
const FLOW_TIMER = 2.4;                  // s per set
const FLOW_SETS = 5;
const FLOW_ACWR_PTS = isMobile ? 80 : 140;

function flowViz(group) {
    const TX = -0.68, TY = 0.32, TR = 0.46;
    const dial = lineStrip(group, 97);
    for (let i = 0; i <= 96; i++) {
        const a = i / 96 * Math.PI * 2;
        setV(dial, i, TX + Math.cos(a) * TR, TY + Math.sin(a) * TR, C.purple, 1, 0.3);
    }
    dirty(dial);
    const arc = ribbon(group, 97, 0.035);
    for (let i = 0; i <= 96; i++) {
        const a = Math.PI / 2 - i / 96 * Math.PI * 2;      // from the top, clockwise
        arc.xs[i] = TX + Math.cos(a) * TR; arc.ys[i] = TY + Math.sin(a) * TR;
    }
    ribbonWrite(arc, null, 1.3, 1, i => _c.copy(C.purple).lerp(C.magenta, i / 96).clone());
    const head = points(group, 1 + FLOW_SETS);
    // Weekly volume bars
    const BX0 = 0.08, BX1 = 1.2, BY = -0.18, BH = 0.95;
    const bars = quads(group, 7);
    const vol = new Float32Array(7), shownVol = new Float32Array(7);
    const base = lineSegs(group, 2 + 6 + 4);
    setV(base, 0, BX0 - 0.03, BY, C.purple, 1, 0.45); setV(base, 1, BX1 + 0.03, BY, C.purple, 1, 0.45);
    // ACWR band
    const AY0 = -0.95, AY1 = -0.42, val2y = v => AY0 + (v - 0.5) / 1.1 * (AY1 - AY0);
    for (const [k, v] of [[2, 0.8], [4, 1.3]]) {
        setV(base, k, -1.2, val2y(v), C.cyan, 1, 0.22); setV(base, k + 1, 1.2, val2y(v), C.cyan, 1, 0.22);
    }
    setV(base, 6, -1.2, AY0, C.purple, 1, 0.35); setV(base, 7, 1.2, AY0, C.purple, 1, 0.35);
    base.g.setDrawRange(0, 8);
    dirty(base);
    const acute = ribbon(group, FLOW_ACWR_PTS, 0.02);
    const chronic = lineStrip(group, FLOW_ACWR_PTS);
    brackets(group);

    let t = 0, sets = 0, day = 3, scroll = 0, setFlash = 0;
    for (let d = 0; d < day; d++) vol[d] = 0.45 + Math.random() * 0.45;   // a week already under way
    const acuteF = x => 1.05 + 0.22 * Math.sin(1.7 * x) + 0.11 * Math.sin(4.3 * x + 1) + 0.07 * Math.sin(9.1 * x + 2);
    const chronicF = x => 1.02 + 0.08 * Math.sin(0.55 * x + 0.5);
    function update(dt) {
        t += dt;
        const cyc = FLOW_TIMER + 0.5;
        if (t >= cyc) {
            t -= cyc; sets++; setFlash = 1;
            vol[day] += 0.12 + Math.random() * 0.1;
            if (sets >= FLOW_SETS) {
                sets = 0; day++;
                if (day >= 7) { day = 0; vol.fill(0); }
            }
        }
        setFlash *= Math.exp(-4 * dt);
        const prog = smooth01(Math.min(t / FLOW_TIMER, 1));
        ribbonReveal(arc, prog * 96 + 1);
        arc.obj.material.uniforms.uOpacity.value = 1 + 1.5 * setFlash;
        const hi = Math.min(Math.floor(prog * 96), 96);
        setV(head, 0, arc.xs[hi], arc.ys[hi], C.white, 2.2, t < FLOW_TIMER ? 1 : 0);
        head.size[0] = 0.08;
        for (let s = 0; s < FLOW_SETS; s++) {
            const on = s < sets;
            setV(head, 1 + s, TX - 0.32 + s * 0.16, TY - TR - 0.2, on ? C.magenta : C.purple, on ? 1.6 : 0.8, on ? 1 : 0.35);
            head.size[1 + s] = on ? 0.07 : 0.05;
        }
        dirty(head);
        const step = (BX1 - BX0) / 7;
        for (let d = 0; d < 7; d++) {
            shownVol[d] = ease(shownVol[d], vol[d], 6, dt);
            const x0 = BX0 + d * step + step * 0.2, x1 = x0 + step * 0.6;
            const today = d === day;
            _c.copy(today ? C.magenta : C.purple);
            setQuad(bars, d, x0, BY, x1, BY + 0.005 + shownVol[d] * BH, _c, 0.35, 0.15, today ? _c.clone().lerp(C.white, 0.3 * setFlash) : _c, today ? 1.2 + setFlash : 0.85, 0.8);
        }
        dirty(bars);
        scroll += dt * 0.7;
        for (let i = 0; i < FLOW_ACWR_PTS; i++) {
            const u = i / (FLOW_ACWR_PTS - 1), x = -1.2 + 2.4 * u, tt = scroll + u * 4;
            acute.xs[i] = x; acute.ys[i] = val2y(acuteF(tt));
            setV(chronic, i, x, val2y(chronicF(tt)), C.purple, 1, 0.55);
        }
        ribbonWrite(acute, C.magenta, 1.2, 1);
        dirty(chronic);
    }
    return update;
}

// ── NEAT ───────────────────────────────────────────────────────────
// A small evolving network: inputs, an irregular hidden layer, outputs.
// Signals flow along the links; nodes flash as they arrive; the winning
// output glows.
// Every few seconds a mutation adds a link (it flashes in) or disables
// one (it fades out), as NEAT does.
const NEAT_MUTATE = 2.6;                 // s between mutations
const NEAT_PASS = 1.4;                   // s for a signal to cross one link

function neatViz(group) {
    const nodes = [];
    const add = (x, y, layer) => nodes.push({ x, y, layer, act: 0 });
    [-0.66, -0.22, 0.22, 0.66].forEach(y => add(-1.1, y, 0));
    [[-0.32, 0.7], [-0.1, 0.18], [-0.38, -0.32], [0.3, 0.45], [0.22, -0.62]].forEach(([x, y]) => add(x, y, 1));
    [0.32, -0.32].forEach(y => add(1.1, y, 2));
    const edges = [];
    const link = (a, b, on = 1) => edges.push({ a, b, w: (Math.random() * 2 - 1) || 0.5, alpha: on, target: on, born: 0 });
    [[0, 4], [0, 5], [1, 5], [1, 6], [2, 6], [3, 6], [3, 8], [4, 7], [5, 7], [5, 8], [6, 8], [7, 9], [7, 10], [8, 10], [2, 4], [0, 9], [3, 10], [6, 10]]
        .forEach(([a, b]) => link(a, b));
    const MAXE = 30;
    const lines = lineSegs(group, MAXE * 2);
    const pulses = points(group, MAXE);
    const dots = points(group, nodes.length);
    brackets(group);

    let t = 0, mt = 0;
    function mutate() {
        const live = edges.filter(e => e.target > 0);
        if (live.length > 16 && Math.random() < 0.5) {
            live[Math.floor(Math.random() * live.length)].target = 0;
        } else {
            for (let tries = 0; tries < 20; tries++) {
                const a = Math.floor(Math.random() * nodes.length), b = Math.floor(Math.random() * nodes.length);
                if (nodes[a].x >= nodes[b].x - 0.2) continue;
                const ex = edges.find(e => e.a === a && e.b === b);
                if (ex) { if (ex.target === 0) { ex.target = 1; ex.born = 1; break; } continue; }
                if (edges.length >= MAXE) {
                    const dead = edges.findIndex(e => e.target === 0 && e.alpha < 0.01);
                    if (dead < 0) break;
                    edges.splice(dead, 1);
                }
                link(a, b, 0); edges[edges.length - 1].target = 1; edges[edges.length - 1].born = 1;
                break;
            }
        }
    }
    function update(dt) {
        t += dt; mt += dt;
        if (mt >= NEAT_MUTATE) { mt -= NEAT_MUTATE; mutate(); }
        nodes.forEach(n => { n.act *= Math.exp(-3 * dt); });
        // Winner: the output with the larger summed input weight this pass
        let win = 9;
        const sum = [0, 0];
        edges.forEach(e => { if (e.b >= 9 && e.target > 0) sum[e.b - 9] += e.w; });
        win = sum[0] >= sum[1] ? 9 : 10;
        for (let i = 0; i < MAXE; i++) {
            const e = edges[i];
            if (!e) { setV(lines, i * 2, 0, 0, C.white, 0, 0); setV(lines, i * 2 + 1, 0, 0, C.white, 0, 0); setV(pulses, i, 0, 0, C.white, 0, 0); continue; }
            e.alpha = ease(e.alpha, e.target, 2.2, dt);
            e.born *= Math.exp(-2 * dt);
            const A = nodes[e.a], B = nodes[e.b];
            const col = e.w >= 0 ? C.magenta : C.cyan;
            const base = (0.18 + 0.32 * Math.abs(e.w)) * e.alpha;
            const k = 1 + 2.5 * e.born;
            setV(lines, i * 2, A.x, A.y, _c.copy(col).lerp(C.white, e.born), k, base + 0.6 * e.born);
            setV(lines, i * 2 + 1, B.x, B.y, _c, k, base + 0.6 * e.born);
            // Signals flow along every live edge, each with its own phase;
            // the target node flashes when one arrives
            const prevU = e.u ?? Math.random();
            e.u = (prevU + dt / NEAT_PASS * (0.8 + 0.4 * Math.abs(e.w))) % 1;
            if (e.u < prevU && e.alpha > 0.3) B.act = Math.min(1, B.act + 0.7);
            const u = e.u;
            const on = e.alpha * Math.sin(Math.PI * u) ** 0.5;
            setV(pulses, i, A.x + (B.x - A.x) * u, A.y + (B.y - A.y) * u, _c.copy(col).lerp(C.white, 0.4), 1.8, on);
            pulses.size[i] = 0.05;
        }
        nodes.forEach((n, i) => {
            const isOut = n.layer === 2, glow = isOut && i === win ? 0.6 : 0;
            const col = n.layer === 0 ? C.cyan : n.layer === 2 ? C.magenta : C.pink;
            setV(dots, i, n.x, n.y, _c.copy(col).lerp(C.white, 0.3 + 0.4 * n.act), 1.2 + 1.5 * n.act + glow * 2, 1);
            dots.size[i] = (isOut ? 0.14 : 0.1) + 0.05 * n.act + 0.04 * glow;
        });
        dirty(lines); dirty(pulses); dirty(dots);
    }
    return update;
}

// ── Factory ────────────────────────────────────────────────────────
const BUILDERS = {
    'SORTING': sortingViz,
    'CALCULATOR': calculatorViz,
    'MONTE CARLO': monteCarloViz,
    'BALANCER': balancerViz,
    'FLOW': flowViz,
    'NEAT': neatViz
};
const PREWARM = 2.0;                     // s simulated at build, so a viz never starts empty

// title / skills: a title and a smaller skills line under the viz
// (fly-bys; project stops get their label from world.js, traced by the comet)
const FLYBY_TITLE_H = 0.2;
const FLYBY_SKILLS_H = 0.1;
const FLYBY_TEXT_W = 2 * HALF_W;         // both lines fit the viz width
export const FLYBY_TEXT_BOTTOM = -HALF_H - 0.62; // lowest text y (local units)
// portal: a stop with an app behind it gets a rim (portalRim, SORTING only for now)
export function buildProjectViz(label, { title = null, skills = null, portal = false } = {}) {
    pxScale = window.innerHeight * renderer.getPixelRatio() / (2 * Math.tan(Math.PI / 6));
    const group = new THREE.Group();
    const vis = curVis = { value: 1 };
    const builder = BUILDERS[label];
    const own = builder ? builder(group) : () => {};
    const rim = portal ? portalRim(group) : null;
    const update = rim ? dt => { own(dt); rim.update(dt); } : own;
    const centred = t => {               // strokeText puts the left edge at x = 0
        let maxX = -Infinity;
        for (let i = 0; i < t.n; i++) maxX = Math.max(maxX, t.pos[i * 3]);
        t.obj.position.x = -maxX / 2;
    };
    if (title) centred(strokeText(group, title, 0, -HALF_H - 0.27, FLYBY_TITLE_H, C.magenta, 1.5, 1, FLYBY_TEXT_W));
    if (skills) centred(strokeText(group, skills, 0, -HALF_H - 0.55, FLYBY_SKILLS_H, C.pink, 1.0, 0.75, FLYBY_TEXT_W));
    for (let t = 0; t < PREWARM; t += 1 / 30) update(1 / 30);
    group.traverse(o => { o.frustumCulled = false; });
    // v = 0..1: fade with distance; `shown` = allowed at all (inside the tunnel)
    const setVisibility = (v, shown) => { vis.value = v; group.visible = shown && v > 0.002; };
    return { group, halfW: HALF_W, halfH: HALF_H, update, setVisibility, rim };
}
