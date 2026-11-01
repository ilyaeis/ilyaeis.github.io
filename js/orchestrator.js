// ── Orchestrator ───────────────────────────────────────────────────
// Tap-driven state machine over a pre-built static world (world.js).
// The trail is a short fading comet: it travels Bezier arcs between
// stops, swings past attractor "galaxies" (scenery), and at planar stops
// draws the element's trajectory once then loops around it while the
// user views. The trait text is the exception: it spirals and flies on.

import * as THREE from 'three';
import {
    controls, camera, scene,
    createTrailSystem, addTrailToScene, clearTrail,
    pushPointWorld, updateTrailAttributes, updateTrailGlow,
    addJourneyTime, render, isPaused, isMobile, setBloomBoost
} from './attractors.js';
import * as cam from './camera.js';
import * as intro from './intro3d.js';
import * as tunnel from './tunnel.js';
import * as portal from './portal.js';
import * as explore from './explore.js';
import { setPhaseOwner } from './input.js';
import {
    buildWorld, finishWorld, stops, StopType, planePointToWorld, scenery, updateWorld, lightStop, tunnelExitS, setInsideFade, flybys, stopById,
    getMailPlane as mailPlaneFromWorld, CONTACT_EMAIL, fitDistance, viasFor, flatExitVias, apartment, setHaloFocus, snapHaloFocus,
    graphToWorld, graphFrameTarget
} from './world.js';
import { EARLY_TAP as GRAPH_EARLY_TAP, CAM_PAN as GRAPH_CAM_PAN, PEN_INTENSITY as GRAPH_PEN_INTENSITY } from './eduGraph.js';

export { CONTACT_EMAIL };

// ── Phase enum ─────────────────────────────────────────────────────
export const Phase = {
    INTRO: 0,
    ROCKET_EXIT: 1,   // first tap: the rocket morphs into the comet in place
    TRAVEL: 2,
    VIEW: 3,
    PORTAL_IN: 4,     // the comet dives into a project's portal; the app overlay fades in
    DIMENSION: 5,     // the app overlay is open (dimension.js); the main loop idles
    PORTAL_OUT: 6,    // back out of the portal, into VIEW
    EXPLORE: 7        // walk mode in the apartment (walk.js); stopIndex stays
};

// ── State ──────────────────────────────────────────────────────────
let phase = Phase.INTRO;
let phaseTime = 0;
let phaseFirstFrame = true;
let tapPending = false;
let totalTime = 0;

let trail = null;          // the comet
let skipRender = false;    // dev (?t=S): simulate() steps without drawing
let frozen = false;        // dev (?freeze): keep drawing the ?t=S state, no time passes
let stopIndex = -1;        // VIEW: current stop · TRAVEL: destination

const worldPos = new THREE.Vector3();   // what the FOLLOW camera tracks
const cometPos = new THREE.Vector3();   // the comet head's true position (Bezier start)
const cometDir = new THREE.Vector3(1, 0, 0); // comet heading (departures)

const _vec3 = new THREE.Vector3();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3(), _vD = new THREE.Vector3();
const _startPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _future = new THREE.Vector3();
const _loopOffset = new THREE.Vector3(); // trajectory-end → orbit settle offset

// Travel path — one or two chained cubic Bezier legs. Two legs appear
// when a third scene sits near the corridor between stops: the comet
// flies straight through it on the way.
let travelLegs = [];       // [{ p0, p1, p2, p3 }]
let travelArc = [];        // arc-length table: [{ s, leg, lt }], s = 0..1 along the whole path
let travelDuration = 0;
let fromFlat = false;      // this flight leaves the flat from where the camera (or the morph) is, not from a stop
let warp = null;           // { kind: 'in' | 'out', g: path share of the jump, t: its time }
let headS = -1e9;          // the viewer's arc parameter in the tunnel
let followFrom = 2.5, followTo = 2.5; // chase distance: departure -> destination fit
let easeC2 = false;        // tunnel flights: cruise time ease, speed from the path weights
const arrivePos = new THREE.Vector3(); // VIEW camera spot of the destination (face-on, fit distance)
let arriveBlend = true;    // this flight arrives from the front: blend the camera into the VIEW pose
let flyby = null;          // the fly-by the current flight spirals round (world.flybys entry)
let shiftBack = true;      // screen shift restored after the fly-by
let travelWeightedLen = 0; // path length with the fly-by slowdown weights
let headingOverride = null; // camera heading for this frame (fly-by framing), else cometDir
const _camDir = new THREE.Vector3();
const _hR = new THREE.Vector3(), _hU = new THREE.Vector3();
let baseFov = 60;
const fovEase = { x: 60, v: 0 };   // the FOV back from the walk (leaveFlat)

// Scratch frames (flight arcs)
const _arcRight = new THREE.Vector3();
const _arcUp = new THREE.Vector3();
const _tan = new THREE.Vector3();

// View state
const textFacePos = new THREE.Vector3(); // face-on camera target
const faceCenter = new THREE.Vector3();  // stop center the face-align glides around
const faceSph = new THREE.Spherical(), _sph = new THREE.Spherical();
const faceR = { x: 0, v: 0 }, facePhi = { x: 0, v: 0 }, faceTheta = { x: 0, v: 0 }; // springs
let camAligned = false;    // once true, stop steering — user gets control
let userDragging = false;  // true while the user holds a rotate/zoom gesture
let loopT = 0;             // planar-stop loop parameter
let tracing = false;       // VIEW: comet is drawing the element's strokes once
let traceCursor = 0;       // index into the stop's stroke points
let traceAcc = 0;          // fractional stroke-point budget (dt-based)

// ── Tuning ─────────────────────────────────────────────────────────
const COMET_CAPACITY = isMobile ? 600 : 1200;

// Travel — stops are 30-50 units apart now, so the comet moves fast
const TRAVEL_SPEED = 9.0;            // world units per second
const TRAVEL_MIN = 5.0;              // seconds
// Tunnel flights: every timing (pace, eases, arrival blend, warp) is scaled
// by this, so the layout stays and the whole tunnel runs faster (0.5 = 2x)
const TUNNEL_TIME_SCALE = 0.5;
const TRAVEL_MAX = 8.0;
const TRAVEL_LONG_SPEED = 14.0;      // u/s mean cap for very long hops (the landing -> first rock loop)
const TRAVEL_POINTS_PER_FRAME = 30;  // comet substeps along the path
const CAM_PATH_WINDOW = 0.2;         // s: half-width of the path smoothing the camera follows
const CAM_PATH_SAMPLES = 9;          // path samples per frame for that smoothing
const TRAVEL_ARC_SAMPLES = 2048;     // arc-length table samples per leg (even speed, no jump at leg joins; fine, so the camera jerk stays low at high frame rates)
const TUNNEL_ARC_SAMPLES = 1024;     // tunnel and spiral legs are long and curved: a finer table keeps the speed smooth

// Fly-by: a scenery galaxy within this corridor of the flight line (and
// not too near either end) becomes a via point the comet swings past
const VIA_BAND = [0.15, 0.85];       // projection range along the flight line
const VIA_MAX_PERP = 0.6;            // × flight distance
const VIA_RIM = 0.7;                 // via point sits at this × galaxy radius from its center
const VIA_JITTER = 0.8;              // random offset so it never dead-centers

// Hover departures (text / rocks / landing): the first Bezier control
// point is where the comet would be HOVER_LOOKAHEAD seconds into its
// loop, so the exit flows out of the hover motion instead of kinking.
const HOVER_LOOKAHEAD = 5.0;         // seconds of loop motion to aim along

// Viewing
const FACE_ALIGN_TIME = 0.6;         // s: smooth time of the camera onto the face-on pose
const FACE_ALIGN_MAX_TURN = THREE.MathUtils.degToRad(70); // rad/s: glide speed cap around the stop
const LOOP_SUBSTEPS = 8;             // comet substeps on planar-stop loops
const LOOP_SETTLE_RATE = 1.5;        // how fast the fly-off eases onto the orbit

// Trace — on arriving at a text / rock / landing, the comet first draws
// the element's own stroke trajectory ONCE (the same points that drew
// it), then settles into the viewing loop. Bold letter strokes (c=1)
// glow; faint connectors (c=0) stay dim — matching the static geometry.
const TRACE_DURATION = 3.0;          // seconds for the single trajectory pass
const TRACE_MAX_PER_FRAME = 300;     // stroke-point budget cap per frame
const TRACE_STROKE_INTENSITY = 1.4;  // bold strokes (c=1) → HDR/bloom
const TRACE_LINK_INTENSITY = 0.4;    // faint pen-travel strokes (c=0)

const VIEW_TAP_DELAY = {
    [StopType.PROJECT]: 2.0,
    [StopType.OBJECT]: 2.0,
    [StopType.LANDING]: 1.5,
    [StopType.GRAPH]: GRAPH_EARLY_TAP
};

// The timeline graph (one GRAPH stop, four frames; eduGraph.js): the pen
// writes the comet trail at this rate (points per second: the trail is
// COMET_CAPACITY points long, so about 1.2 s of pen shows)
const GRAPH_TRAIL_HZ = COMET_CAPACITY / 1.2;
// Frame 4 (Giraffe360): the panel says how many R&D objects the visitor found (walk.js keeps them)
const COLLECTED_KEY = 'rnd.collected';

// Object stops (the apartment): the comet traces the halo ring once, then
// rides it, slowing from the trace pace to the loop pace (no speed jump)
const OBJECT_TRACE_DURATION = 3.0;   // s for the ring trace (one turn)
const OBJECT_TRACE_INTENSITY = 0.9;  // the traced ring is a subtle accent indoors (no bloom)
const OBJECT_LOOP_PERIOD = 8.0;      // s per turn once settled
const OBJECT_LOOP_EASE = 1.5;        // s: time constant of that slow-down
const OBJECT_LOOP_BOB = 0.05;        // × ring radius: gentle up and down (twice per turn)
const VIA_PULL = 0.3;                // control arm at a via, × leg length (the comet crosses the via along its direction)

