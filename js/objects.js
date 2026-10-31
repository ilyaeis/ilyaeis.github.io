// Procedural Gaussian-splat objects for the "R&D universe".
// buildObject(name, { count, rng }) returns a SplatMesh: about 1 unit tall,
// origin at the base centre, +Y up, front facing +Z.
// mesh.userData.idle(t) is a cheap idle animation (call it every frame).
import * as THREE from 'three';
import { SplatMesh, PackedSplats } from '@sparkjsdev/spark';

export const OBJECT_NAMES = ['cherry', 'robot', 'vase', 'chair', 'board', 'gpu'];

// ---------- small math helpers ----------
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * t;
const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hex = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const X = V3(1, 0, 0), Z = V3(0, 0, 1);

export function mulberry32(seed = 1) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- baked lighting (splats are unlit) ----------
const KEY = V3(-0.45, 0.75, 0.55).normalize();
const FILL = V3(0.8, 0.15, 0.35).normalize();
const VIEW = V3(0, 0.25, 1).normalize();
const HALF = KEY.clone().add(VIEW).normalize();
// m: { amb, dif, spec, shin, rim, two } ; returns [r,g,b]
function shade(c, n, m = {}) {
  const amb = m.amb ?? 0.34, dif = m.dif ?? 0.78, spec = m.spec ?? 0.12, shin = m.shin ?? 24;
  let nn = n;
  if (m.two && n.dot(VIEW) < 0) nn = n.clone().negate();
  const d = Math.max(0, nn.dot(KEY)), f = Math.max(0, nn.dot(FILL));
  const hemi = 0.75 + 0.25 * nn.y;
  const s = spec * Math.pow(Math.max(0, nn.dot(HALF)), shin);
  const rim = (m.rim ?? 0.12) * Math.pow(1 - Math.abs(nn.dot(VIEW)), 3);
  const l = amb * hemi + dif * d + 0.22 * f;
  return [c[0] * l + s + rim * 0.6, c[1] * l + s + rim * 0.75, c[2] * l + s + rim];
}

// ---------- splat sink ----------
class Sink {
  constructor(rng) { this.rng = rng; this.a = []; this.q = new THREE.Quaternion(); }
  raw(p, sx, sy, sz, q, op, c) {
    this.a.push([p.x, p.y, p.z, sx, sy, sz, q.x, q.y, q.z, q.w, op, clamp01(c[0]), clamp01(c[1]), clamp01(c[2])]);
  }
  jit(c, amt = 0.05) { const r = this.rng, k = 1 + (r() - 0.5) * amt; return [c[0] * k * (1 + (r() - 0.5) * amt * 0.4), c[1] * k, c[2] * k * (1 + (r() - 0.5) * amt * 0.4)]; }
  // flat disc aligned to normal n
  flat(p, n, s, c, op = 1, thick = 0.15, sy = s) {
    this.q.setFromUnitVectors(Z, n);
    this.raw(p, s, sy, s * thick, this.q, op, c);
  }
  // elongated along tangent t
  stick(p, t, len, r, c, op = 1) {
    this.q.setFromUnitVectors(X, t.clone().normalize());
    this.raw(p, len, r, r, this.q, op, c);
  }
  ball(p, r, c, op = 1) { this.raw(p, r, r, r, this.q.identity(), op, c); }
  get length() { return this.a.length; }
}

// ---------- parametric surface part ----------
// f(u,v) -> Vector3 ; mask(u,v) -> bool ; color(p,n,u,v) -> [r,g,b] (base)
// Normal = (df/du x df/dv) * (flip ? -1 : 1).
function surf(o) {
  const { f, mask = null, flip = false } = o;
  const e = 1e-4;
  const jac = (u, v, out) => {
    const p = f(u, v);
    const du = f(Math.min(1, u + e), v).sub(f(Math.max(0, u - e), v));
    const dv = f(u, Math.min(1, v + e)).sub(f(u, Math.max(0, v - e)));
    const n = du.cross(dv);
    const j = n.length() / (4 * e * e);
    out.p = p; out.n = j > 0 ? n.normalize().multiplyScalar(flip ? -1 : 1) : V3(0, 1, 0); out.j = j;
    return out;
  };
  // tabulate the Jacobian on a grid; sample by inverting the CDF (rejection-free,
  // stratified with an R2 sequence) so the surface density is even, with few holes
  const GU = o.gu ?? 64, GV = o.gv ?? 64, tmp = {};
  const J = new Float64Array(GU * GV), rowSum = new Float64Array(GU);
  for (let i = 0; i < GU; i++) for (let j = 0; j < GV; j++) {
    const u = (i + 0.5) / GU, v = (j + 0.5) / GV;
    const val = mask && !mask(u, v) ? 0 : jac(u, v, tmp).j;
    J[i * GV + j] = val; rowSum[i] += val;
  }
  const rowCdf = new Float64Array(GU + 1);
  for (let i = 0; i < GU; i++) rowCdf[i + 1] = rowCdf[i] + rowSum[i];
  const area = rowCdf[GU] / (GU * GV);
  const pick = (cdf, lo, nn, x, get) => { // binary search, returns fractional index
    let a = 0, b = nn - 1;
    while (a < b) { const m = (a + b) >> 1; if (get(m + 1) - cdf < x) a = m + 1; else b = m; }
    const w = get(a + 1) - get(a);
    return a + (w > 0 ? (x - (get(a) - cdf)) / w : 0.5);
  };
  return {
    area, w: o.w ?? 1, fixed: o.fixed, min: o.min,
    emit(S, n) {
      const r = S.rng, s0 = (o.k ?? 0.6) * Math.sqrt(area / Math.max(1, n));
      const out = {}; let made = 0, g = 0;
      const ou = r(), ov = r();
      while (made < n && g++ < n * 4) {
        const su = (ou + g * 0.7548776662) % 1, sv = (ov + g * 0.5698402910) % 1;
        const fi = pick(0, 0, GU, su * rowCdf[GU], k => rowCdf[k]);
        const i = Math.min(GU - 1, Math.floor(fi));
        let acc = 0; const row = i * GV, cum = [0];
        for (let j = 0; j < GV; j++) { acc += J[row + j]; cum.push(acc); }
        const fj = pick(0, 0, GV, sv * acc, k => cum[k]);
        const u = Math.min(1, fi / GU), v = Math.min(1, fj / GV);
        if (mask && !mask(u, v)) continue;
        jac(u, v, out);
        let c = o.color(out.p, out.n, u, v, r);
        if (!c) continue;
        if (!o.emissive && !c[3]) c = shade(c, out.n, o.mat);
        c = S.jit(c, o.jitter ?? 0.06);
        const s = s0 * (0.85 + 0.3 * r());
        const p = o.disp ? out.p.addScaledVector(out.n, o.disp(out.p, u, v)) : out.p;
        S.flat(p, out.n, s, c, o.opacity ?? 1, o.thick ?? 0.18);
        made++;
      }
    },
  };
}

