// Page script: the Instagram embed (loaded when its proof scrolls near), and
// the flat card (flat.js, three.js and Spark) loaded only when the card scrolls near.

// Instagram embed: nothing from instagram.com loads until the box is within
// NEAR px of the viewport. The placeholder has the embed's size from the start
// (measured: height = 1.25 * width + 210 for the plain /embed/ of a 4:5 post),
// so nothing jumps; the iframe then reports its exact height (MEASURE message).
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
    // after the page's own load, so first paint and the fonts come first
    if (document.readyState === 'complete') io.observe(box);
    else addEventListener('load', () => io.observe(box), { once: true });
}

// The flat: zero splat bytes and no three.js until the card is near the view.
const stage = document.getElementById('flat-stage');
if (stage && window.WebGLRenderingContext) {
    const io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        io.disconnect();
        import('./flat.js').then(m => m.mountFlat(stage, { status: stage.querySelector('.flat-status') }))
            .catch(err => console.error('flat: module failed', err));
    }, { rootMargin: NEAR });
    io.observe(stage);
}