// Projects tunnel (tunnel.js). Flights inside it follow the centreline.
const TUNNEL_DEPART = 8;             // s after a project stop where the departure joins the centreline
const ARRIVE_BLEND = 0.3;            // share of the flight time over which the camera blends into the VIEW pose (time-based, so dt-free)
const ARRIVE_TIME = 2.6 * TUNNEL_TIME_SCALE; // tunnel stops: blend over the last this many seconds
const ARRIVE_MIN_DOT = 0.3;          // ... only if the arrival heading is this aligned with the stop's facing
const FOLLOW_EASE = 0.3;             // path share over which the chase distance eases to the destination fit
const JOIN_HEADING_MIX = 1.0;        // departure into the tunnel: share of the live heading in the first control arm
const TUNNEL_LAND = 6;               // the last units of s blend from the centreline onto the label start
const PROJECT_LOOP_SPEED = 0.9;      // world units/s round the viz frame
const PROJECT_LOOP_PAD = 0.28;       // loop runs this far outside the frame
// Warp in / out: a bump around the jump point of the flight (time-based, so dt-free)
// Fly-bys: the comet leaves the centreline, slows down and spirals round
// the viz (a helix leg round the tunnel axis), then rejoins it. The camera
// frames the viz meanwhile (focus + tunnel heading), then turns back.
const FLYBY_SPAN = 5;                // s: the helix runs over fly-by s +- this
const FLYBY_TURNS = 1.5;             // turns over the helix leg
const FLYBY_PAD = 0.35;              // helix radius = viz half-diagonal + this
const FLYBY_RAMP = 0.45;             // share of the helix leg where the radius grows (and shrinks at the end)
const FLYBY_SLOW = 1.6;              // path weight 1 + this at the fly-by: the comet is ~3.5x slower mid-spiral
const FLYBY_SLOW_H = 14;             // s: half-width of that slow bump
const FLYBY_SPIRAL_W = 5.5;           // the spiral leg is this much slower again in the middle
const FLYBY_CAM_DIST = 4.6;          // chase distance while framing a fly-by (the camera offset is ~2% longer: stay under controls.maxDistance 5, or OrbitControls clamps and kinks the path)
const FLYBY_GLOW = 0.9;              // extra comet intensity while it spirals round a fly-by
const TUNNEL_EASE_TIME = 1.8 * TUNNEL_TIME_SCALE; // s to reach (and leave) the cruise pace in a tunnel flight
const WARP_IN_EASE = 2.0;            // × that on the warp in: the comet turns from the graph to the throat while still slow (the chase camera swings less)
let tunnelEase = TUNNEL_EASE_TIME;   // this flight's ease time
const FLYBY_CAM_L = 20;              // s: half-width of the fly-by framing (C2 bump round the viz)
const FLYBY_CAM_LAG = 2;             // s: the camera anchor hangs back this far behind the comet at the fly-by
const FLYBY_CAM_LAG_AT = 2;          // ... most when the comet is this far past the viz
// Tunnel pacing: flights rush through the fast zones (tunnel.js) and slow
// down for fly-bys and stops. Speed x TUNNEL_FAST at a zone's middle.
const TUNNEL_FAST = 2.4;
const TUNNEL_SPEED = 15.5 / TUNNEL_TIME_SCALE; // cruise pace, weighted units/s (sets the flight time)
const TUNNEL_TRAVEL_MAX = 22 * TUNNEL_TIME_SCALE; // s
const RUSH_STREAKS = 0.35;           // star streaks at full rush (warp = 1)
const RUSH_RINGS = 0.5;              // ring pulse speed-up at full rush
const RUSH_FOV = 5;                  // degrees of extra FOV at full rush
// Warp = a wormhole. Warp in: as the comet nears the tunnel start, a
// funnel of the tunnel's own rings and strands fades in ahead, swirling,
// while the outside world fades out; stars stretch into streaks as the
// comet dives through the throat; the walls narrow into the tunnel.
// Warp out is the reverse: the end flares open behind the comet and the
// outside world fades back in. All cross-fades, no cuts.
const WARP_RISE = 0.9 * TUNNEL_TIME_SCALE; // s: streaks / FOV / bloom rise before the jump (throat)
const WARP_FALL = 1.4 * TUNNEL_TIME_SCALE; // s: ... and settle after it
const WARP_FOV = 12;                 // extra degrees of FOV at the peak (gentle)
const WARP_COMET = 1.2;              // extra comet intensity at the peak
const WARP_FADE_PRE = 2.2 * TUNNEL_TIME_SCALE; // s: the worlds cross-fade from this long before the jump
const WARP_FADE_POST = 0.4 * TUNNEL_TIME_SCALE; // ... to this long after it (reversed on the way out)


// Leaving the walk (leaveFlat): the comet starts this far ahead of the eye
// and below it (room units), and the walk's FOV eases back over FOV_EASE s
const LEAVE_AHEAD = 0.15;
const LEAVE_BELOW = 0.03;
const FOV_EASE = 0.6;

// Rocket → comet morph duration (3D rocket — see intro3d.js)
const ROCKET_MORPH_DURATION = intro.CHARGE_DURATION;

// DOM refs
let tapPromptEl = null;
let introLinksEl = null;   // "skip the walk · resume" under the first prompt
let skipWalk = false;      // the intro's "skip the walk": after the morph, leave the flat at once

// ── Init ───────────────────────────────────────────────────────────
// deferViz (main.js): the project vizzes build after the first frame
// (world.js); a jump or the first flight builds the rest at once
export function init({ deferViz = false } = {}) {
    tapPromptEl = document.querySelector('.tap-prompt');
    trail = createTrailSystem(COMET_CAPACITY);
    buildWorld(scene, { defer: deferViz }); // the dim world exists from frame one
    // The site starts in the flat: the intro camera is the landing VIEW pose
    // (inside, facing the bay windows), the name floats at the landing text spot
    const landing = stops.find(st => st.type === StopType.LANDING);
    camera.position.copy(landing.center).addScaledVector(landing.normal, -fitFor(landing));
    controls.target.copy(landing.center);
    cam.setOrbitCenter(landing.center.x, landing.center.y, landing.center.z);
    camera.lookAt(landing.center);
    intro.init(scene, camera);
    cam.init(controls);
    // The moment the user grabs the view, stop any in-progress camera
    // auto-alignment so it doesn't fight the drag
    controls.addEventListener('start', () => {
        userDragging = true;
        camAligned = true;
    });
    controls.addEventListener('end', () => { userDragging = false; });
    baseFov = camera.fov;
    tunnel.setFlare(0, tunnelExitS);
    // The portal and walk mode modules get a small interface to the journey
    const J = {
        Phase, cometPos, cometDir, worldPos,
        WARP_COMET, WARP_FOV, TRAVEL_POINTS_PER_FRAME,
        get phase() { return phase; }, get phaseTime() { return phaseTime; },
        get stop() { return stops[stopIndex]; }, get trail() { return trail; }, get baseFov() { return baseFov; },
        viewDelay: (stop) => VIEW_TAP_DELAY[stop.type],
        enterPhase, setPhase, enterView, emitStop, hideTapPrompt, stepFaceAlign, traceWorld, fitFor, hasPanel, legPoint,
        setStopIndex: (i) => { stopIndex = i; }, leaveFlat
    };
    const q = new URLSearchParams(location.search);
    // Dev (?portal=1): enter the stop's portal after the view delay; ?t then counts from the portal start
    const portalAuto = q.has('portal');
    portal.init(J, portalAuto);
    explore.init(J);
    const stopQ = Number(q.get('stop')), legQ = Number(q.get('leg'));
    controls.autoRotateSpeed = 0;       // the intro stands still (jumpTo / enterView set their own)
    const goTarget = q.has('go') ? stopById(q.get('go')) : null;
    if (goTarget?.navigable && goTarget.universe === 'rnd' && explore.hasWalker()) {
        // ?go=<object id>: walk mode at that object, facing it, its panel open
        walkAt(goTarget.index);
    }
    else if (goTarget?.navigable) {     // ?go=<id>[&mode=fly|jump]
        const i = goTarget.index;
        if (q.get('mode') === 'fly' && i >= 1 && (goTarget.frame ?? 1) === 1) flyTo(i);
        else jumpTo(i, goTarget.frame ?? 1);
    }
    else if (q.has('stop') && Number.isInteger(stopQ) && stops[stopQ]) jumpTo(stopQ);
    else if (q.has('leg') && Number.isInteger(legQ) && legQ >= 1 && stops[legQ]) { jumpTo(legQ - 1); setupTravel(legQ); }
    else if (q.has('portal') && stops.some(st => st.portal)) jumpTo(stops.findIndex(st => st.portal));
    else {
        showTapPrompt();
        // Skip the walk: a real link (?go) to the first stop after the flat;
        // main.js turns its click into skipTheWalk()
        introLinksEl = document.querySelector('.intro-links');
        const skip = introLinksEl?.querySelector('.intro-skip');
        if (skip) {
            const after = stops[afterFlatIndex()];
            skip.href = '?go=' + (after.frames?.[0].id ?? after.id);
            introLinksEl.hidden = false;
        }
        emitIntro('enter');   // room.js loads the flat now
    }
    if (q.has('explore')) explore.enterExplore(true);   // dev: with ?go=<apartment stop or contact>
    const tQ = Number(q.get('t'));
    if (q.has('t') && tQ > 0 && tQ <= 30) {
        if (portalAuto) simulateUntil(() => phase === Phase.PORTAL_IN, 10);
        simulate(tQ);
    }
    frozen = q.has('freeze');
}

// Dev only (?t=S): step the simulation S seconds before the first frame
// so headless screenshots can show a mid-flight / mid-spiral state.
function simulate(seconds) {
    skipRender = true;
    for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60);
    skipRender = false;
}
function simulateUntil(done, maxSeconds) {
    skipRender = true;
    for (let t = 0; t < maxSeconds && !done(); t += 1 / 60) update(1 / 60);
    skipRender = false;
}

export function onTap() { tapPending = true; }
// The intro's "skip the walk": the rocket morphs, then the comet leaves the flat
export function skipTheWalk() {
    if (phase !== Phase.INTRO) return;
    skipWalk = true;
    tapPending = true;
}

// 'journey:intro' { phase: 'enter' | 'leave' }: the intro shows (room.js loads the flat) or ends (the first tap)
function emitIntro(phaseName) { window.dispatchEvent(new CustomEvent('journey:intro', { detail: { phase: phaseName } })); }

// The first stop after the flat (the journey goes on there; the tour loops back to it)
function afterFlatIndex() {
    let i = stops.findIndex(st => st.universe === 'rnd');
    while (stops[i]?.universe === 'rnd') i++;
    return i;
}

