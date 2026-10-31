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
import { getPortalHit, enterPortal, setPortalHover } from './portal.js';
import { inputOwner } from './input.js';
import {
    getIconObject,
    getGithubIconObject,
    LINKEDIN_URL,
    GITHUB_URL
} from './intro3d.js';
import * as walk from './walk.js';
import { prefetchRoom, roomReady, whenRoomReady, setRoomHold } from './room.js';
import { catalog, stopById } from './world.js';

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
    function hitsPortal(e) { return hitsObject(e, getPortalHit()); }

    // HTML over the canvas: its pointer events are not taps (a link click
    // must not also advance the journey); .dimension = the open project app,
    // .room-tools = the apartment toolbar (depthTool.js), .walk-ui = the walk
    // mode buttons and HUD (walk.js)
    const OVERLAYS = '.site-nav, .stop-panel, .dimension, .room-tools, .walk-ui, .intro-links';

    // Who gets the input: inputOwner() (input.js) is 'journey', 'portal'
    // (a project app: no input), 'walk' (walk.js) or 'tool' (depthTool.js)

    // Coalesce hover hit-tests to one raycast per frame — pointermove
    // can fire far more often than the display refreshes. Only the journey
    // has hover targets: any other owner clears the cursor and the rim hover.
    let hoverEvent = null;
    document.body.addEventListener('pointermove', (e) => {
        if (!hoverEvent) {
            requestAnimationFrame(() => {
                const journey = inputOwner() === 'journey';
                const portal = journey && hitsPortal(hoverEvent);   // the rim sorts itself while hovered
                setPortalHover(portal);
                document.body.style.cursor = journey &&
                    (portal || hitsIcon(hoverEvent) || hitsGithub(hoverEvent) || hitsMail(hoverEvent)) ? 'pointer' : '';
                hoverEvent = null;
            });
        }
        hoverEvent = e;
    });

    // ── Tap Detection (with drag guard) ────────────────────────
    let pointerDownPos = null;
    const TAP_THRESHOLD = 10; // pixels

    document.body.addEventListener('pointerdown', (e) => {
        const owner = inputOwner();
        if (e.target.closest(OVERLAYS) || owner === 'portal') return;
        // walk mode (a tool too: it lives there): one finger looks, a second one is ignored
        if (owner !== 'journey' && pointerDownPos) return;
        pointerDownPos = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: false };
    });

    // Walk mode (walk.js): a drag looks around (also while measuring), a tap walks or picks an object
    document.body.addEventListener('pointermove', (e) => {
        const owner = inputOwner();
        if (!pointerDownPos || pointerDownPos.id !== e.pointerId || (owner !== 'walk' && owner !== 'tool')) return;
        const p = pointerDownPos;
        if (!p.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= TAP_THRESHOLD) p.drag = true;
        if (p.drag) walk.onDrag(e.clientX - p.lx, e.clientY - p.ly);
        p.lx = e.clientX; p.ly = e.clientY;
    });

    document.body.addEventListener('pointerup', (e) => {
        const p = pointerDownPos;
        if (!p || p.id !== e.pointerId) return;
        pointerDownPos = null;   // also when released over an overlay, so walk mode never sticks
        if (e.target.closest(OVERLAYS)) return;
        const owner = inputOwner();
        if (owner === 'walk') {
            if (!p.drag) walk.onTap(e.clientX, e.clientY);
        } else if (owner === 'journey' && Math.hypot(e.clientX - p.x, e.clientY - p.y) < TAP_THRESHOLD) {
            if (hitsIcon(e)) window.open(LINKEDIN_URL, '_blank');
            else if (hitsGithub(e)) window.open(GITHUB_URL, '_blank');
            else if (hitsMail(e)) window.location.href = 'mailto:' + CONTACT_EMAIL;
            else if (hitsPortal(e)) enterPortal();
            else onTap();
        }
    });

    document.body.addEventListener('pointercancel', () => {
        pointerDownPos = null;
    });

    // Keyboard: Enter / Space advance the journey (links and buttons keep their own behavior).
    // Walk mode: WASD / arrows walk and turn (walk.js), Enter / Space do nothing.
    const walkKeys = new Set();
    const WALK_KEYS = ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    document.addEventListener('keyup', (e) => {
        if (walkKeys.delete(e.key.toLowerCase())) walk.setKeys(new Set(walkKeys));
    });
    window.addEventListener('blur', () => { walkKeys.clear(); walk.setKeys(new Set()); });
    document.addEventListener('keydown', (e) => {
        const owner = inputOwner();
        if (owner === 'portal' || e.target.closest?.('.dimension')) return;
        if (owner === 'walk' || owner === 'tool') {
            const k = e.key.toLowerCase();
            if (WALK_KEYS.includes(k) && !e.target.closest('input,textarea') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                walkKeys.add(k); walk.setKeys(new Set(walkKeys));
            } else if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('a,button')) e.preventDefault();
            return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('a,button') && owner === 'journey') {
            e.preventDefault();
            onTap();
        }
    });

    // "skip to work" (orchestrator sets its ?go link): fly there without a
    // reload. The apartment (about 15 MB) starts loading as soon as the link
    // is hovered, focused or pressed. If it is not in yet on the click, the
    // comet waits at the stop before (the Giraffe360 rock, its panel to
    // read, and the loading line) and flies on once it is; a tap there goes
    // on at once (the loading line shows in the flat until it is in).
    const skipLink = document.querySelector('.intro-skip');
    for (const ev of ['pointerenter', 'focus', 'pointerdown']) skipLink?.addEventListener(ev, prefetchRoom);
    skipLink?.addEventListener('click', (e) => {
        const id = new URL(e.currentTarget.href).searchParams.get('go');
        const before = catalog.find(c => c.navigable && c.index === (stopById(id)?.index ?? 0) - 1);
        if (!window.journey || !id) return;
        e.preventDefault();
        prefetchRoom();
        if (roomReady() || !before) { window.journey.goTo(id, { mode: 'fly' }); return; }
        window.journey.goTo(before.id, { mode: 'jump' });
        setRoomHold(true);
        whenRoomReady().then(() => {
            setRoomHold(false);
            const now = window.journey.current();
            if (now.stop === before.id && now.phase === 'view') window.journey.goTo(id, { mode: 'fly' });
        });
    });

    // Prevent any residual scrolling / bounce on mobile (nav links stay tappable)
    document.addEventListener('touchmove', (e) => {
        if (!e.target.closest(OVERLAYS)) e.preventDefault();
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
