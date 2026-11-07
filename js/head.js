// The head: a small three.js + Spark splat viewer, on index.html and resume.html.
// Loaded after load, when the page is idle and the stage is visible.
// Drag = orbit round the head. A slow turn runs until the first drag.
// setMode('mesh') swaps in the textured mesh of the same capture, for a
// comparison; the GLB loads only on the first switch. The mesh is lit with
// flat shading, so its facets show and it does not look like the splat.
import * as THREE from 'three';
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';

// Relative to the page (resume.html at the site root).
const SPLAT_URL = 'assets/head/head-lite.sog';
const MESH_URL = 'assets/head/head-mesh.glb';
// Splat and mesh frame: metres, head centre at the origin, +Y up, face toward +Z.
const TARGET = new THREE.Vector3(0, -0.03, 0);
const DIST = 0.85, FOV = 30;
const PITCH_LIMIT = 0.35;                // rad, up and down
const SPIN = 0.3;                        // rad/s, idle turn
const DRAG_GAIN = 0.01;                  // rad per CSS px
const DAMP = 10;                         // 1/s
const DPR_MAX = 2;
const LIVE_AFTER = 10;                   // frames before the canvas replaces the poster

export async function mountHead(stage, { onLive } = {}) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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
        if (e.button !== 0 || !stage.classList.contains('live')) return;
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

    const splat = new SplatMesh({ url: SPLAT_URL });
    await splat.initialized;
    scene.add(splat);
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
        if (++frames === LIVE_AFTER) { stage.classList.add('live'); onLive?.(); }
    };
    requestAnimationFrame(tick);

    // The mesh: baked colour, alpha fade at the bottom (vertex colour). The GLB
    // is unlit; here it gets a lit, flat-shaded material and a light that
    // follows the camera.
    let meshLoad = null, mode = 'splat';
    const loadMesh = async () => {
        const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
            import('three/addons/loaders/GLTFLoader.js'),
            import('three/addons/libs/meshopt_decoder.module.js'),
        ]);
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync(MESH_URL);
        // depthWrite: the loader turns it off for transparent materials
        gltf.scene.traverse(o => {
            if (!o.material) return;
            const { map, vertexColors, transparent } = o.material;
            o.material.dispose();
            o.material = new THREE.MeshLambertMaterial({ map, vertexColors, transparent, flatShading: true, depthWrite: true });
        });
        gltf.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(-1, 0.6, 0.6);
        camera.add(key);
        scene.add(camera);
        gltf.scene.visible = false;
        scene.add(gltf.scene);
        return gltf.scene;
    };
    return {
        // 'splat' or 'mesh'. The splat stays until the mesh is in. The last
        // call wins, also when an older one resolves later.
        async setMode(want) {
            mode = want;
            if (want === 'mesh') meshLoad ??= loadMesh().catch(err => { meshLoad = null; throw err; });
            const m = meshLoad && await meshLoad;
            if (m) m.visible = mode === 'mesh';
            splat.visible = !(m && mode === 'mesh');
        },
    };
}
