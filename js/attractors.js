// ── Strange Attractor Journey ──────────────────────────────────────
// Fullscreen Three.js visualization: Lorenz → Rössler → Thomas → Aizawa → Halvorsen, looping.
// Transitions use dual-trail cross-fade: both attractors run pure dynamics,
// one fades out while the next fades in. No blended vector fields.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ── Constants ──────────────────────────────────────────────────────
const DRAW_DURATION = 30;       // seconds per attractor
const TRANSITION_DURATION = 10; // seconds for cross-fade
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
        scale: 0.042,
        center: [-0.08, -0.08, 23.56],
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
        scale: 0.066,
        center: [0.17, -0.88, 0.86],
        initialCondition: [0.1, 0, 0],
        palette: [new THREE.Color(0x2266cc), new THREE.Color(0x00aacc), new THREE.Color(0x00ddbb)],
        camera: { radius: 2.8, elevation: 1.0, azimuthSpeed: 0.5 }
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
        scale: 0.301,
        center: [1.89, 1.89, 1.91],
        initialCondition: [1.1, 1.1, -0.01],
        palette: [new THREE.Color(0x8833cc), new THREE.Color(0xcc33aa), new THREE.Color(0xff44cc)],
        camera: { radius: 2.8, elevation: 0.4, azimuthSpeed: 0.6 }
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
        scale: 0.776,
        center: [0.0, 0.0, 0.70],
        initialCondition: [0.1, 0, 0],
        palette: [new THREE.Color(0x22aa44), new THREE.Color(0x00ccaa), new THREE.Color(0x00eedd)],
        camera: { radius: 2.8, elevation: 0.6, azimuthSpeed: 0.5 }
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
        scale: 0.092,
        center: [-2.64, -2.64, -2.64],
        initialCondition: [-1.48, -1.51, 2.04],
        palette: [new THREE.Color(0xccaa00), new THREE.Color(0xeecc44), new THREE.Color(0xffffff)],
        camera: { radius: 2.8, elevation: 0.5, azimuthSpeed: 0.6 }
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

// ── Trail System ───────────────────────────────────────────────────
// Two independent trail systems enable smooth cross-fade transitions.
// Each has its own buffer, geometry, line, glow, and integration state.