// rounded box: centre c, half extents h, corner radius rad, optional quaternion
function roundBox(o) {
  const { c, h, rad = 0.02, q = new THREE.Quaternion() } = o;
  const faces = [];
  const ax = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
  for (const [i, j, k] of ax) for (const sg of [-1, 1]) faces.push({ i, j, k, sg, a: 4 * h.getComponent(j) * h.getComponent(k) });
  if (o.skip) for (const sk of o.skip) faces.splice(faces.findIndex(F => F.i === sk[0] && F.sg === sk[1]), 1);
  const area = faces.reduce((s, F) => s + F.a, 0);
  const inner = h.clone().subScalar(rad);
  return {
    area, w: o.w ?? 1, fixed: o.fixed, min: o.min,
    emit(S, n) {
      // the back face (-Z) is rarely seen: fewer, larger splats there
      const r = S.rng, fw = F => F.a * (F.i === 2 && F.sg < 0 ? 0.45 : 1);
      const wsum = faces.reduce((a, F) => a + fw(F), 0);
      let carry = 0;
      for (const F of faces) {
        carry += n * fw(F) / wsum; const nf = Math.floor(carry); carry -= nf;
        const s0 = (o.k ?? 0.55) * Math.sqrt(F.a / Math.max(1, nf));
        const ou = r(), ov = r();
        for (let m = 0, g = 0; m < nf && g < nf * 20; g++) {
          const p = V3();
          p.setComponent(F.i, F.sg * h.getComponent(F.i));
          p.setComponent(F.j, (((ou + g * 0.7548776662) % 1) * 2 - 1) * h.getComponent(F.j));
          p.setComponent(F.k, (((ov + g * 0.5698402910) % 1) * 2 - 1) * h.getComponent(F.k));
          const cl = V3(Math.max(-inner.x, Math.min(inner.x, p.x)), Math.max(-inner.y, Math.min(inner.y, p.y)), Math.max(-inner.z, Math.min(inner.z, p.z)));
          const d = p.clone().sub(cl);
          const nl = d.lengthSq() > 1e-12 ? d.normalize() : V3().setComponent(F.i, F.sg);
          const pl = cl.add(nl.clone().multiplyScalar(rad));
          const pw = pl.clone().applyQuaternion(q).add(c), nw = nl.clone().applyQuaternion(q);
          let col = o.color(pw, nw, pl, nl, r);
          if (!col) continue;
          if (!o.emissive && !col[3]) col = shade(col, nw, o.mat);
          S.flat(pw, nw, s0 * (0.85 + 0.3 * r()), S.jit(col, o.jitter ?? 0.06), o.opacity ?? 1, o.thick ?? 0.18);
          m++;
        }
      }
    },
  };
}

// thin curve drawn with elongated Gaussians; curve(t) -> Vector3
function wire(o) {
  const { curve, r = 0.008 } = o;
  let len = 0, prev = curve(0);
  for (let i = 1; i <= 64; i++) { const p = curve(i / 64); len += p.distanceTo(prev); prev = p; }
  return {
    area: len * r * 6, w: o.w ?? 1, fixed: o.fixed, min: o.min, len,
    emit(S, n) {
      const seg = len / Math.max(1, n);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, p = curve(t);
        const tg = curve(Math.min(1, t + 0.003)).sub(curve(Math.max(0, t - 0.003))).normalize();
        let c = o.color(p, t, S.rng);
        if (!o.emissive) {
          const lit = Math.sqrt(Math.max(0, 1 - tg.dot(KEY) ** 2));
          const k = (o.mat?.amb ?? 0.35) + (o.mat?.dif ?? 0.75) * lit;
          c = [c[0] * k, c[1] * k, c[2] * k];
        }
        S.stick(p, tg, seg * (o.over ?? 0.75), r * (o.taper ? o.taper(t) : 1), S.jit(c, 0.05), o.opacity ?? 1);
      }
    },
  };
}

// glow halo: a few large faint balls around a point
function halo(p, R, c, op = 0.12, n = 3) {
  return { area: 0, fixed: n, emit(S, m) { for (let i = 0; i < m; i++) S.ball(p, R * (0.6 + 0.6 * i / Math.max(1, m - 1)), c, op / (1 + i * 0.6)); } };
}

// frame for tubes around a curve
function tube(o) {
  const { curve, radius } = o;
  const rf = typeof radius === 'function' ? radius : () => radius;
  return surf({
    ...o,
    f: (u, v) => {
      const p = curve(u);
      const t = curve(Math.min(1, u + 1e-3)).sub(curve(Math.max(0, u - 1e-3))).normalize();
      const ref = Math.abs(t.y) > 0.9 ? X : V3(0, 1, 0);
      const nA = V3().crossVectors(t, ref).normalize(), nB = V3().crossVectors(t, nA);
      const a = v * Math.PI * 2, rr = rf(u);
      return p.add(nA.multiplyScalar(Math.cos(a) * rr)).add(nB.multiplyScalar(Math.sin(a) * rr));
    },
    flip: o.flip ?? false,
  });
}

// plane patch: origin o, axes ax/ay (full lengths), normal facing ax x ay
function plane(o) {
  const { origin, ax, ay } = o;
  return surf({ ...o, f: (u, v) => origin.clone().addScaledVector(ax, u - 0.5).addScaledVector(ay, v - 0.5) });
}
const rrMask = (w, h, r) => (u, v) => { // rounded-rect mask in uv for a w x h rect
  const x = Math.abs(u - 0.5) * w - (w / 2 - r), y = Math.abs(v - 0.5) * h - (h / 2 - r);
  return x <= 0 || y <= 0 || x * x + y * y <= r * r;
};
const discMask = (u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25;

const bez2 = (a, b, c) => t => V3().addScaledVector(a, (1 - t) ** 2).addScaledVector(b, 2 * t * (1 - t)).addScaledVector(c, t * t);
const poly = pts => t => { // polyline through points (Catmull-Rom)
  const cr = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); return cr.getPoint(t);
};

// allocate count over parts and emit into a Sink; returns PackedSplats
function assemble(parts, count, rng) {
  const S = new Sink(rng);
  // wire splat counts are tuned for 4000; scale them with the budget
  for (const p of parts) if (p.fixed != null && p.len) p.fixed = Math.max(3, Math.round(p.fixed * Math.min(1, count / 4000 + 0.1)));
  const fixedSum = parts.reduce((s, p) => s + (p.fixed ?? 0), 0);
  const free = Math.max(0, count - fixedSum);
  const tot = parts.reduce((s, p) => s + (p.fixed == null ? p.area * p.w : 0), 0) || 1;
  const ns = parts.map(p => p.fixed ?? Math.max(p.min ?? 6, Math.round(free * p.area * p.w / tot)));
  // rounding can overshoot the budget by a few; take them from the largest part
  const over = ns.reduce((a, b) => a + b, 0) - count;
  if (over > 0) { const big = ns.indexOf(Math.max(...ns)); ns[big] -= over; }
  parts.forEach((p, i) => p.emit(S, ns[i]));
  return S;
}
function toMesh(S) {
  const ps = new PackedSplats();
  const c = V3(), s = V3(), q = new THREE.Quaternion(), col = new THREE.Color();
  for (const a of S.a) {
    c.set(a[0], a[1], a[2]); s.set(a[3], a[4], a[5]); q.set(a[6], a[7], a[8], a[9]);
    col.setRGB(a[11], a[12], a[13]);
    ps.pushSplat(c, s, q, a[10], col);
  }
  const m = new SplatMesh({ packedSplats: ps });
  m.userData.splatCount = S.a.length;
  return m;
}

