// Input ownership: who gets pointer and key input. One value, read by
// main.js (and CSS: body[data-input]).
//   'journey'  taps advance the journey and hit the 3D links and the portal rim
//   'portal'   a project app opens, is open or closes: no pointer or key input
//   'walk'     walk mode (walk.js): a drag looks, a tap walks or picks, WASD walks
//   'tool'     a room tool (depthTool.js) takes the taps
// The orchestrator sets the owner of its phase; depthTool.js says when a
// tool is on. A tool wins over the journey and walk mode, not over a portal.

let phaseOwner = 'journey';
let toolOn = false;

export function inputOwner() {
    return toolOn && phaseOwner !== 'portal' ? 'tool' : phaseOwner;
}
export function setPhaseOwner(owner) { phaseOwner = owner; sync(); }
export function setToolOn(on) { toolOn = on; sync(); }

function sync() { if (document.body) document.body.dataset.input = inputOwner(); }
sync();
