// ── Strange Attractor Toolkit ──────────────────────────────────────
// Refactored from autonomous journey to a toolkit of exports.
// The orchestrator drives integration, camera, and transitions externally.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ── Constants ──────────────────────────────────────────────────────
export const DECAY_RATE = 4.0;
export const POINTS_PER_FRAME_MIN = 50;
export const POINTS_PER_FRAME_MAX = 300;
export const RAMP_DURATION = 5;

// ── Mobile detection ───────────────────────────────────────────────
export const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && window.innerWidth < 768);
export const MAX_POINTS = isMobile ? 30000 : 60000;
const BLOOM_RES_SCALE = isMobile ? 0.25 : 0.5;
const MAX_PIXEL_RATIO = isMobile ? 1.5 : 2;

// ── Attractor Definitions ──────────────────────────────────────────
export const ATTRACTORS = [
    {
        name: 'lorenz',
        params: { sigma: 10, rho: 28, beta: 8 / 3 },
        derivatives: (x, y, z, p) => [
            p.sigma * (y - x),
            x * (p.rho - z) - y,
            x * y - p.beta * z
        ],
        dt: 0.005,
        scale: 0.0334,
        center: [-0.08, -0.08, 23.56],
        initialCondition: [0.1, 0, 0],
        palette: [new THREE.Color(0xffbf00), new THREE.Color(0xff8800), new THREE.Color(0xdd3300)],
        camera: { radius: 1.2, elevation: 0.5, azimuthSpeed: 0.7 }
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
        scale: 0.0705,
        center: [0.17, -0.88, 0.86],
        initialCondition: [0.1, 0, 0],
        palette: [new THREE.Color(0x2266cc), new THREE.Color(0x00aacc), new THREE.Color(0x00ddbb)],
        camera: { radius: 1.2, elevation: 1.0, azimuthSpeed: 0.5 }
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
        scale: 0.2928,
        center: [1.89, 1.89, 1.91],
        initialCondition: [1.1, 1.1, -0.01],
        palette: [new THREE.Color(0x8833cc), new THREE.Color(0xcc33aa), new THREE.Color(0xff44cc)],
        camera: { radius: 1.2, elevation: 0.4, azimuthSpeed: 0.6 }
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
        scale: 0.5299,
        center: [0.0, 0.0, 0.70],
        initialCondition: [0.1, 0, 0],
        palette: [new THREE.Color(0x22aa44), new THREE.Color(0x00ccaa), new THREE.Color(0x00eedd)],
        camera: { radius: 1.2, elevation: 0.6, azimuthSpeed: 0.5 }
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
        scale: 0.0782,
        center: [-2.64, -2.64, -2.64],
        initialCondition: [-1.48, -1.51, 2.04],
        palette: [new THREE.Color(0xccaa00), new THREE.Color(0xeecc44), new THREE.Color(0xffffff)],
        camera: { radius: 1.2, elevation: 0.5, azimuthSpeed: 0.6 }
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
export function rk4Step(derivFn, x, y, z, dt, params) {
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

export function cubicEaseInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Trail System ───────────────────────────────────────────────────
export function createTrailSystem() {
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
        fade: 1.0,
        inScene: false,
        drawTime: 0,
        colorFreezeIdx: 0  // points before this index keep their baked colors
    };
}

// ── Module State ───────────────────────────────────────────────────
export let scene, camera, renderer, composer, controls, bloomPass;
let paused = false;
export let journeyTime = 0;

export function setJourneyTime(t) { journeyTime = t; }
export function addJourneyTime(dt) { journeyTime += dt; }

// ── Color Helpers ──────────────────────────────────────────────────
const _tmpColor = new THREE.Color();
const _white = new THREE.Color(1, 1, 1);
const _tipColor = new THREE.Color();

// Returns a shared Color instance — do not store the reference across calls.
export function getPaletteColor(palette, t) {
    const n = palette.length - 1;
    const i = Math.min(Math.floor(t * n), n - 1);
    const f = t * n - i;
    _tmpColor.copy(palette[i]).lerp(palette[Math.min(i + 1, n)], f);
    return _tmpColor;
}

// ── Scene Setup ────────────────────────────────────────────────────
export function initScene(canvas) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    scene = new THREE.Scene();
    // No fog — attractors move through world space and fog makes distant ones invisible

    camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    const cam0 = ATTRACTORS[0].camera;
    const initTheta = Math.PI / 4;
    camera.position.set(
        cam0.radius * Math.cos(cam0.elevation) * Math.sin(initTheta),
        cam0.radius * Math.sin(cam0.elevation),
        cam0.radius * Math.cos(cam0.elevation) * Math.cos(initTheta)
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

    // Controls — rotation and zoom, no pan. Always available.
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.minDistance = 0.5;
    controls.maxDistance = 5.0;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = ATTRACTORS[0].camera.azimuthSpeed;
    controls.target.set(0, 0, 0);
}

// ── Trail helpers ──────────────────────────────────────────────────
export function addTrailToScene(trail) {
    if (!trail.inScene) {
        scene.add(trail.line);
        trail.inScene = true;
    }
}

export function removeTrailFromScene(trail) {
    if (trail.inScene) {
        scene.remove(trail.line);
        trail.inScene = false;
    }
}

export function clearTrail(trail) {
    trail.pointCount = 0;
    trail.drawTime = 0;
    trail.colorFreezeIdx = 0;
    trail.geometry.setDrawRange(0, 0);
}

// Push a point in attractor space (applies scale/center transform)
export function pushPoint(trail, x, y, z, scale, center) {
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
        trail.positions.copyWithin(0, 3, trail.pointCount * 3);
        trail.colors.copyWithin(0, 3, trail.pointCount * 3);
        trail.alphas.copyWithin(0, 1, trail.pointCount);
        if (trail.colorFreezeIdx > 0) trail.colorFreezeIdx--;
        const i3 = (trail.pointCount - 1) * 3;
        trail.positions[i3] = sx;
        trail.positions[i3 + 1] = sy;
        trail.positions[i3 + 2] = sz;
    }
}

// Push a point already in world space (no transform)
export function pushPointWorld(trail, wx, wy, wz) {
    if (trail.pointCount < MAX_POINTS) {
        const i3 = trail.pointCount * 3;
        trail.positions[i3] = wx;
        trail.positions[i3 + 1] = wy;
        trail.positions[i3 + 2] = wz;
        trail.pointCount++;
    } else {
        trail.positions.copyWithin(0, 3, trail.pointCount * 3);
        trail.colors.copyWithin(0, 3, trail.pointCount * 3);
        trail.alphas.copyWithin(0, 1, trail.pointCount);
        // Shift freeze index too (one point evicted from front)
        if (trail.colorFreezeIdx > 0) trail.colorFreezeIdx--;
        const i3 = (trail.pointCount - 1) * 3;
        trail.positions[i3] = wx;
        trail.positions[i3 + 1] = wy;
        trail.positions[i3 + 2] = wz;
    }
}

export function clampTrailState(trail) {
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

export function integrateTrail(trail, frameDt) {
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

export function updateTrailAttributes(trail, paletteOverride) {
    const palette = paletteOverride || ATTRACTORS[trail.attractorIdx].palette;
    const fade = trail.fade;
    const freeze = trail.colorFreezeIdx;

    for (let i = 0; i < trail.pointCount; i++) {
        const age = (trail.pointCount - 1 - i) / Math.max(trail.pointCount - 1, 1);
        // Alpha always updates (fading applies to all points)
        trail.alphas[i] = Math.exp(-age * DECAY_RATE) * fade;

        // Only recolor points AFTER the freeze index (new points)
        // Frozen points keep whatever color they already have
        if (i >= freeze) {
            const newCount = trail.pointCount - freeze;
            const localAge = (newCount - 1 - (i - freeze)) / Math.max(newCount - 1, 1);
            const palT = 1.0 - localAge;
            const col = getPaletteColor(palette, palT);
            const i3 = i * 3;
            trail.colors[i3] = col.r;
            trail.colors[i3 + 1] = col.g;
            trail.colors[i3 + 2] = col.b;
        }
    }

    trail.geometry.attributes.position.needsUpdate = true;
    trail.geometry.attributes.alpha.needsUpdate = true;
    trail.geometry.attributes.color.needsUpdate = true;
    trail.geometry.setDrawRange(0, trail.pointCount);
}

export function updateTrailGlow(trail, time) {
    const t = time !== undefined ? time : journeyTime;
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

    const pulse = 0.12 + 0.04 * Math.sin(t * 3.0);
    trail.glowMaterial.uniforms.uSize.value = pulse;
    trail.glowMaterial.uniforms.uOpacity.value = trail.fade;

    const palette = ATTRACTORS[trail.attractorIdx].palette;
    _tipColor.copy(palette[palette.length - 1]).lerp(_white, 0.5);
    trail.glowMaterial.uniforms.uColor.value.copy(_tipColor);
}

// ── Render ─────────────────────────────────────────────────────────
export function render() {
    composer.render();
}

// ── Exported API ───────────────────────────────────────────────────
export function init(canvas) {
    initScene(canvas);
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

export function isPaused() {
    return paused;
}