// ======================================================================
// 1. CHERRY — 3DGS pipeline
// ======================================================================
function cherry(count, rng) {
  const parts = [];
  const berries = [
    { c: V3(-0.165, 0.2, 0.03), R: 0.19 },
    { c: V3(0.155, 0.215, -0.03), R: 0.2 },
  ];
  const J = V3(0.02, 0.9, -0.02);
  for (const b of berries) {
    const radial = d => {
      const dim = Math.exp(-(1 - d.y) * 14), bot = Math.exp(-(1 + d.y) * 18);
      return b.R * (1 - 0.2 * dim - 0.05 * bot) * (1 + 0.03 * (1 - d.y * d.y));
    };
    parts.push(surf({
      f: (u, v) => {
        const ph = u * Math.PI, th = v * 2 * Math.PI;
        const d = V3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        return d.multiplyScalar(radial(d)).add(b.c);
      },
      flip: true, k: 0.52,
      mat: { amb: 0.3, dif: 0.85, spec: 0.85, shin: 70, rim: 0.25 },
      color: (p) => {
        const y = (p.y - b.c.y) / b.R;
        const deep = [0.42, 0.01, 0.05], bright = [0.86, 0.06, 0.1];
        let c = mixC(deep, bright, smooth(-1, 0.6, y));
        return mixC(c, [0.3, 0.02, 0.04], smooth(0.75, 0.95, y)); // darker dimple
      },
    }));
    const top = b.c.clone().add(V3(0, b.R * 0.8, 0));
    // stem: thin elongated Gaussians, green at the fruit, brown at the top
    const ctrl = V3(b.c.x * 0.75, 0.66, 0.0);
    parts.push(wire({
      curve: bez2(top, ctrl, J), r: 0.0075, fixed: Math.round(count * 0.03), over: 0.9,
      color: (p, t) => mixC([0.42, 0.55, 0.16], [0.45, 0.32, 0.14], smooth(0.4, 1, t)),
      taper: t => 1.1 - 0.35 * t,
    }));
    parts.push({ area: 0, fixed: 3, emit(S) { for (let i = 0; i < 3; i++) S.ball(top.clone().add(V3(0, 0.006 * i, 0)), 0.014, [0.3, 0.32, 0.1]); } });
  }
  // knob at the join
  parts.push({ area: 0, fixed: 4, emit(S) { for (let i = 0; i < 4; i++) S.ball(J.clone().add(V3((i - 1.5) * 0.006, 0.004, 0)), 0.015, [0.36, 0.25, 0.12]); } });
  // leaf from the join, curling out to the right
  const L = 0.4, W = 0.22;
  const lu = V3(0.88, 0.32, 0.2).normalize();
  const lw = V3().crossVectors(V3(-0.15, 0.5, 0.85).normalize(), lu).normalize();
  const ln = V3().crossVectors(lu, lw).normalize();
  const leafF = (u, v) => {
    const a = u, half = 0.5 * W * Math.pow(Math.sin(Math.PI * Math.min(1, a * 1.02)), 0.75) * (1 - 0.25 * a);
    const b = (v - 0.5) * 2 * half;
    const fold = Math.abs(b) * 0.35, curl = -0.25 * L * a * a;
    return J.clone().addScaledVector(lu, a * L).addScaledVector(lw, b).addScaledVector(ln, fold + curl + 0.02 * Math.sin(a * 9));
  };
  parts.push(surf({
    f: leafF, w: 2.2, k: 0.58,
    mat: { amb: 0.4, dif: 0.75, spec: 0.25, shin: 18, two: true },
    color: (p, n, u, v) => {
      const b = Math.abs(v - 0.5) * 2;
      let c = mixC([0.12, 0.42, 0.09], [0.3, 0.62, 0.16], u * 0.6 + b * 0.3);
      if (b < 0.07) c = [0.55, 0.75, 0.3];
      const vein = Math.abs(((u * 7 - b * 1.6) % 1 + 1) % 1 - 0.5);
      if (vein < 0.06 && b > 0.1 && b < 0.85) c = mixC(c, [0.45, 0.7, 0.25], 0.6);
      return c;
    },
  }));
  return toMesh(assemble(parts, count, rng));
}

