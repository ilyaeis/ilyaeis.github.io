// ── Projects tunnel ────────────────────────────────────────────────
// An endless, snaking tunnel of glowing helical strands and faint rings.
// The centreline is an analytic curve in a local frame (origin `origin`,
// local +z = `axis`): x(s), y(s) are sums of sines and z(s) = s. Nothing
// is generated on the CPU per frame. The vertex shader re-samples a
// window [s0 - WINDOW_BACK, s0 + WINDOW_AHEAD] of the curve around the
// viewer's arc position s0 (setView), so the tunnel never ends.
//
// All time motion (strand spin, travelling pulses, radius breathing, the
// snake wobble) is GPU-only. The wobble is zero near the viewer, so the
// comet flies the static centreline (centreWorld) and the camera path
// does not depend on time.
//
// The warp (orchestrator) drives setFade / setRush / setVortex and the
// star streaks (updateStreaks). Both ends of the tunnel are wormhole
// mouths: before s = flareIn and after s = flareOut (setFlare) the wall
// flares out like a trumpet and swirls as a vortex, so the comet dives
// into a funnel made of the tunnel's own rings and strands, and on exit
// they open up and dissolve behind it.

import * as THREE from 'three';
import { isMobile } from './attractors.js';

// ── Tuning ─────────────────────────────────────────────────────────
export const TUNNEL_RADIUS = 4.5;
// Centreline: x = A1 sin(2πs/P1 + φ1) + A2 sin(2πs/P2 + φ2), y = B1 sin(2πs/Q1 + φ3) + B2 cos(2πs/Q2 + φ4).
// Curvature ≤ ~0.055 /unit: at 12 u/s the heading turns ≤ ~40 deg/s.
const AMP = [3.0, 0.6, 2.0, 0.5];
const PERIOD = [60, 33, 50, 28];
const WINDOW_BACK = 22;                  // units of tunnel drawn behind the viewer
const WINDOW_AHEAD = 44;                 // ... and ahead
const EDGE_FADE_BACK = 8;                // alpha ramps at the window ends
const EDGE_FADE_AHEAD = 16;
const FAR_DIM = [6, 32, 0.12];           // alpha × this far down the tunnel (keeps the vanishing point calm)
const FLARE_LENGTH = 11;                 // mouth: radius × e^(d / this), d = distance past the tunnel end
const FLARE_MAX = 14;                    // radius factor cap at the far mouth
const FLARE_ALPHA = 0.5;                 // alpha × factor^-this (the wide mouth stays faint)
const VORTEX_SPEED = 1.6;                // rad/s the mouth swirls during the warp
// Strands: pitch (units per turn), handedness, angle offset, palette position, alpha
const STRANDS = [
    { pitch: 9, hand: 1, off: 0.0, col: 0.0, alpha: 0.42 },
    { pitch: 9, hand: 1, off: Math.PI, col: 0.15, alpha: 0.42 },
    { pitch: 14, hand: -1, off: 1.1, col: 0.5, alpha: 0.36 },
    { pitch: 14, hand: -1, off: 1.1 + Math.PI, col: 0.65, alpha: 0.36 },
    { pitch: 22, hand: 1, off: 2.3, col: 0.9, alpha: 0.3 },
    { pitch: 22, hand: 1, off: 2.3 + Math.PI, col: 1.05, alpha: 0.3 }
];
const STRAND_SAMPLES = isMobile ? 900 : 1800;
const RING_SPACING = 3.0;
const RING_SEGMENTS = isMobile ? 32 : 48;
const RING_ALPHA = 0.1;
const RING_BEADS = 6.0;                  // bright beads per ring (they show the section spin)
// Spin: every stretch of tunnel rotates back and forth with its own phase,
// so neighbouring stretches turn in opposite directions (bounded twist)
const SPIN_GLOBAL = 0.12;                // rad/s, whole tunnel
const SPIN_OSC_AMP = 1.4;                // rad
const SPIN_OSC_FREQ = 0.45;              // rad/s
const SPIN_OSC_PERIOD = 37;              // units along s
// Travelling pulses (HDR, the only part that blooms hard)
const PULSE_SPACING = 11;                // units between pulses
const PULSE_SPEED = 6;                   // units/s forward
const PULSE_RUSH = 6;                    // speed × (1 + this × rush) in the warp
const PULSE_GAIN = 1.3;                  // peak extra intensity
const PULSE_SHARP = 10.0;                // pow() sharpness
// Breathing radius and the far snake wobble
const BREATH_AMP = 0.05;                 // × radius
const WOBBLE_AMP = 1.1;                  // units, only far from the viewer
const WOBBLE_NEAR = [6, 18];             // |s - s0| ramp for the wobble
// Colours: the tunnel glows from deep blue to violet
const COLORS = [new THREE.Color(0x2255dd), new THREE.Color(0x3aa0ff), new THREE.Color(0xa040ff)];
// Warp star streaks
const STREAK_COUNT = isMobile ? 80 : 160;
const STREAK_R = [1.2, 9];               // cylinder radius around the comet
const STREAK_LEN = [2.5, 9];
const STREAK_SPAN = 60;                  // cylinder length (wraps)
const STREAK_SPEED = 55;                 // units/s backwards past the comet
const STREAK_INTENSITY = 1.6;

