// The head: a small three.js + Spark splat viewer, on index.html and resume.html.
// Loaded after load, when the page is idle and the stage is visible.
// Drag = orbit round the head. A slow turn runs until the first drag.
import * as THREE from 'three';
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';

// Relative to the page (resume.html at the site root).
const SPLAT_URL = 'assets/head/head-lite.sog';
// Splat frame: metres, head centre at the origin, +Y up, face toward +Z.
const TARGET = new THREE.Vector3(0, -0.03, 0);
const DIST = 0.85, FOV = 30;
const PITCH_LIMIT = 0.35;                // rad, up and down
const SPIN = 0.3;                        // rad/s, idle turn
const DRAG_GAIN = 0.01;                  // rad per CSS px
const DAMP = 10;                         // 1/s
const DPR_MAX = 2;
const LIVE_AFTER = 10;                   // frames before the canvas replaces the poster

export async function mountHead(stage) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_MAX));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 10);
    scene.add(new SparkRenderer({ renderer, minAlpha: 1 / 255 }));

    let yaw = 0, pitch = 0, tYaw = 0, tPitch = 0;
    let spin = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const aim = () => {
        const c = Math.cos(pitch);
        camera.position.set(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c).multiplyScalar(DIST).add(TARGET);
        camera.lookAt(TARGET);
    };

    const fit = () => {
        const w = stage.clientWidth, h = stage.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    fit();
    new ResizeObserver(fit).observe(stage);

    // drag (vertical touch scroll stays with the page: touch-action: pan-y)
    let drag = null;
    stage.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY };
        spin = false;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('dragging');
    });
    stage.addEventListener('pointermove', e => {
        if (!drag) return;
        tYaw -= (e.clientX - drag.x) * DRAG_GAIN;
        tPitch = THREE.MathUtils.clamp(tPitch + (e.clientY - drag.y) * DRAG_GAIN, -PITCH_LIMIT, PITCH_LIMIT);
        drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => { drag = null; stage.classList.remove('dragging'); };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    const mesh = new SplatMesh({ url: SPLAT_URL });
    await mesh.initialized;
    scene.add(mesh);
    stage.appendChild(renderer.domElement);

    // the canvas fades in over the poster once the splat has sorted (a few frames)
    let last = 0, visible = true, frames = 0;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(stage);
    const tick = now => {
        requestAnimationFrame(tick);
        const dt = Math.min((now - last) / 1000 || 0, 0.1);
        last = now;
        if (!visible) return;
        if (spin) tYaw += SPIN * dt;
        const k = 1 - Math.exp(-DAMP * dt);
        yaw += (tYaw - yaw) * k;
        pitch += (tPitch - pitch) * k;
        aim();
        renderer.render(scene, camera);
        if (++frames === LIVE_AFTER) stage.classList.add('live');
    };
    requestAnimationFrame(tick);
}