// Dev only (dev/camlog.html): step without drawing, and read the state
export function setSkipRender(v) { skipRender = v; }
export function getState() {
    return { phase, stopIndex, userDragging, phaseTime, frame: stops[stopIndex]?.graph ? graphK : undefined };
}
// Music (music.js, via main.js): comet speed, tunnel rush and warp, each 0..1
const audioState = { speed: 0, rush: 0, warp: 0 };
const _prevHead = new THREE.Vector3();
export function getAudioState() { return audioState; }
export function devState() {
    return { phase, phaseTime, stopIndex, stopType: stops[stopIndex]?.type ?? -1, worldPos, cometPos,
             tunnelFlight: phase === Phase.TRAVEL && easeC2, headS, portal: !!stops[stopIndex]?.portal };
}

// Tell the DOM (stopPanel.js) which stop the comet enters or leaves
// (extra: { to } on a 'leave' that starts a flight: the destination index)
function emitStop(phaseName, extra = null) {
    const stop = stops[stopIndex];
    if (!stop) return;
    // the graph: the current frame's id, universe and panel (+ frame)
    const f = stop.frames?.[graphK - 1];
    const panel = f ? framePanel(f, graphK) : stop.panel || null;
    window.dispatchEvent(new CustomEvent('journey:stop', {
        detail: { phase: phaseName, index: stopIndex, type: stop.type, panel,
                  id: f?.id ?? stop.id, universe: f?.universe ?? stop.universe, label: panel?.title ?? stop.id,
                  ...(f ? { frame: graphK } : {}), ...extra }
    }));
}
// Frame 4 (Giraffe360) adds "n / 6 R&D objects found in the flat"
function framePanel(f, k) {
    if (k !== stops[stopIndex].frames.length) return f.panel;
    const ids = new Set(stops.filter(st => st.type === StopType.OBJECT).map(st => st.id));
    let n = 0;
    try { n = JSON.parse(localStorage.getItem(COLLECTED_KEY) || '[]').filter(id => ids.has(id)).length; } catch { /* no storage */ }
    return { ...f.panel, items: [...f.panel.items, { text: `${n} / ${ids.size} R&D objects found in the flat` }] };
}

// Land the comet at stop n instantly (?stop, ?leg, ?go, journey.goTo jump).
export function jumpTo(n, frame = 1) {
    finishWorld();
    if (stops[n].type === StopType.OBJECT && explore.hasWalker() && phase !== Phase.EXPLORE) { walkAt(n); return; }   // objects are walked to
    explore.leaveNow();
    intro.hideIntro(); hideTapPrompt();
    stopIndex = n;
    const stop = stops[n];
    setHaloFocus(stop); snapHaloFocus();
    trail.fade = 1; trail.attractorIdx = stop.paletteIdx ?? 0; clearTrail(trail); addTrailToScene(trail);
    traceWorld(stop, 0, cometPos);
    // the graph: frame `frame` (its own camera target), grown at once past frame 1
    graphStartFrame = stop.graph ? frame : 1;
    const c = stop.graph ? graphFrameTarget(stop, frame, _vD) : stop.center;
    worldPos.copy(c);
    cam.setOrbitCenter(c.x, c.y, c.z);
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(stop.normal, -fitFor(stop));
    cam.setScreenShift(hasPanel(stop), true);
    tunnel.setFade(stop.tunnelS != null ? 1 : 0);
    setInside(stop.tunnelS != null ? 1 : 0);
    enterView();
}

// The world outside the tunnel vs the tunnel's own content: f = 0 outside .. 1 inside
function setInside(f) { setInsideFade(f); }

// Stops with an HTML panel beside them (screen shift, fit)
function hasPanel(stop) { return stop.type === StopType.PROJECT || stop.type === StopType.OBJECT || stop.type === StopType.GRAPH; }

function showTapPrompt() { if (tapPromptEl) tapPromptEl.classList.add('visible'); }
// (the intro links and the first prompt's key hint go with the first prompt:
// they never come back)
function hideTapPrompt() {
    if (!tapPromptEl) return;
    tapPromptEl.classList.remove('visible');
    if (introLinksEl) introLinksEl.hidden = true;
    if (tapPromptEl.textContent !== 'tap to continue') tapPromptEl.textContent = 'tap to continue';
}

function enterPhase(newPhase) {
    setPhase(newPhase);
    phaseTime = 0;
    phaseFirstFrame = true;
    tapPending = false; // taps don't queue across phases — each stop wants its own
}
// The phase alone (leaving walk mode at once keeps the phase time); it also
// sets who owns the input (input.js)
function setPhase(newPhase) {
    phase = newPhase;
    setPhaseOwner(phase === Phase.PORTAL_IN || phase === Phase.DIMENSION || phase === Phase.PORTAL_OUT ? 'portal'
                  : phase === Phase.EXPLORE ? 'walk' : 'journey');
}

// Share of the viewport the rock may fill (the HTML panel takes the rest)
const ROCK_FIT_SIDE = 0.5;           // side layout: half the width
const ROCK_FIT_BOTTOM = 0.55;        // bottom layout: ~55% of the height

// ── Camera fit distance ────────────────────────────────────────────
// Camera distance the chase camera trails at on arrival, so it can
// pre-compose the scene during the flight: face-on, backed off by the fit
// distance (world.fitDistance of the stop's half size; rocks leave room
// for the panel, text backs off for the helix, objects stay inside the
// walls: at most stop.fitMax).
function fitFor(stop) {
    if (stop.type === StopType.GRAPH) return stop.camDist;   // the graph's own fit (world.js buildGraphStop)
    if (!hasPanel(stop)) return fitDistance(stop.halfW, stop.halfH);
    const [w, h] = cam.isPanelSideLayout() ? [ROCK_FIT_SIDE, 1] : [1, ROCK_FIT_BOTTOM];
    const fit = fitDistance(stop.fitHalfW ?? stop.halfW, stop.fitHalfH ?? stop.halfH, w, h);   // a portal stop takes in its rim
    return stop.type === StopType.OBJECT ? Math.min(fit, stop.fitMax) : fit;
}

// ── Leg evaluation ─────────────────────────────────────────────────
// A leg is a cubic Bezier { p0..p3 } or a stretch of the tunnel
// centreline { tunnel: true, s0, s1, endOffset }: the last TUNNEL_LAND
// units blend onto the destination's first stroke point.
function legPoint(leg, t, out) {
    if (leg.helix) {
        const s = leg.s0 + (leg.s1 - leg.s0) * t;
        tunnel.centreWorld(s, out);
        // smootherstep: zero acceleration where the spiral leaves and rejoins the centreline
        const ramp = THREE.MathUtils.smootherstep(t, 0, FLYBY_RAMP) * (1 - THREE.MathUtils.smootherstep(t, 1 - FLYBY_RAMP, 1));
        const r = leg.R * ramp;
        if (r > 0) {
            out.addScaledVector(leg.offset, ramp);   // the spiral axis runs through the viz, beside the centreline
            tunnel.frameWorld(s, _hR, _hU);
            const a = leg.phase + 2 * Math.PI * FLYBY_TURNS * t;
            out.addScaledVector(_hR, r * Math.cos(a)).addScaledVector(_hU, r * Math.sin(a));
        }
        return out;
    }
    if (leg.tunnel) {
        const s = leg.s0 + (leg.s1 - leg.s0) * t;
        tunnel.centreWorld(s, out);
        if (leg.endOffset) {
            const f = THREE.MathUtils.smoothstep(s, leg.s1 - TUNNEL_LAND, leg.s1);
            out.addScaledVector(leg.endOffset, f);
        }
        return out;
    }
    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;
    out.x = uuu * leg.p0.x + 3 * uu * t * leg.p1.x + 3 * u * tt * leg.p2.x + ttt * leg.p3.x;
    out.y = uuu * leg.p0.y + 3 * uu * t * leg.p1.y + 3 * u * tt * leg.p2.y + ttt * leg.p3.y;
    out.z = uuu * leg.p0.z + 3 * uu * t * leg.p1.z + 3 * u * tt * leg.p2.z + ttt * leg.p3.z;
    return out;
}

// ── Whole-path evaluation (by arc length) ──────────────────────────
// gt is the share of the path length, so the comet speed depends only on
// the time ease: no speed jump where two legs join, no Bezier speed bumps.
function buildArcTable() {
    travelArc = [{ s: 0, leg: 0, lt: 0 }];
    let len = 0;
    travelLegs.forEach((leg, i) => {
        legPoint(leg, 0, _vB);
        const n = leg.helix || leg.tunnel ? TUNNEL_ARC_SAMPLES : TRAVEL_ARC_SAMPLES;
        for (let k = 1; k <= n; k++) {
            legPoint(leg, k / n, _vA);
            if (leg.helix || leg.tunnel) {
                // Tunnel legs: weight light in the fast zones, heavy round a fly-by,
                // heavier still on the spiral. The spiral is timed by the centreline
                // under it, not by its own stretched path, so the comet's progress
                // along the tunnel stays smooth.
                const lt = (k - 0.5) / n;
                let w = tunnelWeight(leg.s0 + (leg.s1 - leg.s0) * lt);
                if (leg.helix) {           // follows the spiral radius ramp, so the comet's pace on the spiral is even
                    const ss = THREE.MathUtils.smootherstep;
                    w *= 1 + (FLYBY_SPIRAL_W - 1) * ss(lt, 0, FLYBY_RAMP) * (1 - ss(lt, 1 - FLYBY_RAMP, 1));
                }
                // centre legs: by path length; the spiral: by the length of the
                // centreline under it (so the pace matches at the joins)
                const s0 = leg.s0 + (leg.s1 - leg.s0) * (k - 1) / n, s1 = leg.s0 + (leg.s1 - leg.s0) * k / n;
                len += w * (leg.helix ? tunnel.centreWorld(s0, _vC).distanceTo(tunnel.centreWorld(s1, _vD)) : _vA.distanceTo(_vB));
            } else {
                len += _vA.distanceTo(_vB);
            }
            _vB.copy(_vA);
            travelArc.push({ s: len, leg: i, lt: k / n });
        }
    });
    for (const e of travelArc) e.s /= len || 1;
    travelWeightedLen = len;
}

