# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal portfolio site (GitHub Pages, `ilyaeis.github.io`). It is a single-page WebGL experience: a tap-driven "journey" that flies a glowing comet trail from an intro screen through the three trait words (it traces and spirals around them, no tap), then to five milestone rocks and a contact landing. On the way it swings past dim, slowly spinning strange-attractor "galaxies" (scenery). At each rock the camera shifts the rock to one side, and an HTML panel shows the milestone text on the other side. No framework, no build step, no tests. three.js loads from a CDN through an import map in `index.html`.

The same content exists in three places. Keep them in sync when journey content changes:
- `js/world.js` (`TEXT_LINES`, `MILESTONES` incl. each `panel`, `LANDING_LINES`, `CONTACT_EMAIL`) — what the WebGL journey shows. Rock labels and panel text both come from `MILESTONES`.
- `index.html` — the SEO mirror: meta/OG tags, JSON-LD, a `visually-hidden` content block, a `<noscript>` fallback.
- `resume.html` (+ `css/resume.css`) — the plain-HTML resume, linked from the page.

## Commands

```bash
# Serve locally (any static server works; ES modules need http://, not file://)
python3 -m http.server 8000
# then open http://localhost:8000/
```

- Deployed by pushing to `main` (GitHub Pages).
- No lint/test/build tooling. Verify changes by loading the page and tapping through all stops (hard-refresh with Ctrl+F5 to bypass cached JS).
- Dev URL params (read in `orchestrator.init`): `?stop=N` lands the comet at `stops[N]` at once. `?leg=N` starts the flight into stop N (N >= 1), so you can check a galaxy fly-by. Stop indexes: 0 is the trait text, 1-5 the rocks, 6 the landing. `?leg=1` checks the first galaxy fly-by. `?t=S` steps S seconds before the first frame (dev only; combine with `?stop`/`?leg`).
- Headless Chrome (SwiftShader) runs almost no animation frames. `?stop=N` works headless because it needs no frames to settle. `?leg=N` fly-bys need a real browser.
- `analysis/attractor_chaos_analysis.py` is an offline helper used to derive attractor `scale`/`center` constants. It is not part of the site.

## Architecture

Everything renders into one canvas (`#attractor`). The core idea: **one continuous trail line travels through world space for the whole experience**. The comet streak, traced text, rock outlines, flight arcs, and attractor curves are all points pushed into the same ring buffer. The world is built once at start and is static. Each stop sits at a fixed random position in 3D space.

### Module roles (js/)