// ======================================================================
// 2. ROBOT — OpenAI API service
// ======================================================================
function robot(count, rng) {
  const parts = [];
  const WHITE = [0.86, 0.89, 0.93], GREY = [0.42, 0.46, 0.54], ORANGE = [1.0, 0.5, 0.16], NAVY = [0.04, 0.06, 0.12];
  const CYAN = [0.55, 1.0, 1.0];
  const plastic = { amb: 0.36, dif: 0.7, spec: 0.5, shin: 40, rim: 0.2 };
  // feet
  for (const sx of [-1, 1]) {
    parts.push(roundBox({ c: V3(sx * 0.1, 0.035, 0.02), h: V3(0.075, 0.035, 0.1), rad: 0.03, color: () => ORANGE, mat: plastic, skip: [[1, -1]] }));
    parts.push(tube({ curve: t => V3(sx * 0.1, 0.06 + t * 0.12, 0), radius: 0.042, color: () => GREY, mat: plastic, k: 0.65 }));
  }
  // body
  parts.push(roundBox({
    c: V3(0, 0.33, 0), h: V3(0.19, 0.15, 0.14), rad: 0.07, w: 1.0, mat: plastic,
    color: (p, n) => (n.z > 0.95 && Math.abs(p.x) < 0.1 && Math.abs(p.y - 0.345) < 0.06 ? NAVY : p.y < 0.215 ? ORANGE : WHITE),
  }));
  // chest panel + glowing core
  parts.push(plane({
    origin: V3(0, 0.345, 0.142), ax: V3(0.2, 0, 0), ay: V3(0, 0.12, 0), mask: rrMask(0.2, 0.12, 0.03), w: 2.5,
    mat: { amb: 0.5, dif: 0.4, spec: 0.8, shin: 60 }, color: () => NAVY,
  }));
  parts.push(plane({
    origin: V3(-0.04, 0.345, 0.146), ax: V3(0.07, 0, 0), ay: V3(0, 0.07, 0), mask: discMask, w: 4, emissive: true,
    color: (p) => mixC([1, 1, 1], CYAN, smooth(0.005, 0.03, p.distanceTo(V3(-0.04, 0.345, 0.146)))),
  }));
  parts.push(halo(V3(-0.04, 0.345, 0.15), 0.05, [0.3, 0.9, 1], 0.14, 3));
  for (const [i, col] of [[0, [1, 0.8, 0.2]], [1, [0.4, 1, 0.5]]]) {
    const p0 = V3(0.035 + i * 0.04, 0.345, 0.147);
    parts.push({ area: 0, fixed: 4, emit(S) { S.ball(p0, 0.011, col); S.ball(p0, 0.022, col, 0.15); S.ball(p0, 0.008, [1, 1, 1]); S.ball(p0, 0.03, col, 0.06); } });
  }
  // neck
  parts.push(tube({ curve: t => V3(0, 0.47 + t * 0.06, 0), radius: 0.05, color: () => GREY, mat: plastic }));
  // head
  const HC = V3(0, 0.69, 0);
  parts.push(roundBox({ c: HC, h: V3(0.24, 0.16, 0.17), rad: 0.075, w: 1.0, mat: plastic, color: (p, n) => {
    if (n.z > 0.95 && Math.abs(p.x) < 0.175 && Math.abs(p.y - 0.69) < 0.095) {
      const de = Math.min(Math.hypot(p.x - 0.085, p.y - 0.705), Math.hypot(p.x + 0.085, p.y - 0.705));
      return de < 0.036 ? [0.3, 0.9, 1, 1] : NAVY;
    }
    return WHITE;
  } }));
  // face plate
  parts.push(plane({
    origin: V3(0, 0.69, 0.172), ax: V3(0.36, 0, 0), ay: V3(0, 0.2, 0), mask: rrMask(0.36, 0.2, 0.06), w: 2.2,
    mat: { amb: 0.45, dif: 0.35, spec: 0.9, shin: 50, rim: 0.1 },
    color: (p) => mixC(NAVY, [0.1, 0.16, 0.28], smooth(0.6, 0.78, p.y)),
  }));
  // eyes
  for (const sx of [-1, 1]) {
    const e = V3(sx * 0.085, 0.705, 0.176);
    parts.push(plane({
      origin: e, ax: V3(0.075, 0, 0), ay: V3(0, 0.085, 0), mask: discMask, w: 6, emissive: true, k: 0.55,
      color: (p) => mixC([0.85, 1, 1], [0.2, 0.85, 1], smooth(0.01, 0.04, p.distanceTo(e))),
    }));
    parts.push({ area: 0, fixed: 2, emit(S) { S.ball(e.clone().add(V3(-0.014, 0.018, 0.004)), 0.008, [1, 1, 1]); S.ball(e.clone().add(V3(0.012, -0.012, 0.004)), 0.005, [1, 1, 1]); } });
    parts.push(halo(e.clone().add(V3(0, 0, 0.01)), 0.06, [0.2, 0.8, 1], 0.13, 3));
  }
  // smile
  parts.push(wire({
    curve: t => V3((t - 0.5) * 0.09, 0.625 - 0.022 * Math.sin(Math.PI * t), 0.177), r: 0.007, fixed: 14, emissive: true,
    color: () => CYAN, over: 1.0,
  }));
  // ears
  for (const sx of [-1, 1]) {
    parts.push(tube({ curve: t => V3(sx * (0.235 + t * 0.035), 0.69, 0), radius: 0.055, color: () => ORANGE, mat: plastic, w: 1.4 }));
    parts.push(plane({ origin: V3(sx * 0.271, 0.69, 0), ax: V3(0, 0, 0.11), ay: V3(0, 0.11, 0), mask: discMask, flip: sx < 0, color: () => ORANGE, mat: plastic, w: 1.4 }));
  }
  // antenna
  parts.push(wire({ curve: t => V3(0, 0.84 + t * 0.11, 0), r: 0.009, fixed: 12, color: () => GREY, over: 1 }));
  const AB = V3(0, 0.965, 0);
  parts.push(surf({
    f: (u, v) => V3(Math.sin(u * Math.PI) * Math.cos(v * 6.283), Math.cos(u * Math.PI), Math.sin(u * Math.PI) * Math.sin(v * 6.283)).multiplyScalar(0.03).add(AB),
    flip: true, emissive: true, w: 3, color: (p, n) => mixC([1, 0.35, 0.1], [1, 0.85, 0.5], clamp01(n.dot(KEY))),
  }));
  parts.push(halo(AB, 0.07, [1, 0.45, 0.15], 0.13, 3));
  // arms: right arm down, left arm waving
  const armR = poly([V3(-0.2, 0.42, 0), V3(-0.27, 0.34, 0.02), V3(-0.29, 0.24, 0.04)]);
  const armL = poly([V3(0.2, 0.42, 0), V3(0.3, 0.48, 0.02), V3(0.34, 0.6, 0.04)]);
  for (const arm of [armR, armL]) {
    parts.push(tube({ curve: arm, radius: 0.034, color: () => GREY, mat: plastic }));
    const hnd = arm(1).add(arm(1).sub(arm(0.95)).normalize().multiplyScalar(0.03));
    parts.push(surf({
      f: (u, v) => V3(Math.sin(u * Math.PI) * Math.cos(v * 6.283), Math.cos(u * Math.PI), Math.sin(u * Math.PI) * Math.sin(v * 6.283)).multiplyScalar(0.05).add(hnd),
      flip: true, color: () => ORANGE, mat: plastic,
    }));
  }
  const mesh = toMesh(assemble(parts, count, rng));
  return mesh;
}

