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
    getGithubIconObject,
    LINKEDIN_URL,
    GITHUB_URL
} from './intro3d.js';

(function () {
    'use strict';

    // Stars are now part of the 3D scene (see createStarfield in attractors.js)

    // ── 3D clickable hit-testing (LinkedIn/GitHub icons, landing mail plane) ──
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
    function hitsGithub(e) { return hitsObject(e, getGithubIconObject()); }
    function hitsMail(e) { return hitsObject(e, getMailPlane()); }

    // Coalesce hover hit-tests to one raycast per frame — pointermove
    // can fire far more often than the display refreshes
    let hoverEvent = null;
    document.body.addEventListener('pointermove', (e) => {
        if (!hoverEvent) {
            requestAnimationFrame(() => {
                document.body.style.cursor =
                    (hitsIcon(hoverEvent) || hitsGithub(hoverEvent) || hitsMail(hoverEvent)) ? 'pointer' : '';
                hoverEvent = null;
            });
        }
        hoverEvent = e;
    });

    // ── Tap Detection (with drag guard) ────────────────────────
    let pointerDownPos = null;
    const TAP_THRESHOLD = 10; // pixels

    document.body.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.site-nav, .stop-panel')) return;
        pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    document.body.addEventListener('pointerup', (e) => {
        if (e.target.closest('.site-nav, .stop-panel')) return;
        if (!pointerDownPos) return;
        const dx = e.clientX - pointerDownPos.x;
        const dy = e.clientY - pointerDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < TAP_THRESHOLD) {
            if (hitsIcon(e)) window.open(LINKEDIN_URL, '_blank');
            else if (hitsGithub(e)) window.open(GITHUB_URL, '_blank');
            else if (hitsMail(e)) window.location.href = 'mailto:' + CONTACT_EMAIL;
            else onTap();
        }
        pointerDownPos = null;
    });

    document.body.addEventListener('pointercancel', () => {
        pointerDownPos = null;
    });

    // Keyboard: Enter / Space advance the journey (links and buttons keep their own behavior)
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('a,button')) {
            e.preventDefault();
            onTap();
        }
    });

    // Prevent any residual scrolling / bounce on mobile (nav links stay tappable)
    document.addEventListener('touchmove', (e) => {
        if (!e.target.closest('.site-nav, .stop-panel')) e.preventDefault();
    }, { passive: false });

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
            }, 150);
        });

        setupVisibilityObserver();
        requestAnimationFrame(loop);
    }

    init();
})();
