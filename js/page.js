// Lazy loads: the head viewer (head.js), the Instagram embed and the flat
// viewer (flat.js), each when its box is near or in the viewport.

// Instagram: the placeholder gets the embed's size up front (measured:
// height = 1.25 * width + 210 for a plain /embed/ of a 4:5 post), so nothing
// jumps. The iframe then posts its real height (MEASURE).
const NEAR = '600px 0px';
const IG_ORIGIN = 'https://www.instagram.com';
const embeds = new Map();   // iframe window -> box

const sizeBox = box => { if (!box.dataset.measured) box.style.height = Math.round(box.clientWidth * 1.25 + 210) + 'px'; };
addEventListener('message', e => {
    if (e.origin !== IG_ORIGIN) return;
    const box = embeds.get(e.source);
    if (!box) return;
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg?.type === 'MEASURE' && msg.details?.height > 0) {
        box.dataset.measured = '1';
        box.style.height = Math.round(msg.details.height) + 'px';
    }
});

for (const box of document.querySelectorAll('.embed-box[data-src]')) {
    const src = box.dataset.src;
    if (!src.startsWith(IG_ORIGIN + '/')) continue;
    sizeBox(box);
    new ResizeObserver(() => sizeBox(box)).observe(box);
    const io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        io.disconnect();
        const frame = document.createElement('iframe');
        frame.src = src;
        frame.title = box.dataset.title || 'Instagram post';
        frame.loading = 'lazy';
        frame.setAttribute('allowfullscreen', '');
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        box.appendChild(frame);
        embeds.set(frame.contentWindow, box);
        box.classList.add('loaded');
    }, { rootMargin: NEAR });
    // after load, so the first paint and the fonts come first
    if (document.readyState === 'complete') io.observe(box);
    else addEventListener('load', () => io.observe(box), { once: true });
}

// The head: after load, when idle (or 1.5 s at most) and in view; the poster
// until then. headDone settles when its splat is in, so the flat never loads
// at the same time. The caption hint says what state the head is in.
// The switch (splat or mesh) shows once the head starts to load. A press
// before the viewer is up is kept and applied when it is. ?head=mesh starts
// with the mesh (for screenshots).
let headDone = Promise.resolve();
const me = document.getElementById('me-stage');
const hint = t => { const h = document.querySelector('.me-hint'); if (h) h.textContent = t; };
const LABEL = { splat: "Ilja's head as a 3D Gaussian splat. Drag to turn it.", mesh: "Ilja's head as a 3D mesh. Drag to turn it." };
if (me && window.WebGLRenderingContext) {
    const sw = document.querySelector('.me-switch');
    const buttons = sw ? [...sw.querySelectorAll('button[data-mode]')] : [];
    let viewer = null, want = new URLSearchParams(location.search).get('head') === 'mesh' ? 'mesh' : 'splat';
    let live = false;
    const show = () => {
        for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.mode === want));
        me.setAttribute('aria-label', LABEL[want]);
        if (!viewer) return;
        const mode = want, busy = mode === 'mesh' && buttons.find(b => b.dataset.mode === mode);
        if (busy) busy.setAttribute('aria-busy', 'true');
        if (live && mode === 'mesh') hint(' Loading…');
        viewer.setMode(mode)
            .then(() => { if (live && want === mode) hint(' Drag to turn.'); })
            .catch(err => {
                console.error('head: mesh failed', err);
                if (want === mode) { want = 'splat'; show(); }
            })
            .finally(() => { if (busy) busy.removeAttribute('aria-busy'); });
    };
    for (const b of buttons) b.addEventListener('click', () => { if (want !== b.dataset.mode) { want = b.dataset.mode; show(); } });

    let release = () => {};
    headDone = new Promise(r => { release = r; });
    const io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) { release(); return; }   // scrolled past: do not hold the flat
        io.disconnect();
        hint(' Loading 3D…');
        if (sw) sw.hidden = false;
        show();
        import('./head.js?v=4').then(m => m.mountHead(me, { onLive: () => { live = true; hint(' Drag to turn.'); } }))
            .then(v => { viewer = v; if (want !== 'splat') show(); })
            .catch(err => { hint(''); if (sw) sw.hidden = true; console.error('head: load failed', err); })
            .finally(release);
    });
    const watch = () => io.observe(me);
    const go = () => window.requestIdleCallback ? requestIdleCallback(watch, { timeout: 1500 }) : setTimeout(watch, 100);
    if (document.readyState === 'complete') go();
    else addEventListener('load', go, { once: true });
}

// The flat: no three.js and no splat bytes until the card is near (and the head is in).
const stage = document.getElementById('flat-stage');
if (stage && window.WebGLRenderingContext) {
    const io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        io.disconnect();
        headDone.then(() => import('./flat.js?v=2')).then(m => m.mountFlat(stage, { status: stage.querySelector('.flat-status') }))
            .catch(err => console.error('flat: module failed', err));
    }, { rootMargin: NEAR });
    io.observe(stage);
}