// ======================================================================
// 3. VASE — diffusion artifact fixing (clean half vs noisy half)
// ======================================================================
function vase(count, rng) {
  const prof = [[0.12, 0], [0.15, 0.015], [0.17, 0.06], [0.24, 0.18], [0.285, 0.33], [0.28, 0.46], [0.23, 0.6], [0.15, 0.72], [0.11, 0.8], [0.105, 0.88], [0.125, 0.95], [0.16, 1.0]];
  const pc = new THREE.CatmullRomCurve3(prof.map(([r, y]) => V3(r, y, 0)), false, 'centripetal');
  const lathe = (u, v) => { const p = pc.getPoint(u), a = v * Math.PI * 2; return V3(p.x * Math.cos(a), p.y, p.x * Math.sin(a)); };
  const GLAZE = [0.06, 0.2, 0.55], CREAM = [0.95, 0.88, 0.7], GOLD = [0.95, 0.72, 0.3];
  const pattern = (p) => {
    const th = Math.atan2(p.z, p.x), y = p.y;
    let c = mixC([0.03, 0.12, 0.38], GLAZE, smooth(0.0, 0.5, y));
    const wave = 0.38 + 0.035 * Math.sin(th * 7);
    if (Math.abs(y - wave) < 0.028) c = CREAM;
    if (Math.abs(y - 0.24) < 0.008 || Math.abs(y - 0.52) < 0.008) c = GOLD;
    // dots between the gold lines
    const dth = ((th * 14 / Math.PI) % 1 + 1) % 1;
    if (Math.abs(y - 0.465) < 0.017 && Math.abs(dth - 0.5) < 0.17) c = CREAM;
    if (y > 0.75 && y < 0.93 && Math.abs(((th * 12 / Math.PI) % 1 + 1) % 1 - 0.5) < 0.12) c = mixC(c, [0.2, 0.42, 0.8], 0.9);
    if (y > 0.965) c = GOLD;
    return c;
  };
  const glaze = { amb: 0.32, dif: 0.75, spec: 0.75, shin: 60, rim: 0.3 };
  const noisy = p => smooth(-0.02, 0.1, p.x);
  const body = surf({ f: lathe, color: pattern, mat: glaze });
  const inside = surf({ f: (u, v) => { const p = lathe(0.82 + 0.18 * u, v); return V3(p.x * 0.88, p.y, p.z * 0.88); }, flip: true, color: () => [0.02, 0.05, 0.15], mat: { amb: 0.4, dif: 0.3 } });
  const nFloat = Math.round(count * 0.07);
  const parts = [
    { area: body.area, w: 1, emit(S, n) {
      // emit into a temp sink, then degrade the +X half
      const T = new Sink(S.rng); body.emit(T, n);
      for (const a of T.a) {
        const p = V3(a[0], a[1], a[2]), w = noisy(p), r = S.rng;
        if (w <= 0) { S.a.push(a); continue; }
        const k = w * w;
        // drift, blow up, random orientation, colour noise
        a[0] += (r() - 0.5) * 0.05 * k; a[1] += (r() - 0.5) * 0.05 * k; a[2] += (r() - 0.3) * 0.05 * k;
        const sc = 1 + 1.6 * k * r();
        a[3] *= sc * (1 + k * r() * 0.4); a[4] *= sc; a[5] = mix(a[5], a[4] * (0.6 + 0.5 * r()), k);
        if (r() < 0.35 * k) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)); a[6] = q.x; a[7] = q.y; a[8] = q.z; a[9] = q.w; }
        const g = (r() - 0.5) * 0.5 * k, lum = (a[11] + a[12] + a[13]) / 3;
        for (let i = 11; i < 14; i++) a[i] = clamp01(mix(a[i], lum, 0.45 * k) + g + (r() - 0.5) * 0.15 * k);
        a[10] = mix(1, 0.45 + 0.5 * r(), k);
        if (r() < 0.12 * k) continue; // holes
        S.a.push(a);
      }
    } },
    inside,
    // floaters around the noisy half
    { area: 0, fixed: nFloat, emit(S, n) {
      const r = S.rng;
      for (let i = 0; i < n; i++) {
        const u = r(), p0 = lathe(u, r() * 0.5 - 0.25);
        const p = p0.add(V3(0.02 + r() * 0.14, (r() - 0.5) * 0.1, (r() - 0.5) * 0.25));
        if (p.x < 0.04) p.x = 0.04 + r() * 0.1;
        const c = mixC(pattern(p0), [0.5, 0.5, 0.6], r() * 0.6);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
        const s = 0.006 + r() * 0.02;
        S.raw(p, s * (1 + r() * 3), s, s * 0.5, q, 0.25 + 0.5 * r(), c);
      }
    } },
    // seam meridians at x = 0 (before | after), drawn faintly on the surface
    wire({ curve: t => { const p = lathe(t, 0.25); return p.multiplyScalar(1.012).setY(p.y); }, r: 0.0022, fixed: 70, emissive: true, color: () => [0.8, 0.92, 1], opacity: 0.55 }),
    wire({ curve: t => { const p = lathe(t, 0.75); return p.multiplyScalar(1.012).setY(p.y); }, r: 0.0022, fixed: 40, emissive: true, color: () => [0.8, 0.92, 1], opacity: 0.4 }),
  ];
  return toMesh(assemble(parts, count, rng));
}

