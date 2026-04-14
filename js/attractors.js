// ── Strange Attractor Journey ──────────────────────────────────────
// Fullscreen Three.js visualization: Lorenz → Rössler → Thomas → Aizawa → Halvorsen, looping.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ── Constants ──────────────────────────────────────────────────────
const DRAW_DURATION = 60;       // seconds per attractor
const TRANSITION_DURATION = 15; // seconds per transition
const DECAY_RATE = 4.0;         // exponential alpha falloff
const POINTS_PER_FRAME_MIN = 50;
const POINTS_PER_FRAME_MAX = 300;
const RAMP_DURATION = 5;        // seconds to ramp from min to max points/frame
const AUTO_ROTATE_RESUME_DELAY = 5000; // ms of inactivity before auto-rotate resumes

// ── Mobile detection ───────────────────────────────────────────────
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && window.innerWidth < 768);
const MAX_POINTS = isMobile ? 30000 : 60000;
const BLOOM_RES_SCALE = isMobile ? 0.25 : 0.5;
const MAX_PIXEL_RATIO = isMobile ? 1.5 : 2;

// ── Attractor Definitions ──────────────────────────────────────────
const ATTRACTORS = [
    {
        name: 'lorenz',
        params: { sigma: 10, rho: 28, beta: 8 / 3 },
        derivatives: (x, y, z, p) => [
            p.sigma * (y - x),
            x * (p.rho - z) - y,
            x * y - p.beta * z
        ],
        dt: 0.005,
        scale: 0.05,
        initialCondition: [0.1, 0, 0],
        palette: [new THREE.Color(0xffbf00), new THREE.Color(0xff8800), new THREE.Color(0xdd3300)],
        camera: { radius: 2.8, elevation: 0.5, azimuthSpeed: 0.7 }
    },
    {
        name: 'rossler',
        params: { a: 0.2, b: 0.2, c: 5.7 },
        derivatives: (x, y, z, p) => [
            -(y + z),
            x + p.a * y,
            p.b + z * (x - p.c)
        ],
        dt: 0.008,
        scale: 0.08,
        initialCondition: [0.1, 0, 0],
        palette: [new THREE.Color(0x2266cc), new THREE.Color(0x00aacc), new THREE.Color(0x00ddbb)],
        camera: { radius: 3.2, elevation: 1.0, azimuthSpeed: 0.5 }
    },
    {
        name: 'thomas',
        params: { b: 0.208186 },
        derivatives: (x, y, z, p) => [
            Math.sin(y) - p.b * x,
            Math.sin(z) - p.b * y,
            Math.sin(x) - p.b * z
        ],
        dt: 0.05,
        scale: 0.35,
        initialCondition: [1.1, 1.1, -0.01],
        palette: [new THREE.Color(0x8833cc), new THREE.Color(0xcc33aa), new THREE.Color(0xff44cc)],
        camera: { radius: 2.5, elevation: 0.4, azimuthSpeed: 0.6 }
    },
    {
        name: 'aizawa',
        params: { a: 0.95, b: 0.7, c: 0.6, d: 3.5, e: 0.25, f: 0.1 },
        derivatives: (x, y, z, p) => [
            (z - p.b) * x - p.d * y,
            p.d * x + (z - p.b) * y,
            p.c + p.a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + p.e * z) + p.f * z * x * x * x
        ],
        dt: 0.005,
        scale: 0.6,
        initialCondition: [0.1, 0, 0],
        palette: [new THREE.Color(0x22aa44), new THREE.Color(0x00ccaa), new THREE.Color(0x00eedd)],
        camera: { radius: 2.6, elevation: 0.6, azimuthSpeed: 0.5 }
    },
    {
        name: 'halvorsen',
        params: { a: 1.89 },
        derivatives: (x, y, z, p) => [
            -p.a * x - 4 * y - 4 * z - y * y,
            -p.a * y - 4 * z - 4 * x - z * z,
            -p.a * z - 4 * x - 4 * y - x * x
        ],
        dt: 0.004,
        scale: 0.06,
        initialCondition: [-1.48, -1.51, 2.04],
        palette: [new THREE.Color(0xccaa00), new THREE.Color(0xeecc44), new THREE.Color(0xffffff)],
        camera: { radius: 3.0, elevation: 0.5, azimuthSpeed: 0.6 }
    }
];

// ── Shader Source ───────────────────────────────────────────────────
const VERTEX_SHADER = `
    attribute float alpha;
    attribute vec3 color;
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
        vAlpha = alpha;
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const FRAGMENT_SHADER = `
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
        if (vAlpha < 0.003) discard;
        gl_FragColor = vec4(vColor, vAlpha);
    }
