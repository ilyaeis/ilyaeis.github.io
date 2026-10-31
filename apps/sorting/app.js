// sort_visualization in the browser. The flow of Main.cpp: a menu (layout,
// theme, fill order, algorithms), then for each algorithm: the array, a
// shuffle, the sort, with 2 s pauses. The steps come from the original C++
// (worker.js); drawer.js draws them as ArrayDrawer.cpp did.
// Keys as in the original: Right / D faster, Left / A normal speed, Esc menu.
// Inside the portfolio (?embed=1) Esc at the menu closes the app.
import { drawArray, LAYOUTS, THEMES, SCREEN, rgb } from './drawer.js';

const q = new URLSearchParams(location.search);
const EMBED = q.has('embed');
// get_sorts_table_origin(): the menu table, in its order
const TABLE = ['Bubble', 'Insertion', 'Gnome', 'Selection', 'Odd-Even', 'Count', 'Pigeonhole', 'Radix',
               'Comb', 'Shell', 'Merge', 'Quick', 'Pancake', 'Cocktail', 'Heap', 'Stooge'];
const PAUSE = 2;                         // s: long_sleep between the steps of a run
const STEPS_PER_S = 1000;                // speed 1: the original drew every step, about this fast
const FASTER = 10, MAX_SPEED = 500;      // faster_const, max_speed (vector_lenght)

const $ = (s) => document.querySelector(s);
const canvas = $('#view'), ctx = canvas.getContext('2d');
const menu = $('#menu'), controls = $('#controls'), stage = $('#stage');
document.body.classList.toggle('embed', EMBED);

// ── Worker (the C++ algorithms) ────────────────────────────────────
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let nextId = 0;
const pending = new Map();
worker.onmessage = (e) => { pending.get(e.data.id)?.(e.data); pending.delete(e.data.id); };
worker.onerror = () => showError('The WebAssembly module did not load.');
function call(cmd, args = {}) {
    return new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); worker.postMessage({ id, cmd, ...args }); });
}

// ── State ──────────────────────────────────────────────────────────
const settings = { layout: 0, theme: 0, fill: 0, algo: 'all' };
let values = new Int32Array(0);          // the array as drawn
let hl = [-1, -1];                       // the two highlighted indexes
let name = '';
let speed = 1;
let running = false, runToken = 0;
let dirty = true;

function draw() {
    const css = canvas.clientWidth || 1;
    drawArray(ctx, values, hl[0], hl[1], {
        layout: settings.layout, theme: settings.theme, name,
        speed, maxSpeed: running ? MAX_SPEED : 0, lw: Math.max(1, SCREEN / css)
    });
    dirty = false;
}

// The page colours follow the theme (Menu.cpp: text, selected text, background)
function applyTheme() {
    const t = THEMES[settings.theme], s = document.documentElement.style;
    s.setProperty('--fg', rgb(t[0])); s.setProperty('--sel', rgb(t[1])); s.setProperty('--bg', rgb(t[2]));
    dirty = true;
}

// ── Canvas size: a square, as the 1000 x 1000 window ──────────────
function fit() {
    const r = stage.getBoundingClientRect(), size = Math.floor(Math.max(Math.min(r.width, r.height), 100));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = canvas.style.height = size + 'px';
    canvas.width = canvas.height = Math.round(size * dpr);
    ctx.setTransform(canvas.width / SCREEN, 0, 0, canvas.height / SCREEN, 0, 0);
    dirty = true;
}
new ResizeObserver(fit).observe(stage);

// ── Replay ─────────────────────────────────────────────────────────
// A log is replayed at STEPS_PER_S × speed steps per second; each frame
// draws the state after the last step of that frame (as the original's
// fast mode, which drew every n-th step).
let replay = null;                       // { log, p, frames, stride, acc, done }
function startReplay(log) {
    return new Promise((done) => { replay = { log, p: 3, left: log[2], stride: log[1], acc: 0, done }; });
}
function stepReplay(dt) {
    const r = replay;
    r.acc += dt * STEPS_PER_S * speed / r.stride;
    let n = Math.floor(r.acc);
    r.acc -= n;
    const L = r.log;
    while (n-- > 0 && r.left > 0) {
        hl = [L[r.p], L[r.p + 1]];
        const k = L[r.p + 2];
        for (let j = 0; j < k; j++) values[L[r.p + 3 + 2 * j]] = L[r.p + 4 + 2 * j];
        r.p += 3 + 2 * k;
        r.left--;
    }
    dirty = true;
    if (r.left <= 0) { replay = null; hl = [-1, -1]; r.done(); }
}
let waitLeft = 0, waitDone = null;
function wait(s) { return new Promise((done) => { waitLeft = s; waitDone = done; }); }

let last = 0;
function frame(t) {
    const dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
    last = t;
    if (replay) stepReplay(dt);
    if (waitDone && (waitLeft -= dt) <= 0) { const d = waitDone; waitDone = null; d(); }
    if (dirty) draw();
    requestAnimationFrame(frame);
}