- **main.js** — bootstrap and input. The rAF loop calls `orchestrator.update(dt)`. A pointer that moves less than 10px is a tap and calls `onTap()`. Enter and Space (outside `a`/`button`) also count as a tap. Pointer events inside `.site-nav` are ignored. It raycasts the 3D LinkedIn and GitHub icons and the landing's mail plane for clicks and cursor. An IntersectionObserver pauses rendering when the canvas is offscreen.
- **world.js** — builds the static world once (`buildWorld(scene)`). `ROUTE` lists the stops in order: one TEXT block, five ROCKs, LANDING. The text starts dim (`TEXT_DIM_ALPHA`), and `lightStop(stop, idx)` brightens it as the comet traces it. Each planar stop also carries `blockMid`/`blockHalfH` (the real vertical middle and half-height of its strokes). Each `StopType` (`TEXT`, `ROCK`, `LANDING`) has a pre-built point set with baked HDR colors and one shared stop shader. Stops scatter randomly: each hop is a random direction, lightly biased along `journeyDir`, with min/max hop and separation limits (rocks sit closer together). Each rock stop carries `panel` from `MILESTONES` (`{ title, subtitle?, dates?, items: [{ text, href? }], more?: { href, label } }`). `ATTRACTORS` are no longer stops: `buildWorld` also builds `scenery[]`, one dim curve per flight leg (`SCENERY_LEGS = [1..6]`; attractor `k % ATTRACTORS.length`), placed beside the leg. `updateScenery(dt)` spins them. Exports `stops[]`, `scenery[]`, `updateScenery`, `planePointToWorld`, `CONTACT_EMAIL`, and `getMailPlane()`. The mail plane is an invisible mesh over the email line of the landing; main.js raycasts it for a `mailto:` click.
- **orchestrator.js** — the brain. A `Phase` state machine: INTRO → ROCKET_EXIT (first tap: the rocket morphs into the comet in place) → TRAVEL → VIEW, then back to TRAVEL on the next tap. Taps do not queue across phases, and each stop has a minimum view time (`VIEW_TAP_DELAY`). A flight is `travelLegs`: chained cubic Beziers, with an optional via-point and a corkscrew on the first flight. Stops depart along their loop motion (`HOVER_LOOKAHEAD`). If a scenery galaxy sits near the flight line, `pickViaScenery` adds a via-point so the comet swings past it. `emitStop('enter')` runs at the end of `enterView`. `emitStop('leave')` runs at the start of `setupTravel`. For rocks, `setupTravel` calls `cam.setScreenShift(true)`, and the fit distance leaves room for the panel (`ROCK_FIT_SIDE`, `ROCK_FIT_BOTTOM`). It owns `worldPos`, the world-space comet head that the camera follows. In VIEW, planar stops first trace their strokes once (`tracing`), then loop (`loopT`). The TEXT stop is special: faster trace (`TEXT_TRACE_DURATION`), the loop is a helix (`helixPos`, `SPIRAL_*`), and after `SPIRAL_DURATION` it calls `setupTravel` itself — no tap. After the landing the tour loops back to stop 1 (the first rock).
- **attractors.js** — three.js toolkit: scene, camera, renderer, UnrealBloom composer, OrbitControls, the `ATTRACTORS` table (derivatives, `dt`, `scale`, `center`, palette; used for palettes and scenery curves), the RK4 integrator, the trail system, and the starfield. The trail is one `THREE.Line` with position/alpha/color attributes (`MAX_POINTS` ring buffer, additive blending). `pushPointWorld` pushes world-space coords into the trail.
- **camera.js** — two modes: `Mode.ORBIT` (target eases to a fixed center, auto-rotate) and `Mode.FOLLOW` (chase camera: `camera = look − chaseDir×dist + up×FOLLOW_UP·dist`, `look = comet + chaseDir×FOLLOW_AHEAD·dist`; `chaseDir`, `dist` and the hand-off offset are exponentially smoothed at `FOLLOW_RATE`; `setFollowDistance` is set per flight to the destination's fit distance). ORBIT eases the target at `ORBIT_RATE`. `setScreenShift(on, immediate)` eases a `camera.setViewOffset` projection shift: the rock moves to the left (side layout) or the top (bottom layout). The orbit target does not move. `isPanelSideLayout()` uses `PANEL_SIDE_QUERY`.
- **stopPanel.js** — self-initialising module. It listens for the `journey:stop` event on `window` and fills the `.stop-panel` element with `textContent` only (no `innerHTML`). `enter` with a panel shows it (adds `.visible` and `body.panel-open`). `leave`, or `enter` without a panel, hides it. Contract: `detail = { phase: 'enter' | 'leave', index, type, panel }`. You can test it from the console by dispatching that event.
- **intro3d.js** — the 3D intro: extruded name text, LinkedIn and GitHub icons (side by side, with `LINKEDIN_URL`/`GITHUB_URL`), and the rocket with idle loops. Objects live on a world-space anchor, so view rotation moves them with the stars. On the first tap the text and icons stay put. Only the rocket animates: `setRocketCharging` freezes its idle transform and stretches it into the comet streak. `getRocketTipWorld`/`getRocketDirWorld` give the orchestrator the start point and heading.
- **strokeFont.js** — single-stroke vector font and procedural rock outlines (`generateTextLines`, `generateRockWithLabel`). The rock label is capped at 80% of the rock width. They return flat 2D point arrays `{x, y, c}`. `c=0` is a faint pen-travel stroke. `c=1` is a letter stroke. world.js maps them onto a world-space plane.

### Conventions that matter

- **HTML overlays (`.site-nav`, `.stop-panel`)**: they sit over the canvas. main.js must keep ignoring pointer events inside both, or a link click would also advance the journey.
- **Script order**: in `index.html`, `js/stopPanel.js` must load BEFORE `js/main.js`. With `?stop=N`, `orchestrator.init` dispatches `journey:stop` synchronously. If the listener does not exist yet, the event is lost.
- **Layout query sync**: the media query `(min-width: 700px) and (orientation: landscape)` appears in `css/style.css` (panel at the side) and as `PANEL_SIDE_QUERY` in camera.js (screen shift). Change both together.
- **Brightness via intensity**: `trail.pointIntensity` > 1 writes HDR colors that feed the bloom pass (bold strokes, streak flash). A value < 1 renders faint (connector strokes). See `STROKE_INTENSITY`/`LINK_INTENSITY` in world.js and `TRACE_STROKE_INTENSITY`/`TRACE_LINK_INTENSITY` in orchestrator.js.
- **Palette switches**: set `trail.colorFreezeIdx = trail.pointCount` before changing `trail.attractorIdx`, so drawn points keep their colors.
- **Camera fights**: phases that auto-align the camera (`camAligned` + lerp toward `textFacePos`) must yield to the user. A `controls` `start` listener sets `camAligned = true` when the user grabs the view. Use this pattern for any new camera steering.
- **Frame-rate independence**: drawing speeds are dt-based (`drawAcc`/`traceAcc` point budgets, sub-stepped curve sampling between `prevT` and `t`). Never use per-frame counts.
- **Starfield**: stars wrap in a cube around the scene center and are re-projected in the vertex shader onto a shell 1x to 10x the camera-to-scene distance, with zoom-relative point sizing. They must always read as far background.
- **Mobile** (`isMobile` in attractors.js): fewer trail points and stars, lower bloom resolution, capped pixel ratio. Keep new effects behind the same scaling.
- Tuning constants live in commented blocks at the top of each module (the "Tuning" section in orchestrator.js, the constants block in world.js). Adjust them there, not inline.