// ── Shaders ────────────────────────────────────────────────────────
const COMMON = /* glsl */`
    uniform vec3 uOrigin, uLX, uLY, uLZ;
    uniform vec4 uAmp, uFreq, uPhase;
    uniform float uS0, uTime, uSpin, uOsc, uPulse, uRush, uFade, uFlareIn, uFlareOut, uVortex;
    uniform vec3 uCol0, uCol1, uCol2;
    varying vec3 vColor;
    varying float vAlpha;

    vec2 centreXY(float s) {
        return vec2(uAmp.x * sin(uFreq.x * s + uPhase.x) + uAmp.y * sin(uFreq.y * s + uPhase.y),
                    uAmp.z * sin(uFreq.z * s + uPhase.z) + uAmp.w * cos(uFreq.w * s + uPhase.w));
    }
    vec2 centreXYd(float s) {
        return vec2(uAmp.x * uFreq.x * cos(uFreq.x * s + uPhase.x) + uAmp.y * uFreq.y * cos(uFreq.y * s + uPhase.y),
                    uAmp.z * uFreq.z * cos(uFreq.z * s + uPhase.z) - uAmp.w * uFreq.w * sin(uFreq.w * s + uPhase.w));
    }
    // Centre with the far-only snake wobble
    vec3 centreW(float s) {
        vec2 c = centreXY(s);
        float w = ${WOBBLE_AMP.toFixed(3)} * smoothstep(${WOBBLE_NEAR[0].toFixed(1)}, ${WOBBLE_NEAR[1].toFixed(1)}, abs(s - uS0));
        c += w * vec2(sin(0.9 * uTime + 0.21 * s), cos(0.7 * uTime + 0.17 * s));
        return uOrigin + c.x * uLX + c.y * uLY + s * uLZ;
    }
    void frameAt(float s, out vec3 R, out vec3 U) {
        vec2 d = centreXYd(s);
        vec3 T = normalize(d.x * uLX + d.y * uLY + uLZ);
        R = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
        U = cross(R, T);
    }
    float sectionSpin(float s, float j) {
        return uSpin + ${SPIN_OSC_AMP.toFixed(3)} * sin(uOsc + 6.2831853 * s / ${SPIN_OSC_PERIOD.toFixed(1)} + 2.0 * j);
    }
    // Wormhole mouths: 1 inside the tunnel, growing past either end
    float flare(float s) {
        float d = max(uFlareIn - s, 0.0) + max(s - uFlareOut, 0.0);
        return min(exp(d / ${FLARE_LENGTH.toFixed(1)}), ${FLARE_MAX.toFixed(1)});
    }
    // Extra swirl of the mouths (0 in the tunnel, so the twist stays bounded there)
    float vortex(float s) { return uVortex * (1.0 - 1.0 / flare(s)); }
    float radiusAt(float s) {
        return ${TUNNEL_RADIUS.toFixed(3)} * flare(s) * (1.0 + ${BREATH_AMP.toFixed(3)} * sin(6.2831853 * s / 13.0 - 1.3 * uTime));
    }
    float windowAlpha(float s) {
        float sMin = uS0 - ${WINDOW_BACK.toFixed(1)}, sMax = uS0 + ${WINDOW_AHEAD.toFixed(1)};
        float a = smoothstep(sMin, sMin + ${EDGE_FADE_BACK.toFixed(1)}, s) * (1.0 - smoothstep(sMax - ${EDGE_FADE_AHEAD.toFixed(1)}, sMax, s));
        // far dimming counts from the entry throat when the viewer is still before it (the funnel ahead stays bright)
        a *= mix(1.0, ${FAR_DIM[2].toFixed(3)}, smoothstep(${FAR_DIM[0].toFixed(1)}, ${FAR_DIM[1].toFixed(1)}, s - max(uS0, uFlareIn)));
        a *= pow(flare(s), -${FLARE_ALPHA.toFixed(2)});
        return a * uFade;
    }
    float pulseAt(float s) {
        float p = 0.5 + 0.5 * cos(6.2831853 * (s - uPulse) / ${PULSE_SPACING.toFixed(1)});
        return 1.0 + ${PULSE_GAIN.toFixed(3)} * (1.0 + 1.5 * uRush) * pow(p, ${PULSE_SHARP.toFixed(1)});
    }
    vec3 palette(float t) {
        t = fract(t);
        float u = t * 3.0;
        if (u < 1.0) return mix(uCol0, uCol1, u);
        if (u < 2.0) return mix(uCol1, uCol2, u - 1.0);
        return mix(uCol2, uCol0, u - 2.0);
    }
`;