// ── A run: sort_visualization() in Main.cpp ────────────────────────
async function run() {
    const token = ++runToken;
    const live = () => token === runToken;
    running = true;
    document.body.classList.add('running');
    const order = settings.algo === 'all' ? TABLE : [settings.algo];
    const shuffles = [];
    for (let i = 0; i < order.length; i++) shuffles.push((await call('genShuffle', { start: i === 0 })).type);
    values = (await call('fill', { order: settings.fill })).array;
    speed = 1;
    for (let i = 0; i < order.length && live(); i++) {
        hl = [-1, -1]; dirty = true;
        await wait(PAUSE); if (!live()) return;
        name = 'Shuffle';
        const sh = await call('shuffle', { type: shuffles[i] }); if (!live()) return;
        await startReplay(sh.log); if (!live()) return;
        await wait(PAUSE); if (!live()) return;
        speed = 1;
        name = order[i] + ' sort';
        const so = await call('sort', { name: order[i] }); if (!live()) return;
        setInfo(so.log);
        await startReplay(so.log); if (!live()) return;
        await wait(PAUSE);
    }
    if (live()) toMenu();
}
function setInfo(log) {
    const steps = log[0], stride = log[1];
    $('#info').textContent = `${steps.toLocaleString('en')} steps` + (stride > 1 ? `, every ${stride}th drawn` : '');
}

function toMenu() {
    runToken++;
    replay = null; waitDone = null;
    running = false; name = ''; hl = [-1, -1]; speed = 1;
    $('#info').textContent = '';
    document.body.classList.remove('running');
    preview();
    menu.querySelector('#start').focus({ preventScroll: true });
}

// The menu shows the array it will sort (Menu::array_filler)
async function preview() {
    if (running) return;
    values = (await call('fill', { order: settings.fill })).array;
    dirty = true;
}

// ── Speed (key_press_for_visualizer) ───────────────────────────────
function faster() { speed = speed === 1 ? FASTER : Math.min(speed + FASTER, MAX_SPEED); dirty = true; }
function normal() { speed = 1; dirty = true; }
function escape() {
    if (running) toMenu();
    else if (EMBED) parent.postMessage({ type: 'journey:exit' }, location.origin);
}

document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('select') && e.key !== 'Escape') return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); escape(); return; }
    if (!running) return;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); faster(); }
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); normal(); }
});
controls.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    ({ slower: normal, faster, menu: escape })[b.dataset.key]?.();
});

// ── Menu ───────────────────────────────────────────────────────────
function radios(container, names, key, label = (n) => n) {
    const box = $(container);
    names.forEach((n, i) => {
        const id = `${key}-${i}`;
        box.insertAdjacentHTML('beforeend',
            `<input type="radio" name="${key}" id="${id}" value="${i}"><label for="${id}">${label(n, i)}</label>`);
    });
    box.addEventListener('change', (e) => {
        settings[key] = Number(e.target.value);
        if (key === 'theme') applyTheme();
        if (key === 'fill') preview();
        dirty = true;
    });
}
radios('#layouts', ['Columns', 'Points', 'Circle', 'Spiral', 'Pyramid'], 'layout');
radios('#themes', THEMES, 'theme', (t, i) =>
    `<span class="swatch" style="background:${rgb(t[2])};color:${rgb(t[0])}" aria-label="Theme ${i + 1}">${i + 1}</span>`);
radios('#fills', ['Ascending', 'Descending', 'Random'], 'fill');
const sel = $('#algo');
for (const n of TABLE) sel.insertAdjacentHTML('beforeend', `<option value="${n}">${n}</option>`);
sel.addEventListener('change', () => { settings.algo = sel.value; });
menu.addEventListener('submit', (e) => { e.preventDefault(); run(); });

function check(key) { const el = document.querySelector(`input[name="${key}"][value="${settings[key]}"]`); if (el) el.checked = true; }

function showError(msg) { $('#info').textContent = msg; }

// ── Start ──────────────────────────────────────────────────────────
(async function start() {
    // srand(time(NULL)) in main(); ?seed=N repeats a run
    const seed = q.has('seed') ? Number(q.get('seed')) : (Date.now() / 1000) | 0;
    await call('seed', { seed });
    // Menu's theme: rand() % 5 when the menu is made; ?theme=0..4 and ?layout= pick
    settings.theme = q.has('theme') ? Number(q.get('theme')) % 5 : (await call('rand')).value % THEMES.length;
    const lay = LAYOUTS.indexOf(q.get('layout'));
    if (lay >= 0) settings.layout = lay;
    if (TABLE.includes(q.get('sort'))) { settings.algo = q.get('sort'); sel.value = settings.algo; }
    ['layout', 'theme', 'fill'].forEach(check);
    applyTheme();
    await document.fonts?.load('20px Ruda').catch(() => {});
    await preview();
    document.body.classList.add('ready');
    if (q.has('autorun')) run();
    else if (!matchMedia('(pointer: coarse)').matches) menu.querySelector('#start').focus({ preventScroll: true });
})();
requestAnimationFrame(frame);