// Path weight in the tunnel (time per unit of path): light in the fast
// zones, heavy round a fly-by (C2 bump over FLYBY_SLOW_H), so the comet
// rushes between the stops and slows down for each spiral
function tunnelWeight(s) {
    let slow = 0;
    for (const f of flybys) {
        const u = (s - f.s) / FLYBY_SLOW_H;
        if (Math.abs(u) < 1) slow += (1 - u * u) ** 3;
    }
    return (1 + FLYBY_SLOW * slow) / (1 + (TUNNEL_FAST - 1) * tunnel.fastness(s));
}

function travelPoint(gt, out) {
    gt = THREE.MathUtils.clamp(gt, 0, 1);
    let lo = 0, hi = travelArc.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (travelArc[mid].s < gt) lo = mid; else hi = mid;
    }
    const a = travelArc[lo], b = travelArc[hi];
    const f = b.s > a.s ? (gt - a.s) / (b.s - a.s) : 0;
    // Leg join: the next leg starts at local t = 0
    const lt = a.leg === b.leg ? a.lt + (b.lt - a.lt) * f : b.lt * f;
    return legPoint(travelLegs[b.leg], lt, out);
}

// The comet's arc parameter in the tunnel at path share gt: the leg's own
// s on centreline / spiral legs (smooth; projecting the spiralling head
// would wobble), else the projection of the point
function travelS(gt) {
    gt = THREE.MathUtils.clamp(gt, 0, 1);
    let lo = 0, hi = travelArc.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (travelArc[mid].s < gt) lo = mid; else hi = mid;
    }
    const a = travelArc[lo], b = travelArc[hi];
    const f = b.s > a.s ? (gt - a.s) / (b.s - a.s) : 0;
    const lt = a.leg === b.leg ? a.lt + (b.lt - a.lt) * f : b.lt * f;
    const leg = travelLegs[b.leg];
    if (leg.tunnel || leg.helix) return leg.s0 + (leg.s1 - leg.s0) * lt;
    return tunnel.sOf(legPoint(leg, lt, _vB));
}

function travelTangent(gt, out) {
    travelPoint(Math.min(gt + 0.004, 1), _vA);
    travelPoint(Math.max(gt - 0.004, 0), _vB);
    return out.subVectors(_vA, _vB).normalize();
}

// ── Random helpers for flight-path variety ─────────────────────────
function rand(min, max) { return min + Math.random() * (max - min); }
function randSign() { return Math.random() < 0.5 ? -1 : 1; }

// ── Build one flight leg from a start position + direction to a target ──
// Every transition swoops: the control points get random perpendicular
// offsets so no two flights arc the same way. keepStartDir leaves p1 on
// the start direction, so a chained leg joins without a kink.
function buildLeg(startPos, startDir, targetPos, keepStartDir = false, pull = 0.4, arc = 1) {
    const leg = {
        p0: startPos.clone(),
        p1: new THREE.Vector3(),
        p2: new THREE.Vector3(),
        p3: targetPos.clone()
    };

    // Control point 1: extend from start in the departure direction
    const dist = startPos.distanceTo(targetPos);
    leg.p1.copy(startDir).normalize().multiplyScalar(dist * pull).add(startPos);

    // Control point 2: approach target gently from the flight direction
    _vec3.copy(targetPos).sub(startPos).normalize();
    leg.p2.copy(_vec3).multiplyScalar(-dist * 0.3).add(targetPos);

    // Random sideways arc — perpendicular frame around the flight vector
    _arcRight.crossVectors(_vec3, camera.up);
    if (_arcRight.lengthSq() < 1e-6) _arcRight.set(1, 0, 0);
    _arcRight.normalize();
    _arcUp.crossVectors(_arcRight, _vec3).normalize();
    const sign = randSign();
    const p1Arc = keepStartDir ? 0 : 1;
    leg.p1.addScaledVector(_arcRight, p1Arc * sign * dist * arc * rand(0.15, 0.3));
    leg.p1.addScaledVector(_arcUp, p1Arc * randSign() * dist * arc * rand(0.05, 0.15));
    leg.p2.addScaledVector(_arcRight, -sign * dist * arc * rand(0.1, 0.2));
    leg.p2.addScaledVector(_arcUp, randSign() * dist * arc * rand(0.04, 0.1));
    return leg;
}

// ── Hover departure leg ────────────────────────────────────────────
// A smoother exit from a stop the comet is looping around. The four
// control points:
//   p0 — where the comet is right now (cometPos)
//   p1 — where it would be HOVER_LOOKAHEAD seconds on, so the departure
//        tangent continues the loop motion (no kink)
//   p3 — the destination
//   p2 — on the sphere whose diameter is p1→p3, so the bend at the
//        control point is ~90° (Thales), pushed out in a random
//        perpendicular direction so no two exits arc the same way.
function buildHoverLeg(p0, p1, p3) {
    const leg = {
        p0: p0.clone(),
        p1: p1.clone(),
        p2: new THREE.Vector3(),
        p3: p3.clone()
    };

    _vA.addVectors(p1, p3).multiplyScalar(0.5);   // sphere center (mid of p1,p3)
    _vB.subVectors(p3, p1);                        // diameter axis
    const r = 0.5 * _vB.length();                  // radius → exactly 90° at p2
    _vB.normalize();

    // Random unit direction perpendicular to the axis
    _arcRight.crossVectors(_vB, camera.up);
    if (_arcRight.lengthSq() < 1e-6) _arcRight.crossVectors(_vB, _vec3.set(1, 0, 0));
    _arcRight.normalize();
    _arcUp.crossVectors(_vB, _arcRight).normalize();
    const ang = rand(0, Math.PI * 2);
    leg.p2.copy(_vA)
        .addScaledVector(_arcRight, r * Math.cos(ang))
        .addScaledVector(_arcUp, r * Math.sin(ang));
    return leg;
}

// First leg of a flight: hover stops swoop out of their loop motion.
function buildFirstLeg(target) {
    const fromStop = stopIndex >= 0 && !fromFlat ? stops[stopIndex] : null;
    if (fromStop && !tracing) {
        loopPos(fromStop, loopT + HOVER_LOOKAHEAD, _future);
        return buildHoverLeg(cometPos, _future, target);
    }
    // Mid-trace: depart along the live heading
    return buildLeg(cometPos, cometDir, target);
}

// ── Fly-by pick ────────────────────────────────────────────────────
// A scenery galaxy sitting near the corridor between the comet and its
// target (not too close to either end) becomes a via point. Returns the
// galaxy.
function pickViaScenery(from, to) {
    _vA.subVectors(to, from);
    const abLenSq = _vA.lengthSq();
    if (abLenSq < 1e-6) return null;
    const abLen = Math.sqrt(abLenSq);

    let best = null;
    let bestPerp = VIA_MAX_PERP * abLen;
    for (const g of scenery) {
        const s = (_vB.subVectors(g.center, from).dot(_vA)) / abLenSq;
        if (s < VIA_BAND[0] || s > VIA_BAND[1]) continue;
        _vec3.copy(from).addScaledVector(_vA, s); // closest point on the line
        const perp = _vec3.distanceTo(g.center);
        if (perp < bestPerp) {
            bestPerp = perp;
            best = g;
        }
    }
    return best;
}

// ── Face-on camera alignment ───────────────────────────────────────
// Aim the camera at a planar stop: compute the face-on position once,
// then glide toward it each frame until arrival — unless the user
// already took over. The glide moves in spherical coordinates around
// the stop (distance, elevation, azimuth), so the camera swings around
// the side and never cuts over the top or through the stop.
function beginFaceAlign(stop) {
    const dist = fitFor(stop);
    faceCenter.copy(stop.center);
    textFacePos.copy(faceCenter).addScaledVector(stop.normal, -dist);
    faceSph.setFromVector3(_vec3.subVectors(textFacePos, faceCenter));
    _sph.setFromVector3(_vec3.subVectors(camera.position, faceCenter));
    faceR.x = _sph.radius; facePhi.x = _sph.phi; faceTheta.x = _sph.theta;
    // Start with the camera's current motion (no speed jump on arrival)
    const v = cam.cameraVel, sp = Math.sin(_sph.phi), cp = Math.cos(_sph.phi);
    const st = Math.sin(_sph.theta), ct = Math.cos(_sph.theta), r = Math.max(_sph.radius, 1e-3);
    faceR.v = v.x * sp * st + v.y * cp + v.z * sp * ct;
    facePhi.v = (v.x * cp * st - v.y * sp + v.z * cp * ct) / r;
    faceTheta.v = sp > 1e-3 ? (v.x * ct - v.z * st) / (r * sp) : 0;
    camAligned = userDragging; // user already in control → don't steer
}

// Returns true on the frame the camera arrives (settles)
function stepFaceAlign(dt) {
    if (camAligned) return false;
    // Shortest way round in azimuth
    let dTheta = faceSph.theta - faceTheta.x;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    cam.smoothDampScalar(faceR, faceSph.radius, FACE_ALIGN_TIME, dt);
    cam.smoothDampScalar(facePhi, faceSph.phi, FACE_ALIGN_TIME, dt, FACE_ALIGN_MAX_TURN);
    cam.smoothDampScalar(faceTheta, faceTheta.x + dTheta, FACE_ALIGN_TIME, dt, FACE_ALIGN_MAX_TURN);
    _sph.set(faceR.x, facePhi.x, faceTheta.x);
    camera.position.setFromSpherical(_sph).add(faceCenter);
    if (camera.position.distanceToSquared(textFacePos) < 0.0025) {
        camAligned = true;
        return true;
    }
    return false;
}

// ── Leave the flat ─────────────────────────────────────────────────
// On with the journey from inside the flat: from the comet head after the
// rocket morph, or from the walk ("Skip the flat", "Continue"; explore.js):
// there the walk ends where the camera is (no snap) and the comet starts a
// little ahead of the eye, along the view. It climbs through the cut
// ceiling and out over the window wall (flatExitVias) to the first stop
// after the flat. The walk's wider FOV eases back (updateTravel).
export function leaveFlat() {
    const dest = afterFlatIndex();
    if (REDUCED_MOTION.matches) {
        // no lift flight: straight to the graph (the walk's FOV goes back at once)
        if (phase === Phase.EXPLORE) { emitStop('leave', { to: dest }); explore.leaveInPlace(); }
        camera.fov = baseFov; camera.updateProjectionMatrix();
        jumpTo(dest);
        return;
    }
    if (phase === Phase.EXPLORE) {
        emitStop('leave', { to: dest });   // the panel and the room credit go
        explore.leaveInPlace();
        camera.getWorldDirection(cometDir);
        cometPos.copy(camera.position).addScaledVector(cometDir, LEAVE_AHEAD * apartment.scale)
            .addScaledVector(camera.up, -LEAVE_BELOW * apartment.scale);
        controls.target.copy(cometPos);    // the chase hand-off starts from this view
        trail.attractorIdx = stops[dest].paletteIdx ?? 0;
        clearTrail(trail); addTrailToScene(trail);
        pushPointWorld(trail, cometPos.x, cometPos.y, cometPos.z);
        worldPos.copy(cometPos);
    }
    stopIndex = -1;
    fromFlat = true;
    setupTravel(dest);
}

