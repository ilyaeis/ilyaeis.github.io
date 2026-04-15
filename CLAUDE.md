# CLAUDE.md — ilyaeis.github.io

## What This Is

Interactive 3D portfolio website for Ilja Safronovs. The site renders strange attractors
(chaotic dynamical systems) in real-time WebGL, threaded together by a tap-driven narrative
that flies the viewer through a vortex, text overlay, constellation of milestone rocks, and
five mathematical attractors. Stars twinkle in a 2D canvas behind everything.

**Live site:** https://ilyaeis.github.io/

## Tech Stack

- **Three.js 0.162.0** via CDN importmap (WebGL, OrbitControls, EffectComposer, UnrealBloomPass)
- **Vanilla JavaScript** ES6 modules — no bundler, no build step
- **Vanilla CSS** — animations, blend modes, responsive layout
- **GitHub Pages** — deployed directly from `main` branch

## File Map

```
index.html                 Entry point. Two canvases + text overlay + importmap
js/
  main.js         (179 L)  Stars animation, tap detection, animation loop, init
  orchestrator.js (851 L)  11-phase state machine — the choreography brain
  attractors.js   (470 L)  Three.js scene, shaders, RK4 physics, trail system
  camera.js        (66 L)  Smooth ORBIT/FOLLOW camera transitions
  strokeFont.js   (411 L)  Single-stroke font glyphs + procedural rock generation
css/
  style.css       (297 L)  Canvas layering, rocket animation, tap prompt, responsive
svg/
  linkedin.svg             Social link icon
analysis/
  attractor_chaos_analysis.py  Python analysis (Lyapunov exponents, plots)
```

## How The App Boots

```
index.html
  loads js/main.js as ES module
    main.js IIFE:
      1. sizeStarsCanvas()         — scale 2D canvas to viewport * devicePixelRatio
      2. initStars()               — create 100 star objects with random phase offsets
      3. initAttractor(canvas)     — attractors.js: set up Three.js scene, camera,
                                     renderer, bloom post-processing, OrbitControls
      4. initOrchestrator()        — orchestrator.js: grab DOM refs, create trail
                                     system, init camera controller, show tap prompt
      5. setupVisibilityObserver() — IntersectionObserver to pause/resume when offscreen
      6. requestAnimationFrame(loop)
```

## The Animation Loop

`main.js:loop(timestamp)` runs every frame:
1. Compute `dt` (capped at 0.1s to handle tab-away)
2. Update + render 100 twinkling stars on 2D canvas
3. Call `orchestrator.update(dt)` which:
   - Advances the state machine phase
   - Pushes new trail points into GPU buffers
   - Updates trail colors/alpha (decay + palette gradient)
   - Updates the glow point at the trail tip
   - Moves camera (orbit or follow mode)
   - Calls `composer.render()` (Three.js + bloom post-processing)

## The Scene — Full Phase Walkthrough

The orchestrator is an 11-phase state machine. Each phase generates trail points that
form a single continuous glowing line — the "pen" never lifts. Tapping advances phases.