`;

const GLOW_VERTEX_SHADER = `
    uniform float uSize;
    void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const GLOW_FRAGMENT_SHADER = `
    uniform vec3 uColor;
    uniform float uOpacity;
    void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float intensity = 1.0 - smoothstep(0.0, 0.5, d);
        intensity = pow(intensity, 2.0);
        gl_FragColor = vec4(uColor, intensity * uOpacity);
    }
`;

// ── RK4 Integrator ─────────────────────────────────────────────────
function rk4Step(derivFn, x, y, z, dt, params) {
    const k1 = derivFn(x, y, z, params);
    const k2 = derivFn(x + k1[0] * dt / 2, y + k1[1] * dt / 2, z + k1[2] * dt / 2, params);
    const k3 = derivFn(x + k2[0] * dt / 2, y + k2[1] * dt / 2, z + k2[2] * dt / 2, params);
    const k4 = derivFn(x + k3[0] * dt, y + k3[1] * dt, z + k3[2] * dt, params);
    return [
        x + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
        y + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
        z + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
    ];
}

function cubicEaseInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Module State ───────────────────────────────────────────────────
let scene, camera, renderer, composer, controls, bloomPass;
let trailLine, trailGeometry, trailMaterial;
let glowPoint, glowGeometry, glowMaterial;
let paused = false;

// Trail buffer
const positions = new Float32Array(MAX_POINTS * 3);
const alphas = new Float32Array(MAX_POINTS);
const colors = new Float32Array(MAX_POINTS * 3);
let pointCount = 0;

// Integration state
let state = [0, 0, 0]; // current x, y, z
let journeyTime = 0;   // total elapsed journey time
let phaseTime = 0;      // time within current phase
let currentIndex = 0;   // current attractor index
let isTransitioning = false;
let lastInteractionTime = 0;

// ── Color Helpers ──────────────────────────────────────────────────
const _tmpColor = new THREE.Color();
const _tmpColor2 = new THREE.Color();
const _white = new THREE.Color(1, 1, 1);
const _tipColor = new THREE.Color();

function getPaletteColor(palette, t) {
    // t in [0, 1] → interpolate through palette stops
    const n = palette.length - 1;
    const i = Math.min(Math.floor(t * n), n - 1);
    const f = t * n - i;
    _tmpColor.copy(palette[i]).lerp(palette[Math.min(i + 1, n)], f);
    return _tmpColor;
}

function getJourneyColor(t) {
    // t is fractional age [0=newest, 1=oldest]
    // Newest points get end of palette, oldest get start
    const palT = 1.0 - t;
    if (!isTransitioning) {
        return getPaletteColor(ATTRACTORS[currentIndex].palette, palT);
    }
    // During transition, blend between two palettes (zero allocations)
    const blend = cubicEaseInOut(Math.min(phaseTime / TRANSITION_DURATION, 1));
    const nextIndex = (currentIndex + 1) % ATTRACTORS.length;
    getPaletteColor(ATTRACTORS[currentIndex].palette, palT);
    _tmpColor2.copy(_tmpColor);
    getPaletteColor(ATTRACTORS[nextIndex].palette, palT);
    _tmpColor2.lerp(_tmpColor, blend);
    _tmpColor.copy(_tmpColor2);
    return _tmpColor;
}

// ── Scene Setup ────────────────────────────────────────────────────
function initScene(canvas) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.1);

    camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    const cam0 = ATTRACTORS[0].camera;
    camera.position.set(
        cam0.radius * Math.cos(cam0.elevation),
        cam0.radius * Math.sin(cam0.elevation),
        cam0.radius * Math.cos(cam0.elevation)
    );

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);

    // Post-processing — render target with alpha for transparency
    const bloomW = Math.floor(w * BLOOM_RES_SCALE);
    const bloomH = Math.floor(h * BLOOM_RES_SCALE);
    const rtParams = {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType
    };
    const renderTarget = new THREE.WebGLRenderTarget(w, h, rtParams);
    composer = new EffectComposer(renderer, renderTarget);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(bloomW, bloomH), 1.2, 0.5, 0.1);
    composer.addPass(bloomPass);

    // Controls — rotation only, no zoom, no pan
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = ATTRACTORS[0].camera.azimuthSpeed;
    controls.target.set(0, 0, 0);

    // Detect user interaction to pause auto-rotate
    canvas.addEventListener('pointerdown', () => { lastInteractionTime = performance.now(); });
    canvas.addEventListener('pointermove', (e) => {
        if (e.buttons > 0) lastInteractionTime = performance.now();
    });
}

