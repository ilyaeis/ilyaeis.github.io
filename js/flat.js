// The flat card: a minimal three.js + Spark splat viewer. Loaded only when the
// card scrolls near (page.js). Drag = look around from a fixed spot by the sofa.
// The poster stays until the lite splat (6.5 MB) is in, so the first view is sharp.
import * as THREE from 'three';
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';

// Relative to the page (index.html at the site root).
const FULL_URL = 'assets/room/apartment-lite.sog';
// Room units (the .sog frame): +Y up, bay windows on -Z, camera by the sofa.
const CAM = new THREE.Vector3(0, -0.11, 0.25);
const LOOK = new THREE.Vector3(0, -0.22, -0.78);   // a little under the bay window centre (the cut ceiling stays out of frame)
const BRIGHTNESS = 0.9;
const YAW_LIMIT = 1.3, PITCH_DOWN = 0.5, PITCH_UP = 0.12;   // rad from the rest view (up is short: the ceiling is cut)
const DRAG_GAIN = 0.0045;                            // rad per CSS px
const DAMP = 10;                                     // 1/s
const DPR_MAX = 1.5;

export async function mountFlat(stage, { status } = {}) {
    const say = t => { if (status) status.textContent = t; };
    say('Loading the flat (6.5 MB)…');
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_MAX));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.01, 50);
    camera.position.copy(CAM);
    scene.add(new SparkRenderer({ renderer, minAlpha: 1 / 255, maxStdDev: 3 }));

    // yaw / pitch round the camera spot, looking at the window at rest
    const d = LOOK.clone().sub(CAM);
    const yaw0 = Math.atan2(-d.x, -d.z), pitch0 = Math.atan2(d.y, Math.hypot(d.x, d.z));
    let yaw = 0, pitch = 0, tYaw = 0, tPitch = 0;
    const aim = () => {
        camera.rotation.set(0, 0, 0, 'YXZ');
        camera.rotation.y = yaw0 + yaw;
        camera.rotation.x = pitch0 + pitch;
    };

    const fit = () => {
        const w = stage.clientWidth, h = stage.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    fit();
    stage.appendChild(renderer.domElement);
    new ResizeObserver(fit).observe(stage);

    // drag (pointer events; vertical touch scroll stays with the page: touch-action: pan-y)
    let drag = null;
    stage.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY };
        if (mesh) say('');                              // the hint goes on the first drag
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('dragging');
    });
    stage.addEventListener('pointermove', e => {
        if (!drag) return;
        tYaw = THREE.MathUtils.clamp(tYaw + (e.clientX - drag.x) * DRAG_GAIN, -YAW_LIMIT, YAW_LIMIT);
        tPitch = THREE.MathUtils.clamp(tPitch + (e.clientY - drag.y) * DRAG_GAIN, -PITCH_DOWN, PITCH_UP);
        drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => { drag = null; stage.classList.remove('dragging'); };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    // keyboard: arrows look round
    stage.tabIndex = 0;
    stage.addEventListener('keydown', e => {
        const k = { ArrowLeft: [-0.2, 0], ArrowRight: [0.2, 0], ArrowUp: [0, 0.15], ArrowDown: [0, -0.15] }[e.key];
        if (!k) return;
        e.preventDefault();
        tYaw = THREE.MathUtils.clamp(tYaw + k[0], -YAW_LIMIT, YAW_LIMIT);
        tPitch = THREE.MathUtils.clamp(tPitch + k[1], -PITCH_DOWN, PITCH_UP);
    });

    let last = 0, visible = true, mesh = null;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(stage);
    const tick = now => {
        requestAnimationFrame(tick);
        const dt = Math.min((now - last) / 1000 || 0, 0.1);
        last = now;
        if (!visible || !mesh) return;
        const k = 1 - Math.exp(-DAMP * dt);
        yaw += (tYaw - yaw) * k;
        pitch += (tPitch - pitch) * k;
        aim();
        renderer.render(scene, camera);
    };
    requestAnimationFrame(tick);

    const fetchBytes = async url => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(url + ': ' + r.status);
        return new Uint8Array(await r.arrayBuffer());
    };
    const make = async bytes => {
        const m = new SplatMesh({ fileBytes: bytes, fileName: 'apartment.sog' });
        m.recolor = new THREE.Color(BRIGHTNESS, BRIGHTNESS, BRIGHTNESS);
        await m.initialized;
        return m;
    };
    try {
        mesh = await make(await fetchBytes(FULL_URL));
        scene.add(mesh);
        aim();
        renderer.render(scene, camera);
        stage.classList.add('live');
        say('Drag to look around');
    } catch (err) {
        console.error('flat: load failed', err);
        say(mesh ? '' : 'The flat did not load. Try again later.');
    }
}