function createTrailSystem() {
    const positions = new Float32Array(MAX_POINTS * 3);
    const alphas = new Float32Array(MAX_POINTS);
    const colors = new Float32Array(MAX_POINTS * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;

    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));

    const glowMaterial = new THREE.ShaderMaterial({
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

    const glowPoint = new THREE.Points(glowGeometry, glowMaterial);
    glowPoint.frustumCulled = false;

    return {
        positions, alphas, colors,
        pointCount: 0,
        geometry, material, line,
        glowGeometry, glowMaterial, glowPoint,
        state: [0, 0, 0],
        attractorIdx: 0,
        fade: 1.0,       // cross-fade multiplier: 0 = invisible, 1 = full
        inScene: false,   // whether line/glow are added to the scene
        drawTime: 0       // how long this trail has been drawing (for ramp)
    };
}

// ── Module State ───────────────────────────────────────────────────
let scene, camera, renderer, composer, controls, bloomPass;
let paused = false;

const trails = [null, null]; // two trail systems
let activeIdx = 0;           // which trail is currently the "live" one

// Timing
let journeyTime = 0;
let phaseTime = 0;
let currentIndex = 0;
let isTransitioning = false;
let lastInteractionTime = 0;

// ── Color Helpers ──────────────────────────────────────────────────
const _tmpColor = new THREE.Color();
const _white = new THREE.Color(1, 1, 1);
const _tipColor = new THREE.Color();

function getPaletteColor(palette, t) {
    const n = palette.length - 1;
    const i = Math.min(Math.floor(t * n), n - 1);
    const f = t * n - i;
    _tmpColor.copy(palette[i]).lerp(palette[Math.min(i + 1, n)], f);
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

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 1);

    // Post-processing
    const bloomW = Math.floor(w * BLOOM_RES_SCALE);
    const bloomH = Math.floor(h * BLOOM_RES_SCALE);
    composer = new EffectComposer(renderer);
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

// ── Trail helpers ──────────────────────────────────────────────────
function addTrailToScene(trail) {
    if (!trail.inScene) {
        scene.add(trail.line);
        scene.add(trail.glowPoint);
        trail.inScene = true;
    }
}

function removeTrailFromScene(trail) {
    if (trail.inScene) {
        scene.remove(trail.line);
        scene.remove(trail.glowPoint);
        trail.inScene = false;
    }
}

function clearTrail(trail) {
    trail.pointCount = 0;
    trail.drawTime = 0;
    trail.geometry.setDrawRange(0, 0);
}

function pushPoint(trail, x, y, z, scale, center) {
    const sx = (x - center[0]) * scale;
    const sy = (y - center[1]) * scale;
    const sz = (z - center[2]) * scale;

    if (trail.pointCount < MAX_POINTS) {
        const i3 = trail.pointCount * 3;
        trail.positions[i3] = sx;
        trail.positions[i3 + 1] = sy;
        trail.positions[i3 + 2] = sz;
        trail.pointCount++;
    } else {
        // Buffer full — shift oldest point out, append new one
        trail.positions.copyWithin(0, 3, trail.pointCount * 3);
        trail.colors.copyWithin(0, 3, trail.pointCount * 3);
        trail.alphas.copyWithin(0, 1, trail.pointCount);
        const i3 = (trail.pointCount - 1) * 3;
        trail.positions[i3] = sx;
        trail.positions[i3 + 1] = sy;
        trail.positions[i3 + 2] = sz;
    }
}

function clampTrailState(trail) {
    const limit = 150;
    for (let i = 0; i < 3; i++) {
        if (Math.abs(trail.state[i]) > limit) {
            trail.state[i] *= limit / Math.abs(trail.state[i]);
        }
        if (!isFinite(trail.state[i])) {
            const attr = ATTRACTORS[trail.attractorIdx];
            trail.state = [...attr.initialCondition];
            return;
        }
    }
}

function integrateTrail(trail, frameDt) {
    const attr = ATTRACTORS[trail.attractorIdx];
    trail.drawTime += frameDt;

    const rampT = Math.min(trail.drawTime / RAMP_DURATION, 1);
    const pointsThisFrame = Math.floor(
        POINTS_PER_FRAME_MIN + (POINTS_PER_FRAME_MAX - POINTS_PER_FRAME_MIN) * rampT
    );

    for (let i = 0; i < pointsThisFrame; i++) {
        trail.state = rk4Step(
            attr.derivatives,
            trail.state[0], trail.state[1], trail.state[2],
            attr.dt, attr.params
        );
        clampTrailState(trail);
        pushPoint(trail, trail.state[0], trail.state[1], trail.state[2], attr.scale, attr.center);
    }
}

function updateTrailAttributes(trail) {
    const palette = ATTRACTORS[trail.attractorIdx].palette;
    const fade = trail.fade;

    for (let i = 0; i < trail.pointCount; i++) {
        const age = (trail.pointCount - 1 - i) / Math.max(trail.pointCount - 1, 1);
        trail.alphas[i] = Math.exp(-age * DECAY_RATE) * fade;

        const palT = 1.0 - age;
        const col = getPaletteColor(palette, palT);
        const i3 = i * 3;
        trail.colors[i3] = col.r;
        trail.colors[i3 + 1] = col.g;
        trail.colors[i3 + 2] = col.b;
    }

    trail.geometry.attributes.position.needsUpdate = true;
    trail.geometry.attributes.alpha.needsUpdate = true;
    trail.geometry.attributes.color.needsUpdate = true;
    trail.geometry.setDrawRange(0, trail.pointCount);
}

function updateTrailGlow(trail) {
    if (trail.pointCount === 0 || trail.fade < 0.01) {
        trail.glowMaterial.uniforms.uOpacity.value = 0;
        return;
    }

    const i3 = (trail.pointCount - 1) * 3;
    const pos = trail.glowGeometry.attributes.position;
    pos.array[0] = trail.positions[i3];
    pos.array[1] = trail.positions[i3 + 1];
    pos.array[2] = trail.positions[i3 + 2];
    pos.needsUpdate = true;

    const pulse = 0.12 + 0.04 * Math.sin(journeyTime * 3.0);
    trail.glowMaterial.uniforms.uSize.value = pulse;
    trail.glowMaterial.uniforms.uOpacity.value = trail.fade;

    const palette = ATTRACTORS[trail.attractorIdx].palette;
    _tipColor.copy(palette[palette.length - 1]).lerp(_white, 0.5);
    trail.glowMaterial.uniforms.uColor.value.copy(_tipColor);
}

// ── Per-Frame Update ───────────────────────────────────────────────
function updateIntegration(dt) {
    journeyTime += dt;
    phaseTime += dt;

    const active = trails[activeIdx];
    const incoming = trails[1 - activeIdx];

    // ── Check for transition start ──
    if (!isTransitioning && phaseTime >= DRAW_DURATION) {
        isTransitioning = true;
        phaseTime = 0;

        // Initialize incoming trail with next attractor
        const nextIdx = (currentIndex + 1) % ATTRACTORS.length;
        incoming.attractorIdx = nextIdx;
        incoming.state = [...ATTRACTORS[nextIdx].initialCondition];
        incoming.fade = 0;
        clearTrail(incoming);
        addTrailToScene(incoming);
    }

    // ── Transition: cross-fade two independent trails ──
    if (isTransitioning) {
        const blend = cubicEaseInOut(Math.min(phaseTime / TRANSITION_DURATION, 1));
        active.fade = 1 - blend;
        incoming.fade = blend;

        // Both trails run their own pure attractor dynamics
        integrateTrail(active, dt);
        integrateTrail(incoming, dt);

        // Transition complete
        if (phaseTime >= TRANSITION_DURATION) {
            currentIndex = incoming.attractorIdx;
            isTransitioning = false;
            phaseTime = 0;

            // Deactivate old trail (its fade is 0, so removal is invisible)
            removeTrailFromScene(active);
            clearTrail(active);
            active.fade = 0;

            incoming.fade = 1;
            activeIdx = 1 - activeIdx;
        }
    } else {
        // ── Normal: single trail, pure dynamics ──
        active.fade = 1;
        integrateTrail(active, dt);
    }
}

function updateCamera(dt) {
    const now = performance.now();
    const userActive = (now - lastInteractionTime) < AUTO_ROTATE_RESUME_DELAY;
    controls.autoRotate = !userActive;

    if (isTransitioning) {
        const blend = cubicEaseInOut(Math.min(phaseTime / TRANSITION_DURATION, 1));
        const a = ATTRACTORS[currentIndex].camera;
        const b = ATTRACTORS[(currentIndex + 1) % ATTRACTORS.length].camera;
        controls.autoRotateSpeed = a.azimuthSpeed * (1 - blend) + b.azimuthSpeed * blend;

        const radius = a.radius * (1 - blend) + b.radius * blend;
        const elevation = a.elevation * (1 - blend) + b.elevation * blend;
        if (!userActive) {
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

    // Create both trail systems
    trails[0] = createTrailSystem();
    trails[1] = createTrailSystem();

    // Start first trail
    activeIdx = 0;
    trails[0].attractorIdx = 0;
    trails[0].state = [...ATTRACTORS[0].initialCondition];
    trails[0].fade = 1;
    addTrailToScene(trails[0]);
}

export function update(dt) {
    if (paused) return;

    updateIntegration(dt);

    // Update attributes for all visible trails
    for (const trail of trails) {
        if (trail && trail.inScene) {
            updateTrailAttributes(trail);
            updateTrailGlow(trail);
        }
    }

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
