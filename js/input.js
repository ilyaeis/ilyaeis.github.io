// Input ownership: who gets pointer and key input. One value, read by
// main.js (and CSS: body[data-input]).
//   'journey'  taps advance the journey and hit the 3D links and the portal rim
//   'portal'   a project app opens, is open or closes: no pointer or key input
//   'walk'     walk mode (walk.js): a drag looks, a tap walks or picks, WASD walks
// The orchestrator sets the owner of its phase.

let phaseOwner = 'journey';

export function inputOwner() { return phaseOwner; }
export function setPhaseOwner(owner) { phaseOwner = owner; sync(); }

function sync() { if (document.body) document.body.dataset.input = inputOwner(); }
sync();
