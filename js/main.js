import {
    init as initAttractor,
    update as updateAttractor,
    resize as resizeAttractor,
    pause as pauseAttractor,
    resume as resumeAttractor
} from './attractors.js';

(function () {
    'use strict';

    // ── State Machine ──────────────────────────────────────────
    const State = { INITIAL: 0, PAGE_2: 1, RETURNED: 2 };
    let currentState = State.INITIAL;
    let snapping = false; // prevent re-entrant snaps

    // ── DOM refs ───────────────────────────────────────────────
    const starsCanvas = document.getElementById('stars');
    const starsCtx = starsCanvas.getContext('2d');
    const page2 = document.querySelector('.page-2');
    const descEl = document.querySelector('.description');
    const socialEl = document.querySelector('.social');

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
        const cycleDuration = 3000 + Math.random() * 5000; // 3-8s
        return {
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            radius: 0.5 + Math.random() * 1,
            maxOpacity: 0.15 + Math.random() * 0.35,
            opacity: 0,
            // Phase: 0=wait, 1=fadeIn, 2=hold, 3=fadeOut
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
            case 0: // wait
                if (s.timer >= s.waitDur) {
                    s.phase = 1;
                    s.timer = 0;
                }
                s.opacity = 0;
                break;
            case 1: // fade in
                s.opacity = Math.min(s.maxOpacity, s.maxOpacity * (s.timer / s.fadeDur));
                if (s.timer >= s.fadeDur) {
                    s.phase = 2;
                    s.timer = 0;
                    s.opacity = s.maxOpacity;
                }
                break;
            case 2: // hold
                s.opacity = s.maxOpacity;
                if (s.timer >= s.holdDur) {
                    s.phase = 3;
                    s.timer = 0;
                }
                break;
            case 3: // fade out
                s.opacity = Math.max(0, s.maxOpacity * (1 - s.timer / s.fadeDur));
                if (s.timer >= s.fadeDur) {
                    // Reset — new position
                    s.x = Math.random() * window.innerWidth;
                    s.y = Math.random() * window.innerHeight;
                    s.maxOpacity = 0.15 + Math.random() * 0.35;
                    s.waitDur = 1000 + Math.random() * 4000;
                    s.fadeDur = 800 + Math.random() * 1200;
                    s.holdDur = 2000 + Math.random() * 2000;
                    s.phase = 0;
                    s.timer = 0;
                    s.opacity = 0;
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

    // ── Scroll Handling ────────────────────────────────────────
    const SNAP_THRESHOLD = window.innerHeight * 0.25;

    function onScroll() {
        if (snapping) return;
        const scrollY = window.scrollY;

        if (currentState === State.INITIAL) {
            if (scrollY > SNAP_THRESHOLD) {
                snapToPage2();
            }
        } else if (currentState === State.PAGE_2) {
            if (scrollY < window.innerHeight * 0.7) {
                snapToReturn();
            }
        }
    }

    function snapToPage2() {
        if (snapping || currentState !== State.INITIAL) return;
        snapping = true;
        currentState = State.PAGE_2;

        // FLIP: capture LinkedIn position before change
        const firstRect = socialEl.getBoundingClientRect();

        // Hide text + move LinkedIn to corner
        document.body.classList.add('page2');

        // FLIP: animate LinkedIn from old position to corner
        const lastRect = socialEl.getBoundingClientRect();
        const dx = firstRect.left - lastRect.left;
        const dy = firstRect.top - lastRect.top;
        socialEl.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
        socialEl.getBoundingClientRect(); // force reflow
        socialEl.style.transition = 'transform 0.6s ease';
        socialEl.style.transform = 'translate(0, 0)';

        window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });

        setTimeout(function () {
            socialEl.style.transition = '';
            socialEl.style.transform = '';
            snapping = false;
        }, 800);
    }

    function snapToReturn() {
        if (snapping || currentState !== State.PAGE_2) return;
        snapping = true;
        currentState = State.RETURNED;
        window.scrollTo({ top: 0, behavior: 'smooth' });

        setTimeout(function () {
            document.body.classList.add('returned');
            snapping = false;
        }, 600);
    }

    // ── Animation Loop ─────────────────────────────────────────
    let lastTime = 0;

    function loop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // seconds, capped
        lastTime = timestamp;

        // Update & render stars
        for (const s of stars) updateStar(s, dt * 1000);
        renderStars();

        // Update & render attractor
        updateAttractor(dt);

        requestAnimationFrame(loop);
    }

    // ── Visibility ─────────────────────────────────────────────
    function setupVisibilityObserver() {
        const attractorCanvas = document.getElementById('attractor');
        if (!attractorCanvas) return;
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    resumeAttractor();
                } else {
                    pauseAttractor();
                }
            });
        }, { threshold: 0.1 });
        observer.observe(attractorCanvas);
    }

    // ── Init ───────────────────────────────────────────────────
    function init() {
        sizeStarsCanvas();
        initStars();
        initAttractor(document.getElementById('attractor'));

        window.addEventListener('scroll', onScroll, { passive: true });

        let resizeTimer;
        window.addEventListener('resize', function () {
            sizeStarsCanvas();
            // Reposition stars to new viewport
            for (const s of stars) {
                s.x = Math.random() * window.innerWidth;
                s.y = Math.random() * window.innerHeight;
            }
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                resizeAttractor(window.innerWidth, window.innerHeight);
            }, 150);
        });

        setupVisibilityObserver();
        requestAnimationFrame(loop);
    }

    init();
})();
