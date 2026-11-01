// Background music: generative WebAudio, no audio files (0 bytes to load).
// A soft chord pad walks a slow lo-fi progression, a quiet pentatonic
// melody drifts over it, and plucks ring on events (a stop, a collected
// object). Each arrival also moves the pad on to the next chord (the
// landing: back to the root), so the harmony follows the journey. The comet drives it: speed and the tunnel rush open the filter
// and raise a noise whoosh, the warp swells. Graph: detuned saws + a sine
// sub -> low-pass -> feedback delay -> compressor.
// It starts on the first tap (a user gesture), fades in, and the
// .site-nav button mutes it (remembered). Off by default on phones (the
// visitor's remembered choice wins). ?music=0 turns it off (dev).
import { isMobile } from './attractors.js';
import { StopType } from './world.js';

// ── Tuning ─────────────────────────────────────────────────────────
const MASTER = 0.12;          // master gain (about -18 dBFS)
const FADE_IN = 4;            // s, after the first tap
const DUCK = 0.25;            // level while a project app is open
const BEAT = 0.42;            // s: the delay time, and the rush pulse
const CHORD_TIME = 4 * 4 * BEAT;   // s per chord (four bars)
// Am9, Fmaj9, Cmaj7, Em7 (MIDI): the bass, then four pad voices that move
// by step. All in A minor, so the pentatonic notes always fit.
const CHORDS = [[45, 55, 60, 64, 71], [41, 55, 60, 64, 69], [48, 55, 59, 64, 67], [40, 55, 59, 62, 67]];
const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76];   // A minor pentatonic, A3..E5
const PAN = [-0.45, 0.2, -0.2, 0.45];
const LP_BASE = 700;          // Hz: the pad filter at rest
const STORE_KEY = 'music.muted';

const midiHz = m => 440 * 2 ** ((m - 69) / 12);

// The audio graph on any context (also an OfflineAudioContext, for a preview).
// update(s) once per frame: s = { speed, rush, warp }, each 0..1.
export function createEngine(ctx, out, mobile = false) {
    const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.01; comp.release.value = 0.3;
    comp.connect(out);
    const level = gain(0, comp);                    // fade in, mute, duck

    // Space: a feedback delay with a dark loop (each echo softer and warmer)
    const delay = ctx.createDelay(1);
    delay.delayTime.value = BEAT;
    const loopLp = ctx.createBiquadFilter();
    loopLp.frequency.value = 1600;
    delay.connect(loopLp); loopLp.connect(gain(0.42, delay));
    delay.connect(gain(0.35, level));
    const padSend = gain(0.3, delay), pluckSend = gain(0.5, delay);

    // Pad: four voices (two detuned saws each, one on phones) + a sine sub
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = LP_BASE; lp.Q.value = 0.7;
    const padAmp = gain(1, level);
    padAmp.connect(padSend);
    lp.connect(padAmp);
    const voices = [];                              // [oscillators per voice]
    PAN.forEach((p, i) => {
        const pan = ctx.createStereoPanner();
        pan.pan.value = p; pan.connect(lp);
        const g = gain(0.07, pan);
        voices.push((mobile ? [0] : [-7, 7]).map(cents => {
            const o = ctx.createOscillator();
            o.type = 'sawtooth'; o.detune.value = cents;
            o.frequency.value = midiHz(CHORDS[0][i + 1]);
            o.connect(g); o.start();
            return o;
        }));
    });
    const sub = ctx.createOscillator();
    sub.frequency.value = midiHz(CHORDS[0][0]);
    sub.connect(gain(0.12, padAmp)); sub.start();
    // Slow drift of the filter; a pulse on the pad, only in the rush
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    lfo.connect(gain(180, lp.frequency)); lfo.start();
    const trem = ctx.createOscillator();
    trem.frequency.value = 1 / BEAT;
    const tremDepth = gain(0, padAmp.gain);
    trem.connect(tremDepth); trem.start();

    // Whoosh: looped white noise through a band-pass, silent at rest
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.8;
    const noiseAmp = gain(0, level);
    noise.connect(bp); bp.connect(noiseAmp); noise.start();

    let chord = 0, nextChord = ctx.currentTime + CHORD_TIME;
    let melody = 3, nextNote = ctx.currentTime + 3, nextParam = 0;

    // A soft bell: a sine and its octave, 8 ms attack, a long tail (no clicks)
    function pluck(m, when = 0, vel = 1) {
        const t = ctx.currentTime + 0.01 + when, f = midiHz(m);
        const env = gain(0, level);
        env.connect(pluckSend);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.25 * vel, t + 0.008);
        env.gain.setTargetAtTime(0, t + 0.008, 0.3);
        for (const [mul, g] of [[1, 1], [2, 0.2]]) {
            const o = ctx.createOscillator();
            o.frequency.value = f * mul;
            o.connect(gain(g, env));
            o.start(t); o.stop(t + 3);
        }
    }

    // Chord k (the next one by default): voices glide there; the clock restarts
    function stepChord(k = (chord + 1) % CHORDS.length) {
        const t = ctx.currentTime;
        chord = k;
        nextChord = t + CHORD_TIME;
        const c = CHORDS[chord];
        sub.frequency.setTargetAtTime(midiHz(c[0]), t, 0.3);
        voices.forEach((v, i) => v.forEach(o => o.frequency.setTargetAtTime(midiHz(c[i + 1]), t, 0.3)));
    }

    function update(s) {
        const t = ctx.currentTime;
        if (t >= nextChord) stepChord();
        if (t >= nextNote) {                        // the melody: a quiet random walk
            melody = Math.max(0, Math.min(PENTA.length - 1, melody + [-2, -1, 1, 2][Math.floor(Math.random() * 4)]));
            pluck(PENTA[melody], 0, 0.4);
            nextNote = t + BEAT * (4 + Math.floor(Math.random() * 8));
        }
        if (t < nextParam) return;                  // the params: 20 times a second is enough
        nextParam = t + 0.05;
        const { speed: v, rush: r, warp: w } = s;
        lp.frequency.setTargetAtTime(Math.min(LP_BASE + 1300 * v + 700 * r + 1500 * w, 3000), t, 0.25);
        padAmp.gain.setTargetAtTime(1 + 0.6 * w, t, 0.4);
        tremDepth.gain.setTargetAtTime(0.3 * r, t, 0.3);
        noiseAmp.gain.setTargetAtTime(0.08 * v + 0.12 * r + 0.3 * w, t, 0.25);
        bp.frequency.setTargetAtTime(350 + 1000 * v + 1800 * w, t, 0.3);
    }

    // Each arrival steps the chord first (the pluck then fits it). A stop:
    // one pluck. A collected object: a rising pair. The landing: home (A + E, the root chord)
    function event(kind, n = 0) {
        stepChord(kind === 'home' ? 0 : undefined);
        if (kind === 'stop') pluck(PENTA[3 + n % 5]);
        else if (kind === 'collect') { pluck(PENTA[4 + n % 3]); pluck(PENTA[6 + n % 3], 0.14); }
        else { pluck(57, 0, 0.8); pluck(64, 0.2, 0.8); pluck(69, 0.4); }
    }

    return { update, event, setLevel: (v, tc) => level.gain.setTargetAtTime(v, ctx.currentTime, tc) };
}

