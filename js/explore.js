// ── EXPLORE (walk mode) ────────────────────────────────────────────
// The site starts in the flat: after the rocket morph the visitor walks
// (enterFromIntro: the tour HUD of walk.js, "Next object", "Skip the flat").
// ?go=<object id> starts walking at that object (enterAtObject). From VIEW
// at the landing (or an apartment stop) "Explore the flat" walks too, and
// "Back to the journey" eases to the VIEW pose and re-enters VIEW there.
// The comet, the halo focus and the camera rig pause; the walker (walk.js)
// owns the camera. The orchestrator owns the phase and calls in here; `J`
// is its small interface (see orchestrator.js init). walk.js registers
// itself (registerWalker) and room.js the flat (registerFlat), so pages
// without them (dev/camlog.html) have no walk mode: there the journey
// leaves the flat right after the morph.

import { controls, camera } from './attractors.js';
import * as cam from './camera.js';
import { setHaloFocus, stops } from './world.js';

const TRAIL_FADE = 0.8;  // s: the comet streak of the morph fades as the walk starts

let J = null;          // the orchestrator interface
let walker = null;     // walk.js: { canWalk, enterWalk, exitWalk, leaveInPlace, update }
let flat = null;       // room.js: { ready(), whenReady(), hold(on) }

export function init(journey) { J = journey; }
export function registerWalker(w) { walker = w; }
// The site starts in the flat: room.js registers it, and the first tap in
// the intro waits for it before the walk (without a walker nothing waits)
export function registerFlat(f) { flat = f; }
export function hasWalker() { return !!walker; }
export function flatReady() { return !walker || !flat || flat.ready(); }
export function holdForFlat(on) { flat?.hold(on); }

// 'journey:explore' { phase: 'enter' | 'leave' }: the room tools live in walk mode
function emitExplore(phase) { window.dispatchEvent(new CustomEvent('journey:explore', { detail: { phase } })); }

const viewPos = (stop) => stop.center.clone().addScaledVector(stop.normal, -J.fitFor(stop));
const firstObject = () => stops.findIndex(s => s.universe === 'rnd');

function pauseJourney() {
    J.hideTapPrompt();
    setHaloFocus(null);
    controls.enabled = false;
    cam.setScreenShift(false, true);
    if (camera.view?.enabled) camera.clearViewOffset();
    J.enterPhase(J.Phase.EXPLORE);
    emitExplore('enter');   // depthTool.js shows its toolbar
}

export function enterExplore(immediate = false) {
    const stop = J?.stop;
    if (!J || J.phase !== J.Phase.VIEW || !walker?.canWalk(stop)) return false;
    J.trail.line.visible = false;
    pauseJourney();
    walker.enterWalk({ immediate });
    return true;
}

// After the rocket morph: walk from the intro camera spot (the tour).
// The stop is the first object (agent API, the room credit); no panel yet.
let trailFade = 0;
export function enterFromIntro() {
    if (!J || !walker) return false;
    J.setStopIndex(firstObject());
    J.emitStop('enter', { panel: null });
    trailFade = TRAIL_FADE;
    pauseJourney();
    walker.enterWalk({ tour: true });
    return true;
}

// ?go=<object id>: walk mode at that object, facing it, its panel open
export function enterAtObject(index) {
    if (!J || !walker) return false;
    J.setStopIndex(index);
    J.emitStop('enter', { panel: null });
    J.trail.line.visible = false;
    pauseJourney();
    walker.enterWalk({ tour: true, at: stops[index], immediate: true });
    return true;
}

export function exitExplore() {
    if (!J || J.phase !== J.Phase.EXPLORE) return;
    const stop = J.stop;
    walker.exitWalk(viewPos(stop), stop.center, J.baseFov, endExplore);
}

function endExplore() {
    emitExplore('leave');
    const stop = J.stop;
    J.trail.line.visible = true;
    setHaloFocus(stop);
    controls.enabled = true;
    controls.target.copy(stop.center);
    cam.setScreenShift(J.hasPanel(stop));
    J.enterView();
}

// "Skip the flat →" / "Continue →" (walk.js): on with the journey from here
export function skipFlat() { if (J?.phase === J.Phase.EXPLORE) J.leaveFlat(); }

// Leave walk mode where the camera is: the journey flies on from here
// (the orchestrator sets the comet and the phase)
export function leaveInPlace() {
    if (!J || J.phase !== J.Phase.EXPLORE) return;
    emitExplore('leave');
    walker.leaveInPlace();
    restoreTrail();
    J.setPhase(J.Phase.VIEW);   // out of walk mode (the caller starts the flight)
}

// A jump or a flight while walking (agent API): leave at once
export function leaveNow() {
    if (!J || J.phase !== J.Phase.EXPLORE) return;
    emitExplore('leave');
    const stop = J.stop;
    walker.exitWalk(viewPos(stop), stop.center, J.baseFov, null, true);
    walker.update(0);
    controls.target.copy(stop.center);
    restoreTrail();
    J.setPhase(J.Phase.VIEW);
}

function restoreTrail() {
    trailFade = 0;
    J.trail.fade = 1;
    J.trail.line.visible = true;
    controls.enabled = true;
}

// Per frame in EXPLORE
export function update(dt) {
    if (trailFade > 0) {
        trailFade = Math.max(0, trailFade - dt);
        J.trail.fade = trailFade / TRAIL_FADE;
        if (!trailFade) J.trail.line.visible = false;
    }
    walker?.update(dt);
}