// Arrive at stop i by flight (?go=<id>&mode=fly, the agent API): from the
// stop before it; the first stop after the flat: the lift out of the flat
// from the intro spot (or from the walk)
export function flyTo(i) {
    if (stops[i - 1]?.type !== StopType.OBJECT) { jumpTo(i - 1); setupTravel(i); return; }
    if (phase !== Phase.EXPLORE) {
        intro.hideIntro(); hideTapPrompt();
        trail.fade = 1; clearTrail(trail); addTrailToScene(trail);
        const landing = stops.find(st => st.type === StopType.LANDING);
        cometPos.copy(landing.center); cometDir.copy(landing.normal);
        pushPointWorld(trail, cometPos.x, cometPos.y, cometPos.z);
        worldPos.copy(cometPos);
    }
    leaveFlat();
}

// An object VIEW stop (only without walk.js): on with the journey, as Skip
function leaveFlatFromStop() { emitStop('leave', { to: afterFlatIndex() }); leaveFlat(); }

// Walk mode at object stop i (?go=<object id>, the agent API): from
// anywhere; while walking already, a guided walk to it (Next object style)
export function walkAt(i) {
    if (!explore.hasWalker()) { jumpTo(i); return { ok: true }; }
    if (phase === Phase.EXPLORE) { stopIndex = i; return explore.guideTo(i); }   // (current() reports it)
    emitStop('leave');
    intro.hideIntro(); hideTapPrompt();
    tunnel.setFade(0); setInside(0);
    clearTrail(trail);
    explore.enterAtObject(i);
    return { ok: true, object: stops[i].id };
}
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

// ── Travel setup ───────────────────────────────────────────────────
export function setupTravel(destIdx) {
    finishWorld();
    const dest = stops[destIdx];
    explore.leaveNow();
    emitStop('leave', { to: destIdx }); // before stopIndex moves to the destination
    stops[stopIndex]?.viz?.rim?.setHover(false);

    // Aim at the FIRST stroke point so the comet flies straight into the
    // start of the trajectory (no spoke through the center) and begins
    // tracing from there.
    traceWorld(dest, 0, _targetPos);

    // The flight starts from the comet's *actual* head — cometPos — not
    // the stop center, so the trail flows on instead of snapping back.
    // Leaving the flat (leaveFlat) there is no stop to leave from.
    const from = fromFlat ? null : stops[stopIndex];
    const inTunnel = from?.tunnelS != null, toTunnel = dest.tunnelS != null;
    travelLegs = [];
    warp = null;
    flyby = null;
    easeC2 = inTunnel || toTunnel;
    if (!inTunnel && toTunnel) tunnel.setUnwrapRef(0);   // the flight heads for the tunnel start (see tunnel.sOf)
    const vias = fromFlat ? flatExitVias(cometPos, dest.center) : viasFor(from, dest);
    if (inTunnel || toTunnel) buildTunnelLegs(from, dest, inTunnel, toTunnel, vias);
    else buildOpenLegs(vias);

    // Time proportional to chord length
    let total = 0;
    for (const l of travelLegs) total += l.p0.distanceTo(l.p3);
    buildArcTable();
    travelDuration = THREE.MathUtils.clamp(total / TRAVEL_SPEED, TRAVEL_MIN, TRAVEL_MAX);
    travelDuration = Math.max(travelDuration, total / TRAVEL_LONG_SPEED); // very long hops take longer
    if (easeC2) {
        // Tunnel flights: time from the weighted length (rush zones count less, spirals more)
        // (+ the ease time, so the cruise pace is TUNNEL_SPEED on every tunnel flight)
        tunnelEase = TUNNEL_EASE_TIME * (inTunnel ? 1 : WARP_IN_EASE);
        travelDuration = THREE.MathUtils.clamp(travelWeightedLen / TUNNEL_SPEED + tunnelEase, TRAVEL_MIN, TUNNEL_TRAVEL_MAX);
    }
    fromFlat = false;
    fovEase.x = camera.fov; fovEase.v = 0;
    if (warp) {
        warp.g = legEndShare(warp.leg);
        warp.t = easeInverse(warp.g) * travelDuration;
    }

    // Comet glows in the destination's palette
    trail.attractorIdx = dest.paletteIdx ?? 0;

    stopIndex = destIdx;
    setHaloFocus(dest);
    worldPos.copy(cometPos); // the camera hand-off starts from the real head, not the stop center
    cam.setMode(cam.Mode.FOLLOW, controls);
    // Pre-compose the destination so the camera is already framed on arrival.
    // The wanted distance eases from the current one (updateTravel), so a
    // big change (a small rock -> a wide project) starts without a jolt.
    followFrom = camera.position.distanceTo(controls.target);
    followTo = fitFor(dest);
    arrivePos.copy(dest.center).addScaledVector(dest.normal, -fitFor(dest)); // = beginFaceAlign's target
    cam.setArrival(dest.center, arrivePos, 0);
    // Blend into the VIEW pose only when the flight arrives from the front:
    // from behind, a straight blend would swing the camera through the stop
    // (the face-align glide in VIEW goes round the side instead)
    arriveBlend = travelTangent(0.999, _vA).dot(dest.normal) > ARRIVE_MIN_DOT;
    cam.setFollowDistance(followFrom);
    // A fly-by is framed centred: the panel shift comes back after it
    shiftBack = !flyby;
    cam.setScreenShift(hasPanel(dest) && !flyby);
    enterPhase(Phase.TRAVEL);
}

// Path share where leg k ends (the warp jump point)
function legEndShare(k) {
    let g = 0;
    for (const e of travelArc) if (e.leg === k) g = e.s;
    return g;
}
// x with travelEase(x) = g (bisection; travelEase is monotonic)
function easeInverse(g) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (travelEase(m) < g) lo = m; else hi = m; }
    return (lo + hi) / 2;
}

// Departure leg onto the centreline at s, arriving along the tunnel
// tangent (C1 join with the centreline leg that follows)
function joinLeg(s, start = null) {
    const p3 = tunnel.centreWorld(s, new THREE.Vector3());
    // Leave mostly towards the join point, with a hint of the live heading
    // (loop or stroke) and no random arc: the camera, which faces the
    // stop, barely has to turn, and the comet trail bends only a little.
    // From a via (start = { p, dir }): leave exactly along its direction.
    const p0 = start ? start.p : cometPos;
    if (start) _vB.copy(start.dir);
    else _vB.subVectors(p3, cometPos).normalize().addScaledVector(cometDir, JOIN_HEADING_MIX).normalize();
    const leg = buildLeg(p0, _vB, p3, true, 0.35);
    leg.p2.copy(p3).addScaledVector(tunnel.tangentWorld(s, _vA), -0.35 * leg.p0.distanceTo(p3));
    return leg;
}
function centreLeg(s0, s1, endPos = null) {
    const leg = { tunnel: true, s0, s1, p0: tunnel.centreWorld(s0, new THREE.Vector3()), p3: tunnel.centreWorld(s1, new THREE.Vector3()) };
    if (endPos) { leg.endOffset = endPos.clone().sub(leg.p3); leg.p3.copy(endPos); }
    return leg;
}

// Centreline from sA to sB; with a fly-by in between, a helix leg round it
function pushCentre(sA, sB, endPos = null) {
    const fb = flybys.find(f => f.s - FLYBY_SPAN > sA + 2 && f.s + FLYBY_SPAN < sB - 2);
    if (!fb) { travelLegs.push(centreLeg(sA, sB, endPos)); return; }
    flyby = fb;
    const s0 = fb.s - FLYBY_SPAN, s1 = fb.s + FLYBY_SPAN;
    travelLegs.push(centreLeg(sA, s0));
    travelLegs.push({ helix: true, s0, s1, R: fb.radius + FLYBY_PAD, phase: -Math.PI / 2, offset: fb.offset,
        p0: tunnel.centreWorld(s0, new THREE.Vector3()), p3: tunnel.centreWorld(s1, new THREE.Vector3()) });
    travelLegs.push(centreLeg(s1, sB, endPos));
}

// Flights that touch the tunnel: warp in (open space -> tunnel), hops
// inside it, warp out (tunnel -> open space).
// Warp in from the graph: straight onto the tunnel start (vias, if any,
// first). Warp out: the exit comes home behind the apartment,
// over the roof (via), then a dive through the cut ceiling to the landing.
function buildTunnelLegs(from, dest, inTunnel, toTunnel, vias) {
    if (!inTunnel) {
        const last = vias.length ? buildViaLegs(vias, null) : null;
        travelLegs.push(joinLeg(0, last));
        warp = { kind: 'in', leg: travelLegs.length - 1 };
        pushCentre(0, dest.tunnelS, _targetPos);
    } else if (toTunnel) {
        const sJ = from.tunnelS + TUNNEL_DEPART;
        travelLegs.push(joinLeg(sJ));
        pushCentre(sJ, dest.tunnelS, _targetPos);
    } else {
        const sJ = from.tunnelS + TUNNEL_DEPART;
        const exit = tunnel.centreWorld(tunnelExitS, new THREE.Vector3());
        travelLegs.push(joinLeg(sJ), centreLeg(sJ, tunnelExitS));
        warp = { kind: 'out', leg: 1 };
        let p = exit, dir = tunnel.tangentWorld(tunnelExitS, new THREE.Vector3());
        for (const v of vias) {
            const leg = buildLeg(p, dir, v.p, true, 0.6);
            if (v.dir) leg.p2.copy(v.p).addScaledVector(v.dir, -VIA_PULL * leg.p0.distanceTo(v.p));
            travelLegs.push(leg);
            p = v.p;
            dir = v.dir ?? new THREE.Vector3().subVectors(leg.p3, leg.p2).normalize();
        }
        travelLegs.push(buildLeg(p, dir, _targetPos, true, 0.35, 0));
    }
}