```
Phase 0: INTRO
  Show "Ilja Safronovs / student. problem solver. builder." + LinkedIn
  Wait for tap

Phase 1: TRANSITION_OUT
  Fade intro text, FLIP-animate LinkedIn to corner
  After 0.8s → ROCKET_HINT

Phase 6: ROCKET_HINT
  CSS-animated rocket flies in (3s), lands center-screen, speech bubble appears
  Wait for tap → ROCKET_EXIT

Phase 7: ROCKET_EXIT
  Rocket loops and flies away (2.5s CSS animation)
  Create trail system, add to scene
  → VORTEX

Phase 2: VORTEX
  Growing spiral: radius = 0.001 + 0.05*t, spinning at 12 rad/s
  Plane precesses (tilts 5 deg per revolution) for 3D depth
  16 points/frame, camera stays at origin in ORBIT mode
  Wait for tap (after 1.5s) → FLIGHT_TO_TEXT

Phase 8: FLIGHT_TO_TEXT
  Cubic Bezier curve (2.5s) from vortex tip to text center
  30 points/frame, camera switches to FOLLOW mode
  → TEXT_DRAW

Phase 9: TEXT_DRAW
  Traces "CREATIVE. ADAPTIVE. CURIOUS." using stroke font glyphs
  170 points/frame, camera smoothly rotates face-on to the text plane
  Camera orbits with autoRotateSpeed=0 (stationary)
  → FLIGHT (with 1s camera linger delay)

Phase 3: FLIGHT
  Cubic Bezier (4s) from text/previous attractor to next attractor center
  30 points/frame along the curve
  At 80% of flight: blend in attractor physics (smoothstep ramp 0→1)
  By 100%: pure attractor integration, camera switches to ORBIT
  → ATTRACTOR_DRAW

Phase 4: ATTRACTOR_DRAW
  Pure attractor integration at offset position
  Points ramp from 50 → 300/frame over 5s
  Camera auto-rotates around attractor center
  Wait for tap (after 5s):
    - If Lorenz (first) and constellation not done → setupConstellation → ROCK_FLIGHT
    - Otherwise → LAUNCH_FROM_ATTRACTOR

Phase 5: LAUNCH_FROM_ATTRACTOR
  Grab attractor tip position + derivative direction
  Advance attractorIndex to next (wraps around)
  Set up Bezier to next attractor center (FLIGHT_DISTANCE=10 units away)
  Freeze trail colors, switch palette
  → FLIGHT (immediate, no camera delay)

Phase 10: ROCK_FLIGHT  (constellation only, after Lorenz)
  Curved Bezier flight to next milestone rock
  Grey preview outlines visible for all 3 rocks in triangle layout
  → ROCK_DRAW

Phase 11: ROCK_DRAW  (constellation only)
  Traces procedural rock outline + label text (GYMNASIUM, BACHELOR IN, GIRAFFE360)
  110 points/frame, camera aligns face-on, grey preview fades as colored draws over it
  After last rock: advance to Rossler attractor → FLIGHT
```

**Attractor cycle after constellation:** Lorenz → Rossler → Thomas → Aizawa → Halvorsen → Lorenz (loops)

## The 5 Strange Attractors

Each attractor is a chaotic dynamical system solved with 4th-order Runge-Kutta integration.

| Name      | Key Equation Trait         | dt    | Scale  | Palette              | Camera Speed |
|-----------|----------------------------|-------|--------|----------------------|--------------|
| Lorenz    | Classic butterfly (sigma/rho/beta) | 0.005 | 0.0334 | Gold → Orange → Red  | 0.7          |
| Rossler   | Spiral with spike (a/b/c)  | 0.008 | 0.0705 | Blue → Cyan → Teal   | 0.5          |
| Thomas    | Sine-coupled (b)           | 0.05  | 0.2928 | Purple → Magenta → Pink | 0.6       |
| Aizawa    | Torus-like (6 params)      | 0.005 | 0.5299 | Green → Cyan → Teal  | 0.5          |
| Halvorsen | Symmetric cubic (a)        | 0.004 | 0.0782 | Yellow → Gold → White | 0.6         |

Each attractor defines: `derivatives(x,y,z,params)`, `scale`, `center` (phase-space origin),
`initialCondition`, `palette` (3 Three.js Colors), `camera` (radius, elevation, azimuthSpeed).

## Trail Rendering System (attractors.js)

A single trail system holds all points for the entire journey. Key data:

- `positions`: Float32Array(MAX_POINTS * 3) — XYZ per point
- `alphas`: Float32Array(MAX_POINTS) — per-vertex opacity (exponential decay, rate=4.0)
- `colors`: Float32Array(MAX_POINTS * 3) — per-vertex RGB from attractor palette
- `colorFreezeIdx`: points before this index keep their baked colors (prevents recoloring
  text/rocks when switching attractor palettes)

**Shaders:** Custom vertex/fragment with per-vertex alpha + color, additive blending
(black = transparent). Fragment discards alpha < 0.003. Glow shader renders a pulsing
soft circle at the trail tip.

**Ring buffer:** When pointCount reaches MAX_POINTS (30K mobile, 60K desktop), oldest
points are evicted via `copyWithin` — the trail is always a sliding window.

**Post-processing:** EffectComposer → RenderPass → UnrealBloomPass (strength 1.2,
radius 0.5, threshold 0.1). Bloom resolution scaled down (25% mobile, 50% desktop).