const STRAND_VERTEX = /* glsl */`
    ${COMMON}
    attribute float aIdx;
    uniform float uPitch, uHand, uOff, uColT, uAlpha, uJ, uDs;
    void main() {
        float sBase = floor((uS0 - ${WINDOW_BACK.toFixed(1)}) / uDs) * uDs;
        float s = sBase + aIdx * uDs;
        vec3 R, U;
        frameAt(s, R, U);
        float th = uHand * 6.2831853 * s / uPitch + uOff + 0.8 * sin(6.2831853 * s / 31.0 + uJ) + sectionSpin(s, uJ) + vortex(s);
        vec3 p = centreW(s) + radiusAt(s) * (cos(th) * R + sin(th) * U);
        float k = pulseAt(s);
        vColor = palette(uColT + s / 90.0) * k;
        vAlpha = uAlpha * windowAlpha(s);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }
`;

const RING_VERTEX = /* glsl */`
    ${COMMON}
    attribute vec2 aRing;               // ring index, angle (rad)
    void main() {
        float sBase = floor((uS0 - ${WINDOW_BACK.toFixed(1)}) / ${RING_SPACING.toFixed(2)}) * ${RING_SPACING.toFixed(2)};
        float s = sBase + aRing.x * ${RING_SPACING.toFixed(2)};
        vec3 R, U;
        frameAt(s, R, U);
        float spin = sectionSpin(s, 0.0) + vortex(s);
        float th = aRing.y + spin;
        vec3 p = centreW(s) + radiusAt(s) * (cos(th) * R + sin(th) * U);
        float bead = pow(0.5 + 0.5 * cos(${RING_BEADS.toFixed(1)} * aRing.y), 6.0);
        float k = pulseAt(s);
        vColor = palette(0.4 + s / 90.0) * k * (0.6 + 1.2 * bead);
        vAlpha = ${RING_ALPHA.toFixed(3)} * windowAlpha(s);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }
`;

const FRAGMENT = /* glsl */`
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        if (vAlpha < 0.003) discard;
        gl_FragColor = vec4(vColor, vAlpha);
    }
`;

