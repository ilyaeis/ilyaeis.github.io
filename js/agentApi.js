// Agent API: window.journey (plain JS, Promise based) plus WebMCP tools on
// top of it when the browser has them. Navigation goes through orchestrator
// route functions only (no synthetic taps, no direct camera control).
// Read stop data from the static `catalog`; stop ids are the contract,
// raw indexes are accepted only as a fallback.

import { catalog, stopById, UNIVERSES } from './world.js';
import { Phase, getState, jumpTo, setupTravel, onTap } from './orchestrator.js';

const VERSION = 1;
const PHASE_NAMES = { [Phase.INTRO]: 'intro', [Phase.ROCKET_EXIT]: 'launch', [Phase.TRAVEL]: 'travel', [Phase.VIEW]: 'view' };
const navigable = catalog.filter(e => e.navigable);

function brief(e) {
    const o = { id: e.id, universe: e.universe, type: e.type, title: e.title, summary: e.summary,
                link: e.navigable ? `/?go=${e.id}` : null, navigable: e.navigable };
    if (e.near) o.near = e.near;
    return o;
}

function resolve(id) {
    if (typeof id === 'number' && navigable[id]) return navigable[id];
    return stopById(id);
}

function current() {
    const s = getState();
    const e = navigable[s.stopIndex] ?? null;
    return {
        phase: PHASE_NAMES[s.phase],
        stop: s.phase === Phase.VIEW && e ? e.id : null,
        destination: s.phase === Phase.TRAVEL && e ? e.id : null,
        universe: e && s.phase !== Phase.TRAVEL ? e.universe : null,
        userControlsCamera: s.userDragging,
        canAdvance: s.phase === Phase.VIEW || s.phase === Phase.INTRO
    };
}

// Resolves on the next 'enter' event (optionally for one stop id)
function nextEnter(id) {
    return new Promise(resolve => {
        const on = (ev) => {
            if (ev.detail.phase !== 'enter' || (id && ev.detail.id !== id)) return;
            window.removeEventListener('journey:stop', on);
            resolve(ev.detail.id);
        };
        window.addEventListener('journey:stop', on);
    });
}

function whenIdle() {
    return getState().phase === Phase.VIEW ? Promise.resolve(current()) : nextEnter().then(current);
}

async function goTo(id, { mode = 'fly' } = {}) {
    const e = resolve(id);
    if (!e) return { ok: false, reason: 'unknown-stop', current: current() };
    if (!e.navigable) return { ok: false, reason: 'not-navigable', near: e.near, current: current() };
    const s = getState();
    if (s.phase === Phase.TRAVEL || s.phase === Phase.ROCKET_EXIT) return { ok: false, reason: 'travelling', current: current() };
    if (mode === 'fly' && e.index >= 1) {
        const arrived = nextEnter(e.id);
        if (e.index === s.stopIndex + 1 && s.phase === Phase.VIEW) setupTravel(e.index, false);
        else { jumpTo(e.index - 1); setupTravel(e.index, false); }
        await arrived;
    } else {
        jumpTo(e.index); // dispatches 'enter' synchronously
    }
    return { ok: true, stop: e.id, mode: mode === 'fly' && e.index >= 1 ? 'fly' : 'jump' };
}

async function step(delta) {
    const s = getState();
    if (s.phase === Phase.TRAVEL || s.phase === Phase.ROCKET_EXIT) return { ok: false, reason: 'travelling', current: current() };
    if (delta > 0) {
        const arrived = nextEnter();
        onTap();
        return { ok: true, stop: await arrived, mode: 'fly' };
    }
    const prev = navigable[s.stopIndex - 1];
    if (s.phase !== Phase.VIEW || !prev) return { ok: false, reason: 'no-previous-stop', current: current() };
    return goTo(prev.id);
}

window.journey = {
    version: VERSION,
    listUniverses: () => UNIVERSES.map(u => ({ ...u, stops: navigable.filter(e => e.universe === u.id).map(e => e.id) })),
    listStops: () => catalog.map(brief),
    getStop: (id) => { const e = resolve(id); return e ? { ...brief(e), panel: e.panel } : null; },
    current,
    goTo,
    next: () => step(1),
    previous: () => step(-1),
    whenIdle,
    resumeLinks: () => ({ html: '/resume.html', md: '/resume.md', json: '/resume.json', llms: '/llms.txt',
        guestbook: 'https://github.com/ilyaeis/ilyaeis.github.io/issues/new?labels=guestbook' })
};

// ── WebMCP (native only, feature detected, no polyfill) ────────────
const J = window.journey;
const ids = navigable.map(e => e.id);
const universes = UNIVERSES.map(u => u.id).join(', ');
const none = { type: 'object', properties: {} };
const idProp = { type: 'string', enum: ids, description: 'Stop id' };
const tool = (name, description, inputSchema, run, readOnly) => ({
    name, description, inputSchema,
    annotations: { readOnlyHint: readOnly },
    execute: async (input) => run(input ?? {})
});

const TOOLS = [
    tool('list_stops', `List the stops of this portfolio journey, grouped by universe (${universes}).`, none,
        () => ({ universes: J.listUniverses(), stops: J.listStops() }), true),
    tool('get_current_stop', 'Say where the comet is now: phase, stop id and universe.', none, () => J.current(), true),
    tool('get_panel', 'Read the text panel of one stop (title, dates, items, links).',
        { type: 'object', properties: { id: idProp }, required: ['id'] }, ({ id }) => J.getStop(id), true),
    tool('go_to_stop', `Fly the comet to a stop. Stops belong to universes (${universes}).`,
        { type: 'object', properties: { id: idProp, mode: { type: 'string', enum: ['fly', 'jump'], default: 'fly' } }, required: ['id'] },
        ({ id, mode }) => J.goTo(id, { mode }), false),
    tool('next_stop', 'Advance to the next stop.', none, () => J.next(), false),
    tool('previous_stop', 'Go back to the previous stop.', none, () => J.previous(), false),
    tool('get_resume_links', 'Get links to the resume in HTML, Markdown and JSON.', none, () => J.resumeLinks(), true),
];

const mc = document.modelContext ?? navigator.modelContext;
if (mc?.registerTool) {
    for (const t of TOOLS) {
        try { Promise.resolve(mc.registerTool(t)).catch(() => {}); } catch { /* ignore */ }
    }
}