// Chain of legs through via points ({ p, dir? }: with dir the comet crosses
// p exactly along it). The first leg leaves the flat (or the landing)
// mostly towards the first via, else as any departure (buildFirstLeg).
// Ends at `target`; with target null it ends at the last via and returns
// { p, dir } there, for a leg that continues from it.
function buildViaLegs(vias, target) {
    const fromStop = stops[stopIndex];
    let p = cometPos, dir = cometDir;
    vias.forEach((v, i) => {
        let leg;
        if (i === 0 && (fromFlat || fromStop?.type === StopType.LANDING)) {
            // leaving the flat: the heading (the rocket nose, the walker's view,
            // the loop round the landing text) has nothing to do with the way
            // out: leave mostly towards the first via, as joinLeg does
            _vD.subVectors(v.p, cometPos).normalize().addScaledVector(cometDir, JOIN_HEADING_MIX).normalize();
            leg = buildLeg(cometPos, _vD, v.p, true, 0.25, 0);
        }
        else if (i === 0) {
            // a hover departure, but no Thales bend at the via end: the comet is fast there
            leg = buildFirstLeg(v.p);
            leg.p2.copy(v.p).addScaledVector(_vC.subVectors(v.p, leg.p1).normalize(), -VIA_PULL * leg.p0.distanceTo(v.p));
        }
        else leg = buildLeg(p, dir, v.p, true, VIA_PULL);
        if (v.dir) leg.p2.copy(v.p).addScaledVector(v.dir, -VIA_PULL * leg.p0.distanceTo(v.p));
        travelLegs.push(leg);
        p = v.p;
        dir = v.dir ?? new THREE.Vector3().subVectors(leg.p3, leg.p2).normalize();
    });
    if (!target) return { p, dir };
    travelLegs.push(buildLeg(p, dir, target, true, VIA_PULL, 0));
    return null;
}

// Open space: swing past a scenery galaxy when one sits near the flight line.
// With vias (out of the flat) there is no galaxy (it would sit indoors).
function buildOpenLegs(vias = []) {
    const fromStop = stops[stopIndex];
    const fromRoom = fromFlat || fromStop?.type === StopType.OBJECT || fromStop?.type === StopType.LANDING;
    if (vias.length) {
        const g = fromRoom ? null : pickViaScenery(cometPos, vias[0].p);
        if (g) vias.unshift({ p: galaxyViaPoint(g, vias[0].p), dir: null });
        buildViaLegs(vias, _targetPos);
        return;
    }
    const via = pickViaScenery(cometPos, _targetPos);
    if (via) {
        const viaPos = galaxyViaPoint(via, _targetPos);
        const leg1 = buildFirstLeg(viaPos);
        // Cross the via along the mean of the ways in and out (a random
        // crossing made a tight S-bend there: acceleration spikes mid-flight),
        // and depart it along the same direction — smooth join
        _vec3.subVectors(viaPos, cometPos).normalize().add(_vA.subVectors(_targetPos, viaPos).normalize()).normalize();
        leg1.p2.copy(viaPos).addScaledVector(_vec3, -VIA_PULL * leg1.p0.distanceTo(viaPos));
        travelLegs.push(leg1, buildLeg(viaPos, _vec3, _targetPos, true));
    } else {
        travelLegs.push(buildFirstLeg(_targetPos));
    }
}

// Near edge of the galaxy, not its center: the closest point on the
// flight line (comet to `to`), pushed back out to the rim on that side
function galaxyViaPoint(g, to) {
    _vA.subVectors(to, cometPos);
    const s = _vB.subVectors(g.center, cometPos).dot(_vA) / _vA.lengthSq();
    _vec3.copy(cometPos).addScaledVector(_vA, s);
    return _vec3.sub(g.center).normalize()
        .multiplyScalar(g.radius * VIA_RIM).add(g.center).clone()
        .add(new THREE.Vector3(rand(-VIA_JITTER, VIA_JITTER), rand(-VIA_JITTER, VIA_JITTER), rand(-VIA_JITTER, VIA_JITTER)));
}

// ── Update ─────────────────────────────────────────────────────────
export function update(dt) {
    if (isPaused() || phase === Phase.DIMENSION) return;   // the app overlay covers the scene: idle
    if (frozen) { render(); return; }
    totalTime += dt;
    addJourneyTime(dt);
    intro.update(dt, totalTime);

    if (phase !== Phase.TRAVEL) audioState.speed = audioState.rush = audioState.warp = 0;
    switch (phase) {
        case Phase.INTRO:          updateIntro(dt); break;
        case Phase.ROCKET_EXIT:    updateRocketExit(dt); break;
        case Phase.TRAVEL:         updateTravel(dt); break;
        case Phase.VIEW:           updateView(dt); break;
        case Phase.PORTAL_IN:      portal.update(dt, true); break;
        case Phase.PORTAL_OUT:     portal.update(dt, false); break;
        case Phase.EXPLORE:        explore.update(dt); break;
    }

    // Tunnel window and nearby visualizations follow the viewer
    const here = stops[stopIndex];
    const atStop = phase === Phase.VIEW || phase === Phase.PORTAL_IN || phase === Phase.PORTAL_OUT;
    headS = atStop && here?.tunnelS != null ? here.tunnelS : tunnel.sOf(cometPos);
    tunnel.setView(headS);
    updateWorld(dt, headS);

    phaseTime += dt;

    if (trail && trail.inScene) {
        updateTrailAttributes(trail);
        updateTrailGlow(trail, totalTime);
    }

    if (phase !== Phase.EXPLORE) cam.update(dt, controls, camera, worldPos, headingOverride ?? cometDir);
    if (!skipRender) render();
}

// ── INTRO ──────────────────────────────────────────────────────────
// First tap: everything stays exactly where it is — only the rocket
// reacts, accelerating from its current idle spot into the comet streak.
function updateIntro(dt) {
    if (!tapPending) return;
    hideTapPrompt();
    // An early tap waits for the flat ("loading the flat · n %"), then goes on
    // (the tap stays pending). Skipping the walk does not wait.
    if (!skipWalk && !explore.flatReady()) { explore.holdForFlat(true); return; }
    explore.holdForFlat(false);
    tapPending = false;
    emitIntro('leave');
    enterPhase(Phase.ROCKET_EXIT);
}

// ── ROCKET_EXIT (the rocket accelerates in place, smears into the comet) ─
function updateRocketExit(dt) {
    if (phaseFirstFrame) {
        phaseFirstFrame = false;
        intro.setRocketCharging();
        // Start the comet trail right away so a glowing line draws straight
        // out of the accelerating rocket. As the rocket fades, the line is
        // what remains — then it flies off into the journey.
        trail.fade = 1;
        trail.attractorIdx = stops[afterFlatIndex()].paletteIdx ?? 0;
        clearTrail(trail);
        addTrailToScene(trail);
        intro.getRocketTipWorld(_startPos);
        pushPointWorld(trail, _startPos.x, _startPos.y, _startPos.z);
        cometPos.copy(_startPos);
    }

    // Trace the line from the rocket's tip as it accelerates forward
    intro.getRocketTipWorld(_vec3);
    pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    cometPos.copy(_vec3);

    // Keep the view framed on the rocket (not the text at the origin), so
    // the transformation stays centered on screen — the letters slide off
    // as the camera eases over and the forming streak trails behind it.
    cam.setOrbitCenter(_vec3.x, _vec3.y, _vec3.z);

    if (phaseTime >= ROCKET_MORPH_DURATION) {
        // Hand off: the comet continues from the tip along the same heading
        intro.getRocketDirWorld(cometDir);
        intro.hideIntro();
        worldPos.copy(_vec3);
        // Walk the flat from here (the tour); without a walker (dev/camlog.html)
        // or after "skip the walk" the comet leaves the flat at once
        if (skipWalk || !explore.enterFromIntro()) leaveFlat();
    }
}

// Ease-in/ease-out along the flight: the comet starts from rest, builds
// speed, then settles into the stop — smoothstep on the path parameter.
// Tunnel flights use smootherstep: it also starts and ends with zero
// acceleration, so the hops from the wide project stops start without a jolt.
// Tunnel flights cruise instead: speed ramps up (smoothstep-shaped) over
// the first TUNNEL_EASE_TIME, stays flat, ramps down at the end. Their
// speed profile comes from the path weights (buildArcTable): fast in the
// rush zones, slow round a fly-by.
function travelEase(x) {
    if (easeC2) {
        const a = Math.min(tunnelEase / travelDuration, 0.4), V = 1 / (1 - a);
        const P = y => y * y * y - y * y * y * y / 2;     // integral of smoothstep
        if (x < a) return V * a * P(x / a);
        if (x > 1 - a) return 1 - V * a * P((1 - x) / a);
        return V * (x - a / 2);
    }
    return easeC2 ? x * x * x * (x * (6 * x - 15) + 10) : x * x * (3 - 2 * x);
}

// Point the camera follows: the path averaged over ±CAM_PATH_WINDOW s
// (triangle weights), so tight bends do not whip the camera sideways.
// The window eases to zero at both ends (smoothstep, no kink), so the
// flight starts and ends exactly on the path.
function cameraAnchor(time, out) {
    const edge = Math.max(0, Math.min(time, travelDuration - time));
    const w = CAM_PATH_WINDOW * travelEase(Math.min(edge / (2 * CAM_PATH_WINDOW), 1));
    out.set(0, 0, 0);
    let sum = 0;
    for (let k = 0; k < CAM_PATH_SAMPLES; k++) {
        const s = 2 * (k + 1) / (CAM_PATH_SAMPLES + 1) - 1; // inside -1..1
        const wt = 1 - Math.abs(s);
        travelPoint(travelEase(THREE.MathUtils.clamp((time + s * w) / travelDuration, 0, 1)), _vB);
        out.addScaledVector(_vB, wt);
        sum += wt;
    }
    return out.divideScalar(sum);
}

