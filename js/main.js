(function () {
    'use strict';

    // ── State Machine ──────────────────────────────────────────
    const State = { INITIAL: 0, PAGE_2: 1, RETURNED: 2 };
    let currentState = State.INITIAL;
    let snapping = false; // prevent re-entrant snaps

    // ── DOM refs ───────────────────────────────────────────────
    const starsCanvas = document.getElementById('stars');
    const starsCtx = starsCanvas.getContext('2d');
    const drawingCanvas = document.getElementById('drawing');
    const drawingCtx = drawingCanvas.getContext('2d');
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

    function sizeDrawingCanvas() {
        const size = 200;
        drawingCanvas.width = size * dpr;
        drawingCanvas.height = size * dpr;
        drawingCanvas.style.width = size + 'px';
        drawingCanvas.style.height = size + 'px';
        drawingCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    // ── Circle Drawing ─────────────────────────────────────────
    const segments = [];
    let drawAngle = -Math.PI / 2; // start from top
    const DRAW_SPEED = 0.4; // radians per second
    const CIRCLE_RADIUS = 70;
    const CIRCLE_CX = 100;
    const CIRCLE_CY = 100;
    const STROKE_WIDTH = 1.5;

    let colorMode = 'grayscale'; // or 'color'
    let colorTransitionTime = 0; // time since entering color mode
    let globalTime = 0;

    function getSegmentColor() {
        if (colorMode === 'grayscale') {
            // Oscillate lightness between 55% and 100% (gray to white)
            const t = (Math.sin(globalTime * 0.5) + 1) / 2;
            const lightness = 55 + t * 45;
            return 'hsl(0, 0%, ' + lightness.toFixed(1) + '%)';
        } else {
            // Warm tones: gradually introduce saturation
            // Saturation ramps from 0 to 70 over ~8 seconds
            const saturation = Math.min(70, colorTransitionTime * 8.75);
            // Hue shifts slowly in warm range (0-45 degrees)
            const hue = (colorTransitionTime * 3) % 45;
            // Lightness oscillates 50-80%
            const t = (Math.sin(globalTime * 0.5) + 1) / 2;
            const lightness = 50 + t * 30;
            return 'hsl(' + hue.toFixed(1) + ', ' + saturation.toFixed(1) + '%, ' + lightness.toFixed(1) + '%)';
        }
    }

    function updateDrawing(dt) {
        const advance = DRAW_SPEED * dt;
        const startAngle = drawAngle;
        drawAngle += advance;
        segments.push({
            start: startAngle,
            end: drawAngle,
            color: getSegmentColor(),
        });
    }

    function renderDrawing() {
        drawingCtx.clearRect(0, 0, 200, 200);
        drawingCtx.lineWidth = STROKE_WIDTH;
        drawingCtx.lineCap = 'round';
        for (const seg of segments) {
            drawingCtx.beginPath();
            drawingCtx.arc(CIRCLE_CX, CIRCLE_CY, CIRCLE_RADIUS, seg.start, seg.end);
            drawingCtx.strokeStyle = seg.color;
            drawingCtx.stroke();
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
        colorMode = 'color';
        colorTransitionTime = 0;

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
        globalTime += dt;
        if (colorMode === 'color') colorTransitionTime += dt;

        // Update & render stars
        for (const s of stars) updateStar(s, dt * 1000);
        renderStars();

        // Update & render drawing
        updateDrawing(dt);
        renderDrawing();

        requestAnimationFrame(loop);
    }

    // ── Init ───────────────────────────────────────────────────
    function init() {
        sizeStarsCanvas();
        sizeDrawingCanvas();
        initStars();

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', function () {
            sizeStarsCanvas();
            // Reposition stars to new viewport
            for (const s of stars) {
                s.x = Math.random() * window.innerWidth;
                s.y = Math.random() * window.innerHeight;
            }
        });

        requestAnimationFrame(loop);
    }

    init();
})();
