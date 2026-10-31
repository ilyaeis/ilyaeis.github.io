// ── EXPLORE (walk mode) ────────────────────────────────────────────
// From VIEW at an apartment stop or the landing. The comet, the halo focus
// and the camera rig pause; the walker (walk.js) owns the camera. "Back to
// the journey" eases to the VIEW pose and re-enters VIEW at the same stop.
// The orchestrator owns the phase and calls in here; `J` is its small
// interface (see orchestrator.js init). walk.js registers itself
// (registerWalker), so pages without it (dev/camlog.html) have no walk mode.

import { controls, camera } from './attractors.js';
import * as cam from './camera.js';
import { setHaloFocus } from './world.js';

let J = null;          // the orchestrator interface
let walker = null;     // walk.js: { canWalk, enterWalk, exitWalk, update }

export function init(journey) { J = journey; }
export function registerWalker(w) { walker = w; }

// 'journey:explore' { phase: 'enter' | 'leave' }: the room tools live in walk mode
function emitExplore(phase) { window.dispatchEvent(new CustomEvent('journey:explore', { detail: { phase } })); }

const viewPos = (stop) => stop.center.clone().addScaledVector(stop.normal, -J.fitFor(stop));

export function enterExplore(immediate = false) {
    const stop = J?.stop;
    if (!J || J.phase !== J.Phase.VIEW || !walker?.canWalk(stop)) return false;
    J.hideTapPrompt();
    J.trail.line.visible = false;
    setHaloFocus(null);
    controls.enabled = false;
    cam.setScreenShift(false, true);
    if (camera.view?.enabled) camera.clearViewOffset();
    J.enterPhase(J.Phase.EXPLORE);
    emitExplore('enter');   // depthTool.js shows its toolbar
    walker.enterWalk({ immediate });
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

// A jump or a flight while walking (agent API): leave at once
export function leaveNow() {
    if (!J || J.phase !== J.Phase.EXPLORE) return;
    emitExplore('leave');
    const stop = J.stop;
    walker.exitWalk(viewPos(stop), stop.center, J.baseFov, null, true);
    walker.update(0);
    controls.target.copy(stop.center);
    J.trail.line.visible = true;
    controls.enabled = true;
    J.setPhase(J.Phase.VIEW);
}

// Per frame in EXPLORE
export function update(dt) { walker?.update(dt); }