// ── TRAVEL (Bezier arc to the next stop) ───────────────────────────
function updateTravel(dt) {
    // Eased path parameter so motion accelerates and decelerates instead
    // of jumping to constant speed the instant the comet departs.
    // phaseTime is the start of this frame; draw up to its end
    const t = travelEase(Math.min((phaseTime + dt) / travelDuration, 1));
    const prevT = travelEase(Math.min(phaseTime / travelDuration, 1));
    const w = warp ? updateWarp(phaseTime + dt, t) : 0;
    const sHead = easeC2 ? travelS(t) : 0;
    const k = flyby ? flybyFraming(sHead) : 0;
    // Rush: a gentle sense of speed at the fast zones (ring pulses, streaks, FOV)
    const rush = easeC2 ? tunnel.fastness(sHead) : 0;
    let dist = followFrom + (followTo - followFrom) * THREE.MathUtils.smoothstep(t, 0, FOLLOW_EASE);
    cam.setFollowDistance(dist + (FLYBY_CAM_DIST - dist) * k);
    trail.pointIntensity = 1 + WARP_COMET * w + FLYBY_GLOW * k; // the spiral glows

    for (let i = 1; i <= TRAVEL_POINTS_PER_FRAME; i++) {
        const subT = prevT + (t - prevT) * (i / TRAVEL_POINTS_PER_FRAME);
        travelPoint(subT, _vec3);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }
    trail.pointIntensity = 1.0;

    _prevHead.copy(cometPos);
    // Camera follows the path, smoothed over time
    travelPoint(t, cometPos); // the head's true position, for the next leg
    audioState.speed = dt > 0 ? Math.min(_prevHead.distanceTo(cometPos) / dt / 30, 1) : 0;
    audioState.rush = rush; audioState.warp = w;
    cameraAnchor(phaseTime + dt, worldPos);
    travelTangent(t, cometDir);
    if (easeC2) {
        tunnel.updateStreaks(dt, cometPos, cometDir, Math.max(w, RUSH_STREAKS * rush));
        tunnel.setRush(Math.max(w, RUSH_RINGS * rush));
        camera.fov = baseFov + WARP_FOV * w + RUSH_FOV * rush;
        camera.updateProjectionMatrix();
    } else if (camera.fov !== baseFov) {
        // after the walk (its FOV is wider): ease back
        cam.smoothDampScalar(fovEase, baseFov, FOV_EASE, dt);
        camera.fov = Math.abs(fovEase.x - baseFov) < 0.01 ? baseFov : fovEase.x;
        camera.updateProjectionMatrix();
    }
    // Arrival: blend into the VIEW pose over the last ARRIVE_BLEND of the time
    const x = Math.min((phaseTime + dt) / travelDuration, 1);
    const dest = stops[stopIndex];
    if (!arriveBlend) {
        cam.setArrival(null, null, 0);
    } else if (easeC2 && dest.tunnelS != null) {
        // in the tunnel: over the last ARRIVE_TIME s (the flights are long; the rush is over by then)
        cam.setArrival(null, null, THREE.MathUtils.smootherstep(phaseTime + dt, travelDuration - ARRIVE_TIME, travelDuration));
    } else {
        cam.setArrival(null, null, THREE.MathUtils.smootherstep(x, 1 - ARRIVE_BLEND, 1));
    }
    // Fly-by: the camera frames the viz, looking down the tunnel. Its
    // anchor hangs back along the axis by up to FLYBY_CAM_LAG (a C2 bump in
    // the comet's s, so it slows on the way in and catches up on the way
    // out, a slow dolly-in during the spiral), and slides sideways onto the
    // viz axis. Smooth functions of the comet's s: no parking, no jumps.
    headingOverride = null;
    if (flyby && Math.abs(sHead - flyby.s) < FLYBY_CAM_L + 4) {
        const u = (sHead - flyby.s - FLYBY_CAM_LAG_AT) / FLYBY_CAM_L;
        const lag = Math.abs(u) < 1 ? FLYBY_CAM_LAG * (1 - u * u) ** 3 : 0;
        // Near the spiral the anchor rides the centreline (not the spiralling
        // path); it takes over from the path anchor where the two agree
        tunnel.centreWorld(sHead - lag, _vA).addScaledVector(flyby.offset, k);
        const ride = 1 - THREE.MathUtils.smootherstep(Math.abs(sHead - flyby.s), FLYBY_SPAN + 6, FLYBY_SPAN + 14);
        tunnel.centreWorld(sHead, _vB);
        worldPos.add(_vB.subVectors(_vA, _vB));    // path anchor + (C(s - lag) + offset k - C(s))
        worldPos.lerp(_vA, ride);
        if (k > 0) headingOverride = _camDir.copy(cometDir).lerp(flyby.T, k).normalize();
    }
    if (!shiftBack && sHead > flyby.s + FLYBY_SPAN) {   // as the camera swings back, so the panel layout is set before the arrival
        shiftBack = true;
        cam.setScreenShift(hasPanel(stops[stopIndex]));
    }

    if (t >= 1) {
        enterView();
        stepFaceAlign(dt); // the camera keeps moving on the hand-off frame
    }
}

// Fly-by framing weight 0..1 over the comet's arc parameter s (a function
// of its place, so dt-free); smootherstep: the pull towards the viz starts
// without a jolt
function flybyFraming(s) {
    const u = (s - flyby.s) / FLYBY_CAM_L;
    return Math.abs(u) < 1 ? (1 - u * u) ** 3 : 0;
}

// ── Warp ───────────────────────────────────────────────────────────
// Strength w: 0 -> 1 over WARP_RISE s before the jump, back to 0 over
// WARP_FALL s after it. The tunnel fades in (or out) right at the jump.
function warpStrength(dtJump) {
    return dtJump < 0
        ? THREE.MathUtils.smoothstep(dtJump, -WARP_RISE, 0)
        : 1 - THREE.MathUtils.smoothstep(dtJump, 0, WARP_FALL);
}
function updateWarp(time, g) {
    const w = warpStrength(time - warp.t);
    // inside-ness: entry fades in before the throat, exit fades out after the mouth
    const inside = warp.kind === 'in'
        ? THREE.MathUtils.smootherstep(time, warp.t - WARP_FADE_PRE, warp.t + WARP_FADE_POST)
        : 1 - THREE.MathUtils.smootherstep(time, warp.t - WARP_FADE_POST, warp.t + WARP_FADE_PRE);
    tunnel.setFade(inside);
    setInside(inside);
    tunnel.setVortex(time);
    setBloomBoost(w);           // FOV, rush and streaks: updateTravel
    return w;
}
function endWarp() {
    warp = null;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    setBloomBoost(0);
    tunnel.setRush(0);
    tunnel.setVortex(0);
    tunnel.updateStreaks(0, cometPos, cometDir, 0);
}

// ── VIEW (camera orbits the stop; comet rides or loops) ────────────
function enterView() {
    const stop = stops[stopIndex];
    if (warp) endWarp();
    cam.setArrival(null, null, 0);
    cam.setRail(null, null, 0);
    if (easeC2) {                    // rush effects off
        camera.fov = baseFov; camera.updateProjectionMatrix();
        tunnel.setRush(0); tunnel.updateStreaks(0, cometPos, cometDir, 0);
    }
    headingOverride = null;
    flyby = null;

    cam.setMode(cam.Mode.ORBIT, controls);
    cam.setOrbitCenter(stop.center.x, stop.center.y, stop.center.z);

    controls.autoRotateSpeed = 0;
    beginFaceAlign(stop);
    loopT = 0;
    tracing = true;    // draw the element's trajectory once before looping
    traceCursor = 0;
    traceAcc = 0;
    if (stop.graph) enterGraph(stop);

    emitStop('enter');
    enterPhase(Phase.VIEW);
}

// World position of a planar stop's stroke point at a given index
// (clamped into range), mapped through the stop's plane basis.
function traceWorld(stop, idx, out) {
    const pts = stop.points2d;
    const i = THREE.MathUtils.clamp(idx, 0, pts.length - 1);
    return planePointToWorld(out, stop.center, stop.right, stop.up, stop.scale, pts[i]);
}

// Draw the element's own trajectory once: walk its stroke points in
// order at a speed that completes one full pass in TRACE_DURATION. Bold
// letter strokes (c=1) glow; faint connectors (c=0) stay dim. When the
// last point is reached, hand off to the viewing loop.
function tracePlanar(stop, dt, duration = TRACE_DURATION, maxPerFrame = TRACE_MAX_PER_FRAME) {
    const n = stop.points2d.length;
    traceAcc += (n / duration) * dt;
    let budget = Math.min(Math.floor(traceAcc), maxPerFrame);
    traceAcc -= budget;

    for (let i = 0; i < budget && traceCursor < n - 1; i++) {
        traceCursor++;
        const p = stop.points2d[traceCursor];
        trail.pointIntensity = stop.type === StopType.OBJECT ? OBJECT_TRACE_INTENSITY : p.c === 1 ? TRACE_STROKE_INTENSITY : TRACE_LINK_INTENSITY;
        planePointToWorld(_vec3, stop.center, stop.right, stop.up, stop.scale, p);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }
    trail.pointIntensity = 1.0;

    // Comet head + local stroke tangent (heading used if departing mid-trace)
    traceWorld(stop, traceCursor, cometPos);
    traceWorld(stop, traceCursor + 2, _vA);
    traceWorld(stop, traceCursor - 2, _vB);
    cometDir.subVectors(_vA, _vB);
    if (cometDir.lengthSq() < 1e-9) cometDir.set(1, 0, 0);
    cometDir.normalize();

    if (traceCursor >= n - 1) {
        // Hand off to the orbit, flying off the last stroke: seed the loop
        // at the trajectory end (cometPos) and let it settle onto the loop.
        tracing = false;
        loopT = 0;
        _loopOffset.subVectors(cometPos, loopPos(stop, 0, _vec3)); // end − center
    }
}

// Lazy Lissajous loop around a planar stop, sized to its bounds.
function loopPos(stop, u, out) {
    if (stop.type === StopType.PROJECT) return stop.rimR ? rimLoopPos(stop, u, out) : frameLoopPos(stop, u, out);
    if (stop.type === StopType.OBJECT) return ringLoopPos(stop, u, out);
    const w = Math.max(stop.halfW * 1.25, 0.4);
    const h = Math.max(stop.halfH * 1.6, 0.3);
    out.copy(stop.center)
        .addScaledVector(stop.right, w * Math.sin(0.7 * u))
        .addScaledVector(stop.up, h * Math.sin(1.3 * u))
        .addScaledVector(stop.normal, 0.35 * Math.sin(0.9 * u));
    return out;
}