// ======================================================================
// 4. CHAIR — triangle-mesh wireframe, half filled with surface splats
// ======================================================================
function chair(count, rng) {
  const tris = []; // {a,b,c, n}
  const edges = new Map();
  const key = p => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
  const addEdge = (a, b) => { const k1 = key(a), k2 = key(b), k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1; if (!edges.has(k)) edges.set(k, [a, b]); };
  // grid patch: P(i/nu, j/nv), outward normal fn
  const patch = (P, nu, nv) => {
    const g = [];
    for (let i = 0; i <= nu; i++) { g.push([]); for (let j = 0; j <= nv; j++) g[i].push(P(i / nu, j / nv)); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = g[i][j], b = g[i + 1][j], c = g[i + 1][j + 1], d = g[i][j + 1];
      const diag = (i + j) % 2 === 0;
      const T = diag ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
      for (const t of T) {
        const n = V3().subVectors(t[1], t[0]).cross(V3().subVectors(t[2], t[0])).normalize();
        tris.push({ v: t, n });
        addEdge(t[0], t[1]); addEdge(t[1], t[2]); addEdge(t[2], t[0]);
      }
    }
  };
  const warp = p => p; // hook
  // box with subdivisions; xf transforms points
  const box = (c, h, div = [1, 1, 1], xf = p => p) => {
    const F = [
      [0, 1, 2, 1], [0, 2, 1, -1], [1, 2, 0, 1], [1, 0, 2, -1], [2, 0, 1, 1], [2, 1, 0, -1],
    ];
    for (const [i, j, k, s] of F) {
      patch((u, v) => {
        const p = V3(); p.setComponent(i, s * h.getComponent(i));
        p.setComponent(j, (u * 2 - 1) * h.getComponent(j)); p.setComponent(k, (v * 2 - 1) * h.getComponent(k));
        return xf(warp(p.add(c)));
      }, div[j], div[k]);
    }
  };
  const SEAT_Y = 0.46, LX = 0.2, LZ = 0.19, LH = 0.022;
  // seat (slightly cushioned top)
  box(V3(0, SEAT_Y - 0.03, 0), V3(0.245, 0.03, 0.235), [6, 1, 6], p => (p.y > SEAT_Y - 0.001 ? p.setY(p.y + 0.018 * (1 - (p.x / 0.245) ** 2) * (1 - (p.z / 0.235) ** 2)) : p));
  // legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const back = sz < 0, top = back ? 1.0 : SEAT_Y - 0.06;
    const lean = back ? 0.07 : 0;
    box(V3(sx * LX, top / 2, sz * LZ), V3(LH, top / 2, LH), [1, back ? 7 : 3, 1], p => p.setZ(p.z - lean * smooth(SEAT_Y, 1.0, p.y) * (p.y - SEAT_Y) / 0.54 * 1.0));
  }
  // stretchers
  for (const sx of [-1, 1]) box(V3(sx * LX, 0.14, 0), V3(0.012, 0.012, LZ), [1, 1, 3]);
  box(V3(0, 0.14, LZ), V3(LX, 0.012, 0.012), [3, 1, 1]);
  // curved backrest panel (two-sided surface)
  const backZ = (x, y) => -LZ - 0.07 * (y - SEAT_Y) / 0.54 - 0.035 * (1 - (x / LX) ** 2);
  patch((u, v) => { const x = (u * 2 - 1) * (LX - 0.02), y = 0.66 + v * 0.3; return V3(x, y, backZ(x, y)); }, 6, 3);
  patch((u, v) => { const x = (u * 2 - 1) * (LX - 0.02), y = 0.52 + v * 0.06; return V3(x, y, backZ(x, y)); }, 6, 1);

  const S = new Sink(rng);
  const EDGE = [0.35, 0.92, 1.0];
  const fillW = p => smooth(-0.04, 0.12, p.x);
  // budget: 55% edges, 6% vertices, rest fill
  const E = [...edges.values()];
  const Ltot = E.reduce((s, [a, b]) => s + a.distanceTo(b), 0);
  const nEdge = Math.round(count * 0.55);
  const seg = Ltot / nEdge;
  for (const [a, b] of E) {
    const L = a.distanceTo(b), m = Math.max(1, Math.round(L / seg)), t = V3().subVectors(b, a);
    const mid = a.clone().add(b).multiplyScalar(0.5), fw = fillW(mid);
    for (let i = 0; i < m; i++) {
      const p = a.clone().addScaledVector(t, (i + 0.5) / m);
      const c = mixC(EDGE, [0.6, 1, 1], 0.3 * rng());
      S.stick(p, t, (L / m) * 0.6, 0.0028, mixC(c, [0.3, 0.75, 0.9], fw * 0.4), 1);
    }
  }
  const verts = new Map();
  for (const [a, b] of E) { verts.set(key(a), a); verts.set(key(b), b); }
  for (const v of verts.values()) { S.ball(v, 0.0042, [0.85, 1, 1], 0.9); }
  // fill triangles on the +X side
  const filled = tris.filter(t => { const c = t.v[0].clone().add(t.v[1]).add(t.v[2]).multiplyScalar(1 / 3); return rng() < fillW(c); });
  const areas = filled.map(t => V3().subVectors(t.v[1], t.v[0]).cross(V3().subVectors(t.v[2], t.v[0])).length() / 2);
  const Atot = areas.reduce((s, a) => s + a, 0);
  const nFill = Math.max(0, count - S.length);
  const s0 = 0.62 * Math.sqrt(Atot / Math.max(1, nFill));
  const WOOD = [0.78, 0.5, 0.28];
  let acc = 0;
  for (let i = 0; i < filled.length; i++) {
    acc += nFill * areas[i] / Atot;
    while (acc >= 1) {
      acc--;
      let r1 = rng(), r2 = rng(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
      const [a, b, c] = filled[i].v;
      const p = a.clone().addScaledVector(V3().subVectors(b, a), r1).addScaledVector(V3().subVectors(c, a), r2);
      const grain = 0.88 + 0.12 * Math.sin(p.x * 90 + Math.sin(p.z * 30) * 2);
      const col = shade(WOOD.map(x => x * grain), filled[i].n, { amb: 0.38, dif: 0.75, spec: 0.25, shin: 20, two: true });
      S.flat(p.addScaledVector(filled[i].n, -0.002), filled[i].n, s0 * (0.8 + 0.4 * rng()), S.jit(col, 0.06), 1, 0.2);
    }
  }
  return toMesh(S);
}