const STREAK_VERTEX = /* glsl */`
    attribute vec3 color;
    attribute float aAlpha;
    uniform float uWarp;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        vColor = color;
        vAlpha = aAlpha * uWarp;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// ── State ──────────────────────────────────────────────────────────
const origin = new THREE.Vector3();
const LX = new THREE.Vector3(), LY = new THREE.Vector3(), LZ = new THREE.Vector3();
const freq = PERIOD.map(p => 2 * Math.PI / p);
const phase = [0, 0, 0, 0];
let uniforms = null;
let objects = [];
let streaks = null;
const streakState = [];                  // { r, ang, z, len }

// ── Centreline (JS mirror of the shader, without the wobble) ──────
function cx(s) { return AMP[0] * Math.sin(freq[0] * s + phase[0]) + AMP[1] * Math.sin(freq[1] * s + phase[1]); }
function cy(s) { return AMP[2] * Math.sin(freq[2] * s + phase[2]) + AMP[3] * Math.cos(freq[3] * s + phase[3]); }
function dcx(s) { return AMP[0] * freq[0] * Math.cos(freq[0] * s + phase[0]) + AMP[1] * freq[1] * Math.cos(freq[1] * s + phase[1]); }
function dcy(s) { return AMP[2] * freq[2] * Math.cos(freq[2] * s + phase[2]) - AMP[3] * freq[3] * Math.sin(freq[3] * s + phase[3]); }

export function centreWorld(s, out) {
    const x = cx(s), y = cy(s);
    return out.copy(origin).addScaledVector(LX, x).addScaledVector(LY, y).addScaledVector(LZ, s);
}
export function tangentWorld(s, out) {
    return out.set(0, 0, 0).addScaledVector(LX, dcx(s)).addScaledVector(LY, dcy(s)).add(LZ).normalize();
}
const _Y = new THREE.Vector3(0, 1, 0);
// Upright frame (right, up) around the tangent, as planar stops use it
const _T = new THREE.Vector3();
export function frameWorld(s, right, up) {
    const T = tangentWorld(s, _T);
    right.crossVectors(T, _Y).normalize();
    up.crossVectors(right, T).normalize();
}
// Arc parameter of a world point (its local z; exact on the centreline)
export function sOf(p) { return (p.x - origin.x) * LZ.x + (p.y - origin.y) * LZ.y + (p.z - origin.z) * LZ.z; }
// Distance from p to the tunnel axis segment [0, length] (for placement)
export function axisDistance(p, length) {
    const s = THREE.MathUtils.clamp(sOf(p), 0, length);
    return p.distanceTo(origin.clone().addScaledVector(LZ, s));
}

// ── Build ──────────────────────────────────────────────────────────
// Sets the frame only (placement uses it before the geometry exists)
export function setFrame(o, axis) {
    origin.copy(o);
    LZ.copy(axis).normalize();
    LX.crossVectors(_Y, LZ).normalize();
    LY.crossVectors(LZ, LX).normalize();
    for (let i = 0; i < 4; i++) phase[i] = Math.random() * Math.PI * 2;
}

export function build(scene) {
    uniforms = {
        uOrigin: { value: origin }, uLX: { value: LX }, uLY: { value: LY }, uLZ: { value: LZ },
        uAmp: { value: new THREE.Vector4(...AMP) },
        uFreq: { value: new THREE.Vector4(...freq) },
        uPhase: { value: new THREE.Vector4(...phase) },
        uS0: { value: 0 }, uTime: { value: 0 }, uSpin: { value: 0 }, uOsc: { value: 0 },
        uPulse: { value: 0 }, uRush: { value: 0 }, uFade: { value: 0 },
        uFlareIn: { value: -1e6 }, uFlareOut: { value: 1e6 }, uVortex: { value: 0 },
        uCol0: { value: COLORS[0] }, uCol1: { value: COLORS[1] }, uCol2: { value: COLORS[2] }
    };
    const ds = (WINDOW_BACK + WINDOW_AHEAD) / (STRAND_SAMPLES - 1);
    const idx = new Float32Array(STRAND_SAMPLES);
    for (let i = 0; i < STRAND_SAMPLES; i++) idx[i] = i;
    const strandGeo = new THREE.BufferGeometry();
    strandGeo.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1));
    strandGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STRAND_SAMPLES * 3), 3));

    objects = [];
    STRANDS.forEach((st, j) => {
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                ...uniforms,
                uPitch: { value: st.pitch }, uHand: { value: st.hand }, uOff: { value: st.off },
                uColT: { value: st.col }, uAlpha: { value: st.alpha }, uJ: { value: j }, uDs: { value: ds }
            },
            vertexShader: STRAND_VERTEX, fragmentShader: FRAGMENT,
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        });
        objects.push(new THREE.Line(strandGeo, mat));
    });

    const rings = Math.ceil((WINDOW_BACK + WINDOW_AHEAD) / RING_SPACING) + 1;
    const ringAttr = new Float32Array(rings * RING_SEGMENTS * 2 * 2);
    let k = 0;
    for (let r = 0; r < rings; r++) {
        for (let a = 0; a < RING_SEGMENTS; a++) {
            ringAttr[k++] = r; ringAttr[k++] = a / RING_SEGMENTS * Math.PI * 2;
            ringAttr[k++] = r; ringAttr[k++] = (a + 1) / RING_SEGMENTS * Math.PI * 2;
        }
    }
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('aRing', new THREE.BufferAttribute(ringAttr, 2));
    ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ringAttr.length / 2 * 3), 3));
    objects.push(new THREE.LineSegments(ringGeo, new THREE.ShaderMaterial({
        uniforms, vertexShader: RING_VERTEX, fragmentShader: FRAGMENT,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    })));

    for (const o of objects) {
        o.frustumCulled = false;
        o.visible = false;               // uFade = 0 until the warp
        scene.add(o);
    }
    buildStreaks(scene);
}

// ── Per-frame controls ─────────────────────────────────────────────
export function setView(s) { if (uniforms) uniforms.uS0.value = s; }
export function setFade(f) {
    if (!uniforms) return;
    uniforms.uFade.value = f;
    for (const o of objects) o.visible = f > 0.001;
}
export function setRush(r) { if (uniforms) uniforms.uRush.value = r; }
// The two tunnel ends (s), where the wormhole mouths open
export function setFlare(sIn, sOut) { if (uniforms) { uniforms.uFlareIn.value = sIn; uniforms.uFlareOut.value = sOut; } }
// t = seconds into the warp flight: the mouths swirl (only seen during the warp)
export function setVortex(t) { if (uniforms) uniforms.uVortex.value = VORTEX_SPEED * t; }

export function update(dt) {
    if (!uniforms) return;
    const u = uniforms;
    u.uTime.value += dt;
    u.uSpin.value = (u.uSpin.value + SPIN_GLOBAL * dt) % (Math.PI * 2);
    u.uOsc.value = (u.uOsc.value + SPIN_OSC_FREQ * dt) % (Math.PI * 2);
    // Accumulated, so a rush change speeds the pulses up without a jump
    u.uPulse.value = (u.uPulse.value + PULSE_SPEED * (1 + PULSE_RUSH * u.uRush.value) * dt) % PULSE_SPACING;
}

// ── Warp star streaks ──────────────────────────────────────────────
// Lines parallel to the flight around the comet, rushing backwards.
function buildStreaks(scene) {
    const n = STREAK_COUNT;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    const alpha = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
        streakState.push({
            r: THREE.MathUtils.lerp(STREAK_R[0], STREAK_R[1], Math.sqrt(Math.random())),
            ang: Math.random() * Math.PI * 2,
            z: Math.random() * STREAK_SPAN,
            len: THREE.MathUtils.lerp(STREAK_LEN[0], STREAK_LEN[1], Math.random())
        });
        const c = COLORS[i % 3].clone().lerp(new THREE.Color(1, 1, 1), 0.55);
        // head bright, tail dark
        col.set([c.r * STREAK_INTENSITY, c.g * STREAK_INTENSITY, c.b * STREAK_INTENSITY, 0, 0, 0], i * 6);
        alpha[i * 2] = 0.9; alpha[i * 2 + 1] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    streaks = new THREE.LineSegments(geo, new THREE.ShaderMaterial({
        uniforms: { uWarp: { value: 0 } },
        vertexShader: STREAK_VERTEX, fragmentShader: FRAGMENT,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    streaks.frustumCulled = false;
    streaks.visible = false;
    scene.add(streaks);
}

const _sr = new THREE.Vector3(), _su = new THREE.Vector3(), _sp = new THREE.Vector3();
// w = warp strength 0..1; the streaks sit around `pos`, along `dir`
export function updateStreaks(dt, pos, dir, w) {
    if (!streaks) return;
    streaks.visible = w > 0.002;
    streaks.material.uniforms.uWarp.value = w;
    if (!streaks.visible) return;
    _sr.crossVectors(dir, _Y);
    if (_sr.lengthSq() < 1e-6) _sr.set(1, 0, 0);
    _sr.normalize();
    _su.crossVectors(_sr, dir).normalize();
    const arr = streaks.geometry.attributes.position.array;
    const speed = STREAK_SPEED * (0.4 + 0.6 * w);
    streakState.forEach((st, i) => {
        st.z = (st.z - speed * dt + STREAK_SPAN * 4) % STREAK_SPAN;
        const along = st.z - STREAK_SPAN * 0.35;          // most streaks ahead of the comet
        _sp.copy(pos).addScaledVector(_sr, Math.cos(st.ang) * st.r)
            .addScaledVector(_su, Math.sin(st.ang) * st.r).addScaledVector(dir, along);
        arr[i * 6] = _sp.x; arr[i * 6 + 1] = _sp.y; arr[i * 6 + 2] = _sp.z;
        const L = st.len * (0.5 + w);
        arr[i * 6 + 3] = _sp.x - dir.x * L; arr[i * 6 + 4] = _sp.y - dir.y * L; arr[i * 6 + 5] = _sp.z - dir.z * L;
    });
    streaks.geometry.attributes.position.needsUpdate = true;
}

