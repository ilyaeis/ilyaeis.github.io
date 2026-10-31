// Runs the original C++ algorithms (WebAssembly, wasm/sortvis.js) off the
// main thread. The module keeps one array; a shuffle or a sort runs on it at
// once and returns its step log, which the page replays (app.js).
// Log (Int32Array): [total steps, stride, frames], then per frame:
// first, second, k, then k pairs (index, value) = the cells changed since the
// frame before. The last frame (first = second = -1) is the final array.
import createSortVis from './wasm/sortvis.js';

const MAX_FRAMES = 300000;               // longer runs keep every stride-th step (Stooge sort)
const ready = createSortVis();

function heap(m, ptr, n) { return m.HEAP32.slice(ptr >> 2, (ptr >> 2) + n); }

self.onmessage = async (e) => {
    const m = await ready;
    const { id, cmd } = e.data;
    let out = {}, transfer = [];
    if (cmd === 'seed') m._sv_srand(e.data.seed >>> 0);
    else if (cmd === 'rand') out.value = m._sv_rand();
    else if (cmd === 'fill') {
        const n = m._sv_fill(e.data.order);
        out.array = heap(m, m._sv_array(), n);
        transfer = [out.array.buffer];
    } else if (cmd === 'genShuffle') out.type = m._sv_gen_shuffle(e.data.start ? 1 : 0);
    else if (cmd === 'shuffle' || cmd === 'sort') {
        const len = cmd === 'shuffle'
            ? m._sv_shuffle(e.data.type, MAX_FRAMES)
            : m.ccall('sv_sort', 'number', ['string', 'number'], [e.data.name, MAX_FRAMES]);
        if (len < 0) out.error = 'unknown ' + cmd;
        else { out.log = heap(m, m._sv_log(), len); transfer = [out.log.buffer]; }
    }
    self.postMessage({ id, ...out }, transfer);
};
