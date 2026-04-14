import {
    init as initAttractor,
    resize as resizeAttractor,
    pause as pauseAttractor,
    resume as resumeAttractor
} from './attractors.js';
import {
    init as initOrchestrator,
    update as updateOrchestrator,
    onTap
} from './orchestrator.js';

(function () {
    'use strict';

    // ── DOM refs ───────────────────────────────────────────────
    const starsCanvas = document.getElementById('stars');
    const starsCtx = starsCanvas.getContext('2d');

    // ── Helpers ────────────────────────────────────────────────
    const dpr = window.devicePixelRatio || 1;

    function sizeStarsCanvas() {
        starsCanvas.width = window.innerWidth * dpr;
        starsCanvas.height = window.innerHeight * dpr;
        starsCtx.scale(dpr, dpr);
    }

    // ── Stars ──────────────────────────────────────────────────
    const STAR_COUNT = 100;
    const stars = [];

    function createStar(randomizePhase) {
        const cycleDuration = 3000 + Math.random() * 5000;
        return {
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            radius: 0.5 + Math.random() * 1,
            maxOpacity: 0.15 + Math.random() * 0.35,
            opacity: 0,
            phase: randomizePhase ? Math.floor(Math.random() * 4) : 0,
            timer: randomizePhase ? Math.random() * cycleDuration : 0,
            waitDur: 1000 + Math.random() * 4000,
            fadeDur: 800 + Math.random() * 1200,
            holdDur: 2000 + Math.random() * 2000,
        };
    }

    function initStars() {
        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push(createStar(true));
        }
    }

    function updateStar(s, dt) {
        s.timer += dt;
        switch (s.phase) {
            case 0:
                if (s.timer >= s.waitDur) { s.phase = 1; s.timer = 0; }
                s.opacity = 0;
                break;
            case 1:
                s.opacity = Math.min(s.maxOpacity, s.maxOpacity * (s.timer / s.fadeDur));
                if (s.timer >= s.fadeDur) { s.phase = 2; s.timer = 0; s.opacity = s.maxOpacity; }
                break;
            case 2:
                s.opacity = s.maxOpacity;
                if (s.timer >= s.holdDur) { s.phase = 3; s.timer = 0; }
                break;
            case 3:
                s.opacity = Math.max(0, s.maxOpacity * (1 - s.timer / s.fadeDur));
                if (s.timer >= s.fadeDur) {
                    s.x = Math.random() * window.innerWidth;
                    s.y = Math.random() * window.innerHeight;
                    s.maxOpacity = 0.15 + Math.random() * 0.35;
                    s.waitDur = 1000 + Math.random() * 4000;
                    s.fadeDur = 800 + Math.random() * 1200;
                    s.holdDur = 2000 + Math.random() * 2000;
                    s.phase = 0; s.timer = 0; s.opacity = 0;
                }
                break;
        }
    }

    function renderStars() {
        starsCtx.setTransform(1, 0, 0, 1, 0, 0);
        starsCtx.clearRect(0, 0, starsCanvas.width, starsCanvas.height);
        starsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const s of stars) {
            if (s.opacity <= 0) continue;
            starsCtx.beginPath();
            starsCtx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            starsCtx.fillStyle = 'rgba(255,255,255,' + s.opacity + ')';
            starsCtx.fill();
        }
    }

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
            onTap();
        }
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

        // Update & render stars
        for (const s of stars) updateStar(s, dt * 1000);
        renderStars();

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
        sizeStarsCanvas();
        initStars();
        initAttractor(document.getElementById('attractor'));
        initOrchestrator();

        let resizeTimer;
        window.addEventListener('resize', () => {
            sizeStarsCanvas();
            for (const s of stars) {
                s.x = Math.random() * window.innerWidth;
                s.y = Math.random() * window.innerHeight;
            }
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