// ── The page ───────────────────────────────────────────────────────
const off = new URLSearchParams(location.search).get('music') === '0';
let ctx = null, engine = null, ducked = false, collects = 0;
let muted = isMobile;           // phones: off until the visitor turns it on
try { const v = localStorage.getItem(STORE_KEY); if (v !== null) muted = v === '1'; } catch { /* no storage: the default */ }
const target = () => (muted ? 0 : MASTER * (ducked ? DUCK : 1));

// main.js calls it on every tap and key (the first one is the user gesture)
export function start() {
    if (off || muted) return;
    if (ctx) { if (ctx.state === 'suspended' && !document.hidden) ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    engine = createEngine(ctx, ctx.destination, isMobile);
    engine.setLevel(target(), FADE_IN / 3);
}

// main.js, once per frame: s = orchestrator getAudioState()
export function update(s) {
    if (engine && ctx.state === 'running') engine.update(s);
}

const btn = off ? null : document.createElement('button');
if (btn) {
    btn.type = 'button';
    btn.className = 'sound-toggle';
    btn.textContent = 'music';
    btn.title = 'Background music on / off';
    btn.setAttribute('aria-pressed', String(!muted));
    btn.addEventListener('click', () => setMuted(!muted));
    document.querySelector('.site-nav')?.append(btn);
}

function setMuted(m) {
    muted = m;
    btn.setAttribute('aria-pressed', String(!m));
    try { localStorage.setItem(STORE_KEY, m ? '1' : '0'); } catch { /* private mode: this visit only */ }
    if (!ctx) { start(); return; }
    engine.setLevel(target(), m ? 0.15 : 0.4);
    if (m) setTimeout(() => { if (muted) ctx.suspend(); }, 700);   // after the fade: no CPU
    else ctx.resume();
}

const play = (kind, n) => { if (engine && !muted) engine.event(kind, n); };
const duck = (d) => { ducked = d; if (engine) engine.setLevel(target(), 0.5); };

document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (!muted) ctx.resume();
});
window.addEventListener('journey:stop', (e) => {
    if (e.detail.phase !== 'enter') return;
    play(e.detail.type === StopType.LANDING ? 'home' : 'stop', e.detail.index);
});
window.addEventListener('walk:collect', () => play('collect', collects++));
window.addEventListener('journey:portal', (e) => { if (e.detail.phase === 'enter') duck(true); });
window.addEventListener('journey:portal-exit', () => duck(false));