// Object stops: the comet rides the halo ring. Its angle starts at the
// trace pace (u = 0 is the ring's last traced point) and eases to the loop
// pace, so the speed never jumps.
function ringLoopPos(stop, u, out) {
    const w0 = 2 * Math.PI / OBJECT_TRACE_DURATION, w1 = 2 * Math.PI / OBJECT_LOOP_PERIOD;
    const a = w1 * u + (w0 - w1) * OBJECT_LOOP_EASE * (1 - Math.exp(-u / OBJECT_LOOP_EASE));
    const R = stop.haloR;
    out.copy(stop.center)
        .addScaledVector(stop.right, R * Math.cos(a))
        .addScaledVector(stop.up, R * Math.sin(a));
    out.y += OBJECT_LOOP_BOB * R * Math.sin(2 * a);
    return out;
}

// Project stops: the comet circles the viz frame (a rounded rectangle
// walked at constant speed), so it never crosses the animation.
function frameLoopPos(stop, u, out) {
    const W = stop.halfW + PROJECT_LOOP_PAD, H = stop.blockHalfH + PROJECT_LOOP_PAD, r = 0.45;
    const sx = 2 * (W - r), sy = 2 * (H - r), arc = Math.PI * r / 2;
    const seg = [sy, arc, sx, arc, sy, arc, sx, arc];
    const per = 2 * sx + 2 * sy + 4 * arc;
    let d = ((u * PROJECT_LOOP_SPEED) % per + per) % per;
    let i = 0;
    while (i < 7 && d > seg[i]) { d -= seg[i]; i++; }
    const cx = W - r, cy = H - r;
    let x, y;
    // From the bottom of the left side, clockwise (up first)
    switch (i) {
        case 0: x = -W; y = -cy + d; break;
        case 1: { const a = Math.PI - d / r; x = -cx + Math.cos(a) * r; y = cy + Math.sin(a) * r; break; }
        case 2: x = -cx + d; y = H; break;
        case 3: { const a = Math.PI / 2 - d / r; x = cx + Math.cos(a) * r; y = cy + Math.sin(a) * r; break; }
        case 4: x = W; y = cy - d; break;
        case 5: { const a = -d / r; x = cx + Math.cos(a) * r; y = -cy + Math.sin(a) * r; break; }
        case 6: x = cx - d; y = -H; break;
        default: { const a = -Math.PI / 2 - d / r; x = -cx + Math.cos(a) * r; y = -cy + Math.sin(a) * r; }
    }
    return out.copy(stop.center)
        .addScaledVector(stop.right, x)
        .addScaledVector(stop.up, y + stop.blockMid)
        .addScaledVector(stop.normal, 0.2 * Math.sin(0.8 * u));
}

// Portal stops: the comet circles just outside the rim (clockwise, from the top)
function rimLoopPos(stop, u, out) {
    const R = stop.rimR + PROJECT_LOOP_PAD, a = Math.PI / 2 - u * PROJECT_LOOP_SPEED / R;
    return out.copy(stop.center)
        .addScaledVector(stop.right, R * Math.cos(a))
        .addScaledVector(stop.up, R * Math.sin(a))
        .addScaledVector(stop.normal, 0.2 * Math.sin(0.8 * u));
}

// The orbit the comet actually rides: the Lissajous plus a settle offset
// that decays from the trajectory end (set when tracing finishes) so the
// comet flies off the last stroke and eases onto the loop — instead of
// snapping back through the center. The offset vanishes within ~2s.
function loopPosSettled(stop, u, out) {
    loopPos(stop, u, out);
    const decay = Math.exp(-LOOP_SETTLE_RATE * u);
    if (decay > 1e-3) out.addScaledVector(_loopOffset, decay);
    return out;
}

function loopPlanar(stop, dt) {
    const prevU = loopT;
    loopT += dt;
    for (let i = 1; i <= LOOP_SUBSTEPS; i++) {
        loopPosSettled(stop, prevU + (loopT - prevU) * (i / LOOP_SUBSTEPS), _vec3);
        pushPointWorld(trail, _vec3.x, _vec3.y, _vec3.z);
    }
    // Heading = loop tangent (used when departing)
    loopPosSettled(stop, loopT + 0.02, _vA);
    loopPosSettled(stop, loopT - 0.02, _vB);
    cometDir.subVectors(_vA, _vB).normalize();
}

function updateView(dt) {
    const stop = stops[stopIndex];
    if (stop.graph) { updateGraph(stop, dt); return; }

    // Face the stop during the first moments, then hand the camera
    // back so the user can zoom/rotate freely
    const isObject = stop.type === StopType.OBJECT;
    stepFaceAlign(dt);                 // (no auto-rotate: every stop stays face-on)
    if (tracing) {
        // draw the trajectory once, then loop
        tracePlanar(stop, dt, isObject ? OBJECT_TRACE_DURATION : TRACE_DURATION);
        if (isObject) lightStop(stop, traceCursor);   // the dim halo lights up as it is traced
    } else {
        loopPlanar(stop, dt);
        loopPosSettled(stop, loopT, cometPos); // comet head rides the orbit
    }

    worldPos.copy(stop.center); // camera stays stable

    const delay = VIEW_TAP_DELAY[stop.type];
    if (phaseTime >= delay && portal.devAutoEnter(stop)) return;
    // A tap waits for the view delay and for the face-on glide to settle: an
    // arrival from behind glides round the stop at up to FACE_ALIGN_MAX_TURN,
    // and a departure then would reverse that turn in a snap (a drag ends the glide)
    const ready = phaseTime >= delay && camAligned;
    if (ready) showTapPrompt();

    if (tapPending && ready) {
        tapPending = false;
        hideTapPrompt();

        // an object stop (only without walk.js: dev pages) leaves the flat; after the landing, back to the first stop after the flat
        if (stop.type === StopType.OBJECT) { leaveFlatFromStop(); return; }
        setupTravel(stopIndex === stops.length - 1 ? afterFlatIndex() : stopIndex + 1);
    }
}

// ── GRAPH (the timeline: four frames, a tap per frame; eduGraph.js) ──
// The comet flies in to where the pen enters frame 1 (points2d[0]). In VIEW
// the graph plays its frame (eduGraph: the pen draws the axis, sweeps up
// the new column, then idles round the window) and the pen writes the comet
// trail. A tap before GRAPH_EARLY_TAP waits for it; before the frame's end
// it grows the frame at once; after it the next frame starts from where the
// comet is, and the camera pans (orbit centre and camera move together, so
// a drag rotation stays) to the next window over GRAPH_CAM_PAN. After frame
// 4 a tap flies on (the warp into the tunnel). Each frame sends its own
// journey:stop 'enter' (id, universe, panel, frame).
let graphK = 1;                 // the frame now (emitStop)
let graphStartFrame = 1;        // the frame enterView starts (jumpTo)
const graphTarget = new THREE.Vector3(), graphPanFrom = new THREE.Vector3(), graphPanTo = new THREE.Vector3();
const _gp = new THREE.Vector3(), _gq = new THREE.Vector3();

function enterGraph(stop) {
    graphK = graphStartFrame;
    graphStartFrame = 1;
    stop.graph.start(graphK, null);
    if (graphK > 1) stop.graph.snap();       // a jump lands on the grown frame
    tracing = false;
    graphFrameTarget(stop, graphK, graphTarget);
    graphPanFrom.copy(graphTarget); graphPanTo.copy(graphTarget);
    cam.setOrbitCenter(graphTarget.x, graphTarget.y, graphTarget.z);
    if (graphK > 1) camAligned = true;         // a jump: the camera is at this frame's pose already
}

function updateGraph(stop, dt) {
    const G = stop.graph;
    stepFaceAlign(dt);
    const t0 = G.time;
    G.update(dt);
    const t1 = G.time;
    // the pen writes the trail (sub-stepped, dt-based)
    trail.pointIntensity = GRAPH_PEN_INTENSITY;
    const n = Math.max(1, Math.ceil(dt * GRAPH_TRAIL_HZ));
    for (let i = 1; i <= n; i++) {
        graphToWorld(stop, G.cometAt(t0 + (t1 - t0) * i / n, _gp), _gq);
        pushPointWorld(trail, _gq.x, _gq.y, _gq.z);
    }
    trail.pointIntensity = 1.0;
    graphToWorld(stop, G.cometAt(t1, _gp), cometPos);
    graphToWorld(stop, G.cometAt(t1 + 0.05, _gp), _gq);
    if (_gq.distanceToSquared(cometPos) > 1e-10) cometDir.subVectors(_gq, cometPos).normalize();
    // the pan to this frame's window: the camera moves with the orbit centre
    _gq.lerpVectors(graphPanFrom, graphPanTo, THREE.MathUtils.smootherstep(t1, 0, GRAPH_CAM_PAN));
    _gp.subVectors(_gq, graphTarget);
    if (_gp.lengthSq() > 0) {
        graphTarget.copy(_gq);
        camera.position.add(_gp); controls.target.add(_gp);
        faceCenter.add(_gp); textFacePos.add(_gp);
    }
    cam.setOrbitCenter(graphTarget.x, graphTarget.y, graphTarget.z);
    worldPos.copy(graphTarget);

    const ready = t1 >= G.end && camAligned;
    if (ready) showTapPrompt();
    if (!tapPending || t1 < GRAPH_EARLY_TAP) return;   // an early tap waits for GRAPH_EARLY_TAP
    tapPending = false;
    if (t1 < G.end) { G.snap(); clearTrail(trail); return; }   // grow the frame at once
    if (!camAligned) return;
    hideTapPrompt();
    if (graphK < G.NFRAMES) {
        // the next frame, from where the comet is
        graphK++;
        G.start(graphK, stop.graph.group.worldToLocal(_gp.copy(cometPos)));
        graphPanFrom.copy(graphTarget);
        graphFrameTarget(stop, graphK, graphPanTo);
        emitStop('enter');
    } else {
        setupTravel(stopIndex === stops.length - 1 ? afterFlatIndex() : stopIndex + 1);
    }
}

// The agent API: the graph frame now (0 elsewhere), and one frame back (grown)
export function graphFrame() { return stops[stopIndex]?.graph && phase === Phase.VIEW ? graphK : 0; }

// ── Landing mail hit-plane ─────────────────────────────────────────
// Built by world.js; clickable only while viewing the contact landing
export function getMailPlane() {
    const stop = stops[stopIndex];
    if (phase !== Phase.VIEW || !stop || stop.type !== StopType.LANDING) return null;
    return mailPlaneFromWorld();
}
