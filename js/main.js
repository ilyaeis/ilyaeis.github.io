import * as THREE from 'three';
import {
    init as initAttractor,
    resize as resizeAttractor,
    pause as pauseAttractor,
    resume as resumeAttractor,
    camera
} from './attractors.js';
import {
    init as initOrchestrator,
    update as updateOrchestrator,
    onTap,
    getMailPlane,
    CONTACT_EMAIL
} from './orchestrator.js';
import {
    getIconObject,
    onResize as resizeIntro,
    LINKEDIN_URL
} from './intro3d.js';

(function () {
    'use strict';

    // Stars are now part of the 3D scene (see createStarfield in attractors.js)

    // ── 3D clickable hit-testing (LinkedIn icon, landing mail plane) ──
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    function hitsObject(e, obj) {
        if (!obj || !camera) return false;
        pointerNdc.set(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(pointerNdc, camera);
        return raycaster.intersectObject(obj, true).length > 0;
    }

    function hitsIcon(e) { return hitsObject(e, getIconObject()); }
    function hitsMail(e) { return hitsObject(e, getMailPlane()); }

    // Coalesce hover hit-tests to one raycast per frame — pointermove
    // can fire far more often than the display refreshes
    let hoverEvent = null;
    document.body.addEventListener('pointermove', (e) => {
        if (!hoverEvent) {
            requestAnimationFrame(() => {
                document.body.style.cursor =
                    (hitsIcon(hoverEvent) || hitsMail(hoverEvent)) ? 'pointer' : '';
                hoverEvent = null;
            });
        }
        hoverEvent = e;
    });

    // ── Tap Detection (with drag guard) ────────────────────────
    let pointerDownPos = null;
    const TAP_THRESHOLD = 10; // pixels

    document.body.addEventListener('pointerdown', (e) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    document.body.addEventListener('pointerup', (e) => {
        if (!pointerDownPos) return;
        const dx = e.clientX - pointerDownPos.x;
        const dy = e.clientY - pointerDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < TAP_THRESHOLD) {
            if (hitsIcon(e)) window.open(LINKEDIN_URL, '_blank');
            else if (hitsMail(e)) window.location.href = 'mailto:' + CONTACT_EMAIL;
            else onTap();
        }
        pointerDownPos = null;
    });

    document.body.addEventListener('pointercancel', () => {
        pointerDownPos = null;
    });

    // Prevent any residual scrolling / bounce on mobile
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // ── Animation Loop ─────────────────────────────────────────
    let lastTime = 0;

    function loop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
        lastTime = timestamp;

        // Update orchestrator (handles attractor + camera + compositing)
        updateOrchestrator(dt);

        requestAnimationFrame(loop);
    }

    // ── Visibility ─────────────────────────────────────────────
    function setupVisibilityObserver() {
        const attractorCanvas = document.getElementById('attractor');
        if (!attractorCanvas) return;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) resumeAttractor();
                else pauseAttractor();
            });
        }, { threshold: 0.1 });
        observer.observe(attractorCanvas);
    }

    // ── Init ───────────────────────────────────────────────────
    function init() {
        initAttractor(document.getElementById('attractor'));
        initOrchestrator();

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                resizeAttractor(window.innerWidth, window.innerHeight);
                resizeIntro();
            }, 150);
        });

        setupVisibilityObserver();
        requestAnimationFrame(loop);
    }

    init();
})();
