// The "dimension": a full-screen overlay with a project app in an iframe
// (/apps/<id>/), opened through a portal at a project stop. Self-initialising.
// Events (window):
//   in:  'journey:stop'   enter at a stop with panel.portal: prefetch the app
//                         files; progress goes out as 'journey:portal-progress'
//                         { id, p: 0..1 } (it lights the rim)
//        'journey:portal' { phase: 'enter' | 'show', id, href, title } from the
//                         orchestrator: 'enter' loads the app, 'show' fades it in
//   out: 'journey:portal-exit' when the overlay closes (back button, Esc, the
//        app's Esc message, browser Back); the orchestrator flies back out.
// The main render loop idles while the overlay is open (orchestrator).

const FADE_MS = 450;                     // keep in sync with .dimension transition in css/style.css
const EXIT_MESSAGE = 'journey:exit';     // postMessage type an app sends to close the overlay

const el = document.querySelector('.dimension');
if (el) {
    let frame = null;                    // a new iframe per visit: changing an iframe's src adds a history entry, and Back must close the overlay
    const title = el.querySelector('.dimension-title');
    const status = el.querySelector('.dimension-status');
    const back = el.querySelector('.dimension-back');
    const newTab = el.querySelector('.dimension-tab');
    let open = false, current = null, hideTimer = 0;
    const prefetched = new Map();        // id -> progress 0..1

    // ── Prefetch (fills the HTTP cache, so the app opens at once) ──
    function report(id, p) {
        prefetched.set(id, p);
        window.dispatchEvent(new CustomEvent('journey:portal-progress', { detail: { id, p } }));
    }
    async function fetchOne(url, onPart) {
        try {
            const res = await fetch(url);
            const total = Number(res.headers.get('content-length')) || 0;
            if (!res.body || !total) { await res.arrayBuffer(); return; }
            const reader = res.body.getReader();
            let got = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                got += value.length;
                onPart(Math.min(got / total, 1));
            }
        } catch { /* offline or blocked: the iframe loads it later */ }
    }
    function prefetch(id, portal) {
        if (prefetched.has(id)) { report(id, prefetched.get(id)); return; }
        const urls = portal.preload ?? [portal.href];
        const parts = urls.map(() => 0);
        const sum = () => parts.reduce((a, b) => a + b, 0) / urls.length;
        report(id, 0);
        urls.forEach((u, i) => fetchOne(u, (f) => { parts[i] = f; report(id, sum()); })
            .then(() => { parts[i] = 1; report(id, sum()); }));
    }

    // ── Overlay ───────────────────────────────────────────────────
    function load(d) {
        current = d;
        title.textContent = d.title;
        newTab.href = d.href;
        const src = new URL(d.href, location.href);
        src.searchParams.set('embed', '1');
        clearTimeout(hideTimer);
        if (frame?.src !== src.href) {
            frame?.remove();
            status.hidden = false;
            frame = document.createElement('iframe');
            frame.className = 'dimension-frame';
            frame.title = d.title;
            frame.src = src.href;
            frame.addEventListener('load', () => { status.hidden = true; });
            el.appendChild(frame);
        }
        el.hidden = false;
        open = true;
        history.pushState({ dimension: d.id }, '');   // browser Back closes the overlay
    }
    function show() {
        void el.offsetWidth;             // reflow, so the fade runs from the hidden state
        el.classList.add('visible');
        setTimeout(() => { if (open) (frame.contentWindow ?? frame).focus(); }, FADE_MS);
    }
    function close() {
        if (!open) return;
        open = false;
        el.classList.remove('visible');
        window.dispatchEvent(new CustomEvent('journey:portal-exit', { detail: { id: current?.id } }));
        // After the fade: hide, and unload the app (it stops; the cache makes the next visit fast)
        hideTimer = setTimeout(() => {
            if (open) return;
            el.hidden = true;
            frame?.remove();
            frame = null;
        }, FADE_MS);
        document.getElementById('attractor')?.focus?.();
    }
    // Close requests go through history: one Back entry per visit
    function requestClose() {
        if (!open) return;
        if (history.state?.dimension) history.back();   // -> popstate -> close()
        else close();
    }

    back.addEventListener('click', requestClose);
    window.addEventListener('popstate', () => { if (open && !history.state?.dimension) close(); });
    document.addEventListener('keydown', (e) => {
        if (open && e.key === 'Escape') { e.preventDefault(); requestClose(); }
    });
    // The app asks to close (its Esc key; it has the keyboard focus)
    window.addEventListener('message', (e) => {
        if (open && e.origin === location.origin && e.source === frame?.contentWindow && e.data?.type === EXIT_MESSAGE) requestClose();
    });

    window.addEventListener('journey:stop', (e) => {
        const d = e.detail || {};
        if (d.phase === 'enter' && d.panel?.portal) prefetch(d.id, d.panel.portal);
    });
    window.addEventListener('journey:portal', (e) => {
        const d = e.detail || {};
        if (d.phase === 'enter') load(d);
        else if (d.phase === 'show' && open) show();
    });
}