// ── Trail Line ─────────────────────────────────────────────────────
function initTrail() {
    trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    trailGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    trailGeometry.setDrawRange(0, 0);

    trailMaterial = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    trailLine = new THREE.Line(trailGeometry, trailMaterial);
    trailLine.frustumCulled = false;
    scene.add(trailLine);
}

// ── Head Glow ──────────────────────────────────────────────────────
function initGlow() {
    glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));

    glowMaterial = new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX_SHADER,
        fragmentShader: GLOW_FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
            uSize: { value: 0.15 },
            uColor: { value: new THREE.Color(1, 1, 1) },
            uOpacity: { value: 1.0 }
        }
    });

    glowPoint = new THREE.Points(glowGeometry, glowMaterial);
    glowPoint.frustumCulled = false;
    scene.add(glowPoint);
}

// ── Integration & Buffer ───────────────────────────────────────────
function getDerivativeFn() {
    if (!isTransitioning) {
        return ATTRACTORS[currentIndex].derivatives;
    }
    const blend = cubicEaseInOut(Math.min(phaseTime / TRANSITION_DURATION, 1));
    const a = ATTRACTORS[currentIndex];
    const b = ATTRACTORS[(currentIndex + 1) % ATTRACTORS.length];
    return (x, y, z) => {
        const da = a.derivatives(x, y, z, a.params);
        const db = b.derivatives(x, y, z, b.params);
        return [
            da[0] * (1 - blend) + db[0] * blend,
            da[1] * (1 - blend) + db[1] * blend,
            da[2] * (1 - blend) + db[2] * blend
        ];
    };
}

function getCurrentDt() {
    if (!isTransitioning) {
        return ATTRACTORS[currentIndex].dt;
    }
    // Adaptive: blend dt and halve during transition for stability
    const blend = cubicEaseInOut(Math.min(phaseTime / TRANSITION_DURATION, 1));
    const a = ATTRACTORS[currentIndex];
    const b = ATTRACTORS[(currentIndex + 1) % ATTRACTORS.length];
    return (a.dt * (1 - blend) + b.dt * blend) * 0.5;
}

function getCurrentScale() {
    if (!isTransitioning) {
        return ATTRACTORS[currentIndex].scale;
    }
    const blend = cubicEaseInOut(Math.min(phaseTime / TRANSITION_DURATION, 1));
    const a = ATTRACTORS[currentIndex];
    const b = ATTRACTORS[(currentIndex + 1) % ATTRACTORS.length];
    return a.scale * (1 - blend) + b.scale * blend;
}

function pushPoint(x, y, z) {
    const scale = getCurrentScale();
    const sx = x * scale;
    const sy = y * scale;
    const sz = z * scale;

    if (pointCount < MAX_POINTS) {
        // Buffer growing — just append
        const i3 = pointCount * 3;
        positions[i3] = sx;
        positions[i3 + 1] = sy;
        positions[i3 + 2] = sz;
        pointCount++;
    } else {
        // Buffer full — shift by tailShift, write new point at end
        const shift = isTransitioning ? 3 : 1;
        const actualShift = Math.min(shift, pointCount);
        if (actualShift > 0) {
            positions.copyWithin(0, actualShift * 3, pointCount * 3);
            colors.copyWithin(0, actualShift * 3, pointCount * 3);
            alphas.copyWithin(0, actualShift, pointCount);
            pointCount -= (actualShift - 1); // net: removed (shift-1) points
            const i3 = (pointCount - 1) * 3;
            positions[i3] = sx;
            positions[i3 + 1] = sy;
            positions[i3 + 2] = sz;
        }
    }
}

function clampState() {
    const limit = 150;
    for (let i = 0; i < 3; i++) {
        if (Math.abs(state[i]) > limit) {
            state[i] *= limit / Math.abs(state[i]);
        }
        if (!isFinite(state[i])) {
            // Reset to target attractor's initial condition
            const target = isTransitioning
                ? ATTRACTORS[(currentIndex + 1) % ATTRACTORS.length]
                : ATTRACTORS[currentIndex];
            state = [...target.initialCondition];
            return;
        }
    }
}