## Camera System (camera.js)

Two modes with smooth transitions (smoothstep easing):

- **ORBIT:** Converges to `orbitCenter` with autoRotate. Ramp: 2s slow→fast.
  Used during attractor display and text/rock drawing.
- **FOLLOW:** Tracks the moving trail tip (`worldPos`). 0.5s delay before following,
  2.5s ramp to full tracking speed. Used during flight phases.

Mode switches reset the ramp timer. OrbitControls provide user interaction (rotate, zoom,
no pan) in all phases.

## Stroke Font + Rock Generation (strokeFont.js)

**Glyphs:** Hand-crafted single-stroke paths for A-Z, period, space. Each glyph is a
continuous polyline (pen never lifts). Coordinates: x in [0, width], y in [0, 1].

**generateTextLines(lines):** Converts text strings into a flat array of {x,y} points.
Multi-line text is vertically spaced, with smooth connecting curves between lines.

**generateRockWithLabel(sizeFactor, seed, label, sublabel):** Procedural asteroid outline
with label text below it. Uses seeded random for deterministic shapes. Returns `{ points, outlineCount }`
where outlineCount separates the rock outline (used for grey preview) from the label text.

## CSS Layering

```
z-index 0:  #stars canvas (2D, fixed, pointer-events: none)
z-index 1:  #attractor canvas (WebGL, fixed, mix-blend-mode: screen → black = transparent)
z-index 1:  .page-1 section (text overlay, pointer-events: none)
z-index 2:  .container (intro text + social link)
```

The `screen` blend mode on the attractor canvas makes its black background transparent,
so stars show through the 3D scene.

## Mobile Optimization

Detected via user agent + touch points + viewport width (`attractors.js:18`):
- MAX_POINTS: 30K (vs 60K desktop)
- Bloom resolution: 25% (vs 50%)
- Pixel ratio cap: 1.5 (vs 2.0)

## Key Tuning Constants (orchestrator.js)

| Constant              | Value    | Purpose                                    |
|-----------------------|----------|--------------------------------------------|
| VORTEX_GROWTH         | 0.05     | Spiral radius expansion rate               |
| VORTEX_ANGULAR_SPEED  | 12.0     | Spin speed (rad/s)                         |
| VORTEX_PRECESS_DEG    | 5.0      | Plane tilt per revolution                  |
| FLIGHT_DURATION       | 4.0s     | Bezier curve flight time                   |
| FLIGHT_DISTANCE       | 10.0     | World units between attractors             |
| BLEND_START           | 0.80     | When attractor physics starts blending in  |
| TEXT_SCALE             | 0.22     | World-space size of text                   |
| TEXT_LINGER_CAMERA     | 1.0s     | Camera stays on text after drawing         |
| ATTRACTOR_MIN_DRAW     | 5.0s     | Minimum time before tap advances           |
| ROCK_SCALE             | 0.4      | World units per 2D rock unit               |
| ROCK_FLIGHT_SPEED      | 2.5      | World units per second through constellation|

## Data Flow Summary

```
User Tap → main.js pointerup (drag guard: <10px) → orchestrator.onTap()
  → sets tapPending = true
  → update() checks tapPending in current phase handler
  → phase transition fires (enterPhase sets phaseTime=0)
  → new phase handler generates trail points via pushPointWorld()
  → updateTrailAttributes() recomputes alpha/color, flags GPU buffers dirty
  → updateTrailGlow() positions pulsing glow at trail tip
  → cam.update() lerps camera target (orbit center or follow point)
  → composer.render() draws scene with bloom post-processing
```

## Development

No build tools needed. Serve with any static server:
```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000 in a browser. All Three.js dependencies load from CDN.

## Milestone Constellation (after Lorenz)

Three rocks in a triangle layout, each with a label:
1. **GYMNASIUM** / RIGA (sizeFactor 1.0, distance 8.0)
2. **BACHELOR IN** / FINANCIAL ENGINEERING (sizeFactor 0.55, distance 7.0)
3. **GIRAFFE360** (sizeFactor 0.35, distance 5.0)

Grey preview outlines appear for all rocks at once. As each rock is drawn in color,
its grey preview fades out. After all rocks, the trail flies to the Rossler attractor.