// ======================================================================
// 5. TASK BOARD — MCP server for the team task board (kanban)
// ======================================================================
function board(count, rng) {
  const parts = [];
  const BW = 1.12, BH = 0.68, BY = 0.3 + BH / 2;
  const colX = [-0.37, 0, 0.37], CW = 0.34, HH = 0.055, HY = BY + BH / 2 - 0.05;
  const HEAD = [[0.42, 0.5, 0.66], [0.98, 0.62, 0.15], [0.25, 0.72, 0.42]];
  // cards: [col, row, colour, tilt]
  const CARDS = [
    [0, 0, hex(0xffd84a)], [0, 1, hex(0xff8fb1)], [0, 2, hex(0x7cc8ff)],
    [1, 0, hex(0xffa94d), 0.1], [1, 1, hex(0xb39bff)],
    [2, 0, hex(0x7be08f)], [2, 1, hex(0x7be08f)],
  ].map(([ci, row, col, tilt = 0]) => ({
    ci, col, tilt, x: colX[ci] + (tilt ? 0.035 : 0), y: HY - 0.11 - row * 0.165, lift: tilt ? 0.03 : 0.01,
  }));
  const cw = 0.29, ch = 0.13;
  const inRR = (dx, dy, w, h, r) => {
    const x = Math.abs(dx) - (w / 2 - r), y = Math.abs(dy) - (h / 2 - r);
    return (x <= 0 && Math.abs(dy) <= h / 2) || (y <= 0 && Math.abs(dx) <= w / 2) || x * x + y * y <= r * r;
  };
  const local = (p, cd, ox = 0, oy = 0) => {
    const dx = p.x - cd.x - ox, dy = p.y - cd.y - oy, c = Math.cos(-cd.tilt), sn = Math.sin(-cd.tilt);
    return [dx * c - dy * sn, dx * sn + dy * c];
  };
  const cardAt = p => CARDS.find(cd => { const [x, y] = local(p, cd); return inRR(x, y, cw, ch, 0.018); });
  const shadowAt = p => CARDS.some(cd => { const [x, y] = local(p, cd, 0.008 + cd.lift * 0.6, -0.012 - cd.lift * 0.6); return inRR(x, y, cw + 0.01, ch + 0.01, 0.025); });
  // the whole front is ONE painted surface (layers would show through each other)
  parts.push(plane({
    origin: V3(0, BY, 0.0), ax: V3(BW, 0, 0), ay: V3(0, BH, 0), w: 1.15, k: 0.72, gu: 128, gv: 96,
    mat: { amb: 0.62, dif: 0.42, spec: 0.1, shin: 20 },
    color: (p) => {
      const cd = cardAt(p);
      if (cd) return cd.col;
      for (let i = 0; i < 3; i++) if (inRR(p.x - colX[i], p.y - HY, CW, HH, 0.014)) return HEAD[i];
      return shadowAt(p) ? [0.66, 0.68, 0.73] : [0.93, 0.94, 0.96];
    },
    disp: (p) => { const cd = cardAt(p); return cd ? cd.lift : 0; },
  }));
  // frame (front face only around the rim) + back
  parts.push(roundBox({
    c: V3(0, BY, -0.013), h: V3(BW / 2 + 0.022, BH / 2 + 0.022, 0.012), rad: 0.008, w: 0.3, k: 0.45,
    color: (p, n) => (n.z > 0.9 && Math.abs(p.x) < BW / 2 && Math.abs(p.y - BY) < BH / 2 ? null : n.z < -0.5 ? [0.22, 0.23, 0.26] : [0.62, 0.65, 0.7]),
    mat: { amb: 0.4, dif: 0.6, spec: 0.6, shin: 40 },
  }));
  // header titles, column separators
  colX.forEach((x, i) => parts.push(wire({ curve: t => V3(x - 0.13 + t * (0.1 + 0.04 * i), HY, 0.004), r: 0.0045, fixed: 10, emissive: true, color: () => [1, 1, 1] })));
  for (const x of [-0.185, 0.185]) parts.push(wire({ curve: t => V3(x, BY - BH / 2 + 0.03 + t * (BH - 0.12), 0.003), r: 0.0022, fixed: 26, emissive: true, color: () => [0.72, 0.75, 0.8] }));
  // card text lines, avatar dots, check marks
  for (const cd of CARDS) {
    const ax = V3(cw, 0, 0).applyAxisAngle(Z, cd.tilt), ay = V3(0, ch, 0).applyAxisAngle(Z, cd.tilt);
    const at = (u, v) => V3(cd.x, cd.y, cd.lift + 0.004).addScaledVector(ax, u).addScaledVector(ay, v);
    const ink = cd.col.map(x => x * 0.3);
    for (const [u0, v, len] of [[-0.4, 0.25, 0.6], [-0.4, -0.02, 0.38]]) parts.push(wire({ curve: t => at(u0 + t * len, v), r: 0.0042, fixed: 12, emissive: true, color: () => ink }));
    const av = at(0.36, -0.24), avc = cd.ci === 2 ? [0.12, 0.5, 0.26] : [0.28, 0.32, 0.5];
    parts.push({ area: 0, fixed: 2, emit(S) { S.ball(av, 0.011, avc); S.ball(av.clone().add(V3(0, 0, 0.002)), 0.006, avc.map(x => x * 1.5)); } });
    if (cd.ci === 2) parts.push(wire({ curve: poly([at(0.1, -0.22), at(0.16, -0.32), at(0.27, -0.08)]), r: 0.0048, fixed: 12, emissive: true, color: () => [0.08, 0.45, 0.18] }));
  }
  // easel legs, marker tray, markers
  const legC = [0.34, 0.36, 0.4], legM = { amb: 0.4, dif: 0.6, spec: 0.5, shin: 30 };
  for (const sx of [-1, 1]) parts.push(wire({ curve: t => V3(sx * (0.44 + 0.05 * t), 0.31 * (1 - t), 0.02 + 0.05 * t), r: 0.011, fixed: 40, color: () => legC, mat: legM }));
  parts.push(wire({ curve: t => V3(0, 0.8 * (1 - t), -0.03 - 0.28 * t), r: 0.01, fixed: 60, color: () => legC, mat: legM }));
  parts.push(roundBox({ c: V3(0, 0.29, 0.025), h: V3(0.42, 0.007, 0.03), rad: 0.005, color: () => [0.66, 0.69, 0.74], mat: legM, w: 0.8 }));
  [[-0.22, [0.1, 0.4, 0.9]], [-0.1, [0.9, 0.2, 0.25]], [0.24, [0.15, 0.6, 0.3]]].forEach(([x, c]) =>
    parts.push(tube({ curve: t => V3(x - 0.045 + t * 0.09, 0.306, 0.03), radius: 0.009, color: (p) => (p.x > x + 0.03 ? [0.95, 0.95, 0.95] : c), mat: { spec: 0.4 }, w: 3 })));
  return toMesh(assemble(parts, count, rng));
}