// ── Per-Frame Update ───────────────────────────────────────────────
function updateIntegration(dt) {
    journeyTime += dt;
    phaseTime += dt;

    // Phase transitions
    if (!isTransitioning && phaseTime >= DRAW_DURATION) {
        // Start transition to next attractor
        isTransitioning = true;
        phaseTime = 0;
    } else if (isTransitioning && phaseTime >= TRANSITION_DURATION) {
        // Transition complete — advance to next attractor
        currentIndex = (currentIndex + 1) % ATTRACTORS.length;
        isTransitioning = false;
        phaseTime = 0;
        // Set state to new attractor's initial condition to avoid lingering instability
        state = [...ATTRACTORS[currentIndex].initialCondition];
    }

    // Compute how many points to generate this frame (ramp up)
    const rampT = Math.min(phaseTime / RAMP_DURATION, 1);
    const pointsThisFrame = Math.floor(
        POINTS_PER_FRAME_MIN + (POINTS_PER_FRAME_MAX - POINTS_PER_FRAME_MIN) * rampT
    );

    const derivFn = getDerivativeFn();
    const stepDt = getCurrentDt();

    for (let i = 0; i < pointsThisFrame; i++) {
        state = rk4Step(derivFn, state[0], state[1], state[2], stepDt,
            isTransitioning ? {} : ATTRACTORS[currentIndex].params);
        clampState();
        pushPoint(state[0], state[1], state[2]);
    }
}

function updateAttributes() {
    // Update alpha (age-based exponential falloff) and color
    for (let i = 0; i < pointCount; i++) {
        const age = (pointCount - 1 - i) / Math.max(pointCount - 1, 1); // 0=newest, 1=oldest
        alphas[i] = Math.exp(-age * DECAY_RATE);

        const col = getJourneyColor(age);
        const i3 = i * 3;
        colors[i3] = col.r;
        colors[i3 + 1] = col.g;
        colors[i3 + 2] = col.b;
    }

    trailGeometry.attributes.position.needsUpdate = true;
    trailGeometry.attributes.alpha.needsUpdate = true;
    trailGeometry.attributes.color.needsUpdate = true;
    trailGeometry.setDrawRange(0, pointCount);
}

function updateGlow() {
    if (pointCount === 0) return;
    const i3 = (pointCount - 1) * 3;
    const pos = glowGeometry.attributes.position;
    pos.array[0] = positions[i3];
    pos.array[1] = positions[i3 + 1];
    pos.array[2] = positions[i3 + 2];
    pos.needsUpdate = true;

    // Pulse size
    const pulse = 0.12 + 0.04 * Math.sin(journeyTime * 3.0);
    glowMaterial.uniforms.uSize.value = pulse;

    // Color: brightest palette color shifted toward white
    const palette = isTransitioning
        ? ATTRACTORS[(currentIndex + 1) % ATTRACTORS.length].palette
        : ATTRACTORS[currentIndex].palette;
    _tipColor.copy(palette[palette.length - 1]).lerp(_white, 0.5);
    glowMaterial.uniforms.uColor.value.copy(_tipColor);
}

function updateCamera(dt) {
    // Auto-rotate pause/resume on user interaction
    const now = performance.now();
    const userActive = (now - lastInteractionTime) < AUTO_ROTATE_RESUME_DELAY;
    controls.autoRotate = !userActive;

    // Blend auto-rotate speed during transitions
    if (isTransitioning) {
        const blend = cubicEaseInOut(Math.min(phaseTime / TRANSITION_DURATION, 1));
        const a = ATTRACTORS[currentIndex].camera;
        const b = ATTRACTORS[(currentIndex + 1) % ATTRACTORS.length].camera;
        controls.autoRotateSpeed = a.azimuthSpeed * (1 - blend) + b.azimuthSpeed * blend;

        // Smoothly interpolate camera distance and elevation
        const radius = a.radius * (1 - blend) + b.radius * blend;
        const elevation = a.elevation * (1 - blend) + b.elevation * blend;
        if (!userActive) {
            // Only animate camera position when user isn't controlling
            const theta = controls.getAzimuthalAngle();
            camera.position.set(
                radius * Math.cos(elevation) * Math.sin(theta),
                radius * Math.sin(elevation),
                radius * Math.cos(elevation) * Math.cos(theta)
            );
        }
    }

    controls.update();
}

// ── Exported API ───────────────────────────────────────────────────
export function init(canvas) {
    initScene(canvas);
    initTrail();
    initGlow();

    // Set initial integration state
    state = [...ATTRACTORS[0].initialCondition];
}

export function update(dt) {
    if (paused) return;

    updateIntegration(dt);
    updateAttributes();
    updateGlow();
    updateCamera(dt);

    composer.render();
}

export function resize(w, h) {
    if (!renderer) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    const bloomW = Math.floor(w * BLOOM_RES_SCALE);
    const bloomH = Math.floor(h * BLOOM_RES_SCALE);
    bloomPass.resolution.set(bloomW, bloomH);
}

export function pause() {
    paused = true;
}

export function resume() {
    paused = false;
}
