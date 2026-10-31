// The flat's splat bytes (room.js turns them into splat meshes). The site
// starts in the flat, so on the intro this module starts the downloads at
// once: it has no imports, so it runs as soon as it arrives, in parallel
// with three.js and the other scripts (not after them and after Spark).
// First a small preview (no view-dependent colour, 1.1 MB): the room shows
// with it while the full splat loads, then the full one replaces it. Spark
// is preloaded at the same time. Deep links (?go, ?stop, ?leg, ?portal)
// start nothing here: room.js asks when it needs the room (roomBytes).

// = isMobile in attractors.js (this module must stay free of imports)
const MOBILE = /Android|iPhone|iPad/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && window.innerWidth < 768);

// ── Tuning ─────────────────────────────────────────────────────────
// apartment-preview.sog: from apartment.sog, splat-transform -H 0
// --decimate-adaptive 80000 (80k splats, SH 0)
const PREVIEW_URL = 'assets/room/apartment-preview.sog';
const ROOM_URL = 'assets/room/apartment.sog';
const ROOM_LITE_URL = 'assets/room/apartment-lite.sog';   // phones

// The download in progress (the preview, then the full splat): the loading line
export const progress = { loaded: 0, total: 0 };
let bytes = null;                     // { preview, full }: Promise<Uint8Array> each

// Low priority: the scripts and the intro come first on a slow network
async function get(url) {
    const res = await fetch(url, { priority: 'low' });
    if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
    const total = Number(res.headers.get('Content-Length')) || 0;
    progress.loaded = 0; progress.total = total;
    const reader = res.body.getReader(), parts = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        progress.loaded += value.length;
    }
    const out = new Uint8Array(progress.loaded);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}

// { preview, full } byte promises; the first call starts the downloads
// (the preview first: the full one starts when it is in, so the two
// do not share the bandwidth)
export function roomBytes() {
    if (bytes) return bytes;
    const preview = get(PREVIEW_URL);
    const full = preview.catch(() => {}).then(() => get(MOBILE ? ROOM_LITE_URL : ROOM_URL));
    bytes = { preview, full };
    full.catch(() => { bytes = null; });   // the next call (the next stop) tries again
    // Spark too (room.js imports it): fetch and compile it now, run it later
    try {
        const link = document.createElement('link');
        link.rel = 'modulepreload';
        link.href = import.meta.resolve('@sparkjsdev/spark');
        link.fetchPriority = 'low';
        document.head.append(link);
    } catch (e) { /* no import.meta.resolve: room.js loads Spark when it needs it */ }
    return bytes;
}

if (!/[?&](go|stop|leg|portal)=/.test(location.search)) roomBytes();