// ======================================================================
// 6. GPU — training / evaluation on GPUs
// ======================================================================
function gpu(count, rng) {
  const parts = [];
  const L = 1.2, H = 0.48, Y0 = 0.075, TZ = 0.11; // card length/height, bottom, shroud front z
  const YC = Y0 + H / 2, XL = -L / 2, XR = L / 2 - 0.1; // shroud spans XL..XR, fins after
  const SHROUD = [0.14, 0.15, 0.18], METAL = [0.72, 0.74, 0.78];
  const metal = { amb: 0.35, dif: 0.6, spec: 0.7, shin: 30, rim: 0.25 };
  const FANS = [V3(-0.27, YC, 0), V3(0.2, YC, 0)], FR = 0.19;
  const inFan = p => FANS.some(f => Math.hypot(p.x - f.x, p.y - f.y) < FR + 0.008);
  // shroud: front face with fan holes, accent lines
  parts.push(roundBox({
    c: V3((XL + XR) / 2, YC, 0.01), h: V3((XR - XL) / 2, H / 2, TZ - 0.01), rad: 0.03, w: 1.0, mat: metal,
    color: (p, n) => {
      if (n.z > 0.9 && inFan(p)) return null;
      const diag = ((p.x - p.y * 0.6) * 9 % 1 + 1) % 1;
      let c = SHROUD;
      if (n.z > 0.9 && Math.abs(p.y - YC) > FR + 0.02 && diag < 0.06) c = [0.55, 0.57, 0.62];
      return c;
    },
  }));
  // glowing accent strip along the top front edge
  parts.push(wire({ curve: t => V3(XL + 0.08 + t * (XR - XL - 0.16), Y0 + H - 0.018, TZ + 0.003), r: 0.005, fixed: 60, emissive: true, color: (p, t) => mixC([0.2, 0.9, 1], [0.7, 0.4, 1], t) }));
  // fan wells (dark recess) + glowing ring
  for (const f of FANS) {
    parts.push(plane({ origin: V3(f.x, f.y, 0.03), ax: V3(2 * FR, 0, 0), ay: V3(0, 2 * FR, 0), mask: discMask, w: 0.25, color: () => [0.03, 0.03, 0.04], emissive: true }));
    parts.push(surf({ // inner wall
      f: (u, v) => V3(f.x + FR * Math.cos(v * 6.283), f.y + FR * Math.sin(v * 6.283), 0.03 + u * (TZ - 0.03)), w: 0.5,
      flip: false, color: () => [0.08, 0.08, 0.1], mat: { amb: 0.5, dif: 0.4 },
    }));
    parts.push(wire({ curve: t => V3(f.x + (FR + 0.004) * Math.cos(t * 6.283), f.y + (FR + 0.004) * Math.sin(t * 6.283), TZ + 0.003), r: 0.0055, fixed: 90, emissive: true, color: (p, t) => mixC([0.2, 0.95, 1], [0.75, 0.35, 1], 0.5 + 0.5 * Math.sin(t * 6.283)) }));
  }
  // heatsink fins at the exposed end
  for (let i = 0; i < 9; i++) for (let k = 0; k < 3; k++) {
    const x = XR + 0.012 + i * 0.011, z = -TZ + 0.03 + k * (2 * TZ - 0.06) / 2;
    parts.push(wire({ curve: t => V3(x, Y0 + 0.02 + t * (H - 0.04), z), r: 0.0035, fixed: 14, color: () => (i % 2 ? [0.8, 0.82, 0.86] : [0.55, 0.57, 0.62]), mat: { amb: 0.5, dif: 0.6 } }));
  }
  parts.push(roundBox({ c: V3(XR + 0.06, Y0 + H - 0.006, 0), h: V3(0.06, 0.006, TZ - 0.01), rad: 0.004, color: () => [0.25, 0.26, 0.3], mat: metal, w: 0.6 }));
  // backplate
  parts.push(plane({ origin: V3(0.0, YC, -TZ + 0.01), ax: V3(-L, 0, 0), ay: V3(0, H, 0), w: 0.4, color: (p) => (((p.x * 14) % 1 + 1) % 1 < 0.08 ? [0.3, 0.32, 0.36] : [0.1, 0.1, 0.12]), mat: metal }));
  // PCB edge + gold fingers + slot
  parts.push(roundBox({ c: V3(0.0, Y0 - 0.008, -0.03), h: V3(L / 2 - 0.02, 0.012, 0.008), rad: 0.003, color: () => [0.05, 0.25, 0.12], mat: { spec: 0.3 }, w: 0.8 }));
  for (let x = -0.34; x <= 0.24; x += 0.02) { // gold contact fingers
    parts.push(wire({ curve: t => V3(x, 0.012 + t * 0.045, -0.024), r: 0.0045, fixed: 4, color: () => [1.0, 0.78, 0.32], mat: { amb: 0.6, dif: 0.7 } }));
  }
  parts.push(roundBox({ c: V3(-0.05, 0.04, -0.03), h: V3(0.31, 0.032, 0.004), rad: 0.002, w: 0.5, color: () => [0.05, 0.22, 0.11], mat: { spec: 0.3 } }));
  // bracket (I/O plate) on the left end
  parts.push(roundBox({ c: V3(XL - 0.012, YC + 0.02, -0.02), h: V3(0.004, H / 2 + 0.06, TZ + 0.01), rad: 0.003, color: (p) => (Math.abs(((p.y * 18) % 1 + 1) % 1 - 0.5) < 0.18 && p.z > -0.08 && p.z < 0.06 ? [0.15, 0.15, 0.17] : METAL), mat: metal, w: 0.35, k: 0.5 }));
  // power connector on top
  parts.push(roundBox({ c: V3(0.25, Y0 + H + 0.02, -0.02), h: V3(0.05, 0.02, 0.025), rad: 0.005, color: () => [0.06, 0.06, 0.07], mat: { spec: 0.4 }, w: 1 }));
  // status LEDs near the bracket end, on the front top
  [[0, [0.3, 1, 0.45]], [1, [0.3, 1, 0.45]], [2, [1, 0.7, 0.15]]].forEach(([i, c]) => {
    const p = V3(XL + 0.07 + i * 0.035, Y0 + H - 0.05, TZ + 0.006);
    parts.push({ area: 0, fixed: 5, emit(S) { S.ball(p, 0.007, [1, 1, 1]); S.ball(p, 0.011, c); S.ball(p, 0.022, c, 0.25); S.ball(p, 0.04, c, 0.08); S.ball(p, 0.06, c, 0.04); } });
  });
  const fanBudget = Math.round(count * 0.22);
  const S = assemble(parts, count - 2 * fanBudget, rng);
  const mesh = toMesh(S);
  // fans: separate child meshes so they can spin
  const fans = FANS.map(f => {
    const fp = [];
    const NB = 7;
    for (let bi = 0; bi < NB; bi++) {
      fp.push(surf({ // one swept blade
        f: (u, v) => {
          const r = 0.06 + u * (FR - 0.07);
          const ang = (bi + v * 0.68) * 2 * Math.PI / NB + u * 0.85;
          return V3(r * Math.cos(ang), r * Math.sin(ang), 0.072 + 0.018 * (v - 0.5));
        },
        color: (p, n, u, v) => mixC(mixC([0.2, 0.21, 0.25], [0.42, 0.44, 0.5], u), [0.62, 0.64, 0.7], smooth(0.8, 1, v) * 0.7),
        mat: { amb: 0.45, dif: 0.6, spec: 0.7, shin: 30, two: true }, k: 0.5,
      }));
    }
    fp.push(surf({ // hub
      f: (u, v) => V3(0.055 * Math.sqrt(u) * Math.cos(v * 6.283), 0.055 * Math.sqrt(u) * Math.sin(v * 6.283), 0.078 + 0.01 * (1 - u)),
      color: (p) => (Math.hypot(p.x, p.y) < 0.025 ? [0.75, 0.78, 0.85] : [0.12, 0.12, 0.14]), mat: metal, w: 1.2,
    }));
    const m = toMesh(assemble(fp, fanBudget, rng));
    m.position.copy(f);
    mesh.add(m);
    return m;
  });
  mesh.userData.splatCount += fans.reduce((s, m) => s + m.userData.splatCount, 0);
  mesh.userData.fans = fans;
  return mesh;
}

const BUILDERS = { cherry, robot, vase, chair, board, gpu };

export function buildObject(name, { count = 4000, rng = mulberry32(7) } = {}) {
  const b = BUILDERS[name];
  if (!b) throw new Error('unknown object ' + name);
  const mesh = b(count, rng);
  mesh.name = name;
  const baseY = mesh.rotation.y;
  // idle: slow sway; fans spin on the GPU
  mesh.userData.idle = (t) => {
    mesh.rotation.y = baseY + 0.35 * Math.sin(t * 0.45);
    if (name === 'robot' || name === 'cherry') mesh.position.y = (mesh.userData.baseY ?? 0) + 0.012 * Math.sin(t * 1.6);
    if (mesh.userData.fans) mesh.userData.fans.forEach((f, i) => { f.rotation.z = -t * (3 + i * 0.4); });
  };
  return mesh;
}

// Soft dark ellipse under an object (local units), so it sits on the floor.
// FOOT: half axes (x, z) of each object's footprint.
export const FOOT = { cherry: [0.4, 0.25], robot: [0.3, 0.2], vase: [0.32, 0.32], chair: [0.3, 0.3], board: [0.55, 0.25], gpu: [0.6, 0.18] };
export function contactShadow(rx, rz) {
  const ps = new PackedSplats(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const col = new THREE.Color(0.03, 0.02, 0.015), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const x = i / 3, z = j / 3, d = x * x + z * z;
    if (d > 1) continue;
    p.set(x * rx, 0.003, z * rz); sc.set(rx * 0.32, rz * 0.32, 0.002);
    ps.pushSplat(p, sc, q, 0.5 * (1 - 0.75 * d), col);
  }
  return new SplatMesh({ packedSplats: ps });
}
