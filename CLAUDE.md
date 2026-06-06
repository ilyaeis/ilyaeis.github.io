# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal portfolio site (GitHub Pages, `ilyaeis.github.io`) — a single-page WebGL experience: a tap-driven "journey" that flies a glowing trail line from an intro screen through a vortex, traced text, milestone rocks, a sequence of strange attractors, and a contact landing. No framework, no build step, no tests. three.js is loaded from CDN via an import map in `index.html`. `index.html` also carries the SEO mirror of the experience (meta/OG tags, JSON-LD, a `visually-hidden` content block) — keep it in sync when journey content changes.

## Commands

```powershell
# Serve locally (any static server works; ES modules require http://, not file://)
python -m http.server 8000 --directory .
# then open http://localhost:8000/
```

- Deployed by pushing to `main` (GitHub Pages). Push over **HTTPS**, not SSH.
- No lint/test/build tooling — verify changes by loading the page and clicking through the phases (hard-refresh with Ctrl+F5 to bypass cached JS).
- `analysis/attractor_chaos_analysis.py` is an offline helper used to derive attractor `scale`/`center` constants; it is not part of the site.

## Architecture

Everything renders into one canvas (`#attractor`). The core idea: **a single continuous trail line travels through world space for the entire experience** — the rocket streak, vortex spiral, traced text, rock outlines, flight arcs, and attractors are all points pushed into the same ring buffer. The journey never returns; each stop is drawn at a new `attractorOffset` further out in world space.

### Module roles (js/)

- **main.js** — bootstrap + input. rAF loop calls `orchestrator.update(dt)`. Tap detection with a drag guard (pointer moved < 10px = tap → `onTap()`); raycasts the 3D LinkedIn icon and the landing's mail hit-plane for clicks/cursor; pauses via IntersectionObserver when the canvas is offscreen.
- **orchestrator.js** — the brain. A `Phase` enum state machine (INTRO → rocket hint/exit/streak → VORTEX → text draw → FLIGHT → ATTRACTOR_DRAW → rock constellation → attractor tour → contact landing after the last attractor → loops through attractors). Phases advance on `tapPending` after a minimum time. Owns flight Bezier curves (`bezP0..3`), the world-space cursor `worldPos` (what the camera follows), and per-phase camera handoff. The landing traces `LANDING_LINES` (contact email) and parks an invisible `mailPlane` over the text that main.js raycasts for a `mailto:` click.
- **attractors.js** — three.js toolkit: scene/camera/renderer/UnrealBloom composer, OrbitControls, the `ATTRACTORS` table (derivatives, `dt`, `scale`, `center`, palette, orbit camera params), RK4 integrator, the trail system, and the starfield. The trail is one `THREE.Line` with position/alpha/color attributes (`MAX_POINTS` ring buffer; old points shift out), additive blending. `pushPoint` transforms attractor-space coords; `pushPointWorld` takes world coords directly.
- **camera.js** — two modes: ORBIT (target converges to a fixed center, auto-rotate) and FOLLOW (target lerps after the flying `worldPos`). All transitions ease slow→fast.
- **intro3d.js** — the 3D landing page (extruded name text, LinkedIn icon, rocket with idle loops). Objects live on a world-space anchor so view rotation moves them with the stars; the rocket/icon re-parent to the camera (`camera.attach`) when they need to glide to screen-anchored spots. Mode setters (`startExit`, `setRocketLanding`, …) are driven by the orchestrator.
- **strokeFont.js** — single-stroke vector font + procedural rock outlines. Generates flat 2D point arrays `{x, y, c}` that the orchestrator maps onto a world-space plane; `c=0` marks faint pen-travel strokes, `c=1` letter strokes.

### Conventions that matter

- **Brightness via intensity**: `trail.pointIntensity` > 1 writes HDR colors that feed the bloom pass (bold strokes, streak flash); < 1 renders faint (connector strokes). `LINK_INTENSITY`/`STROKE_INTENSITY` in orchestrator.js.
- **Palette switches**: set `trail.colorFreezeIdx = trail.pointCount` before changing `trail.attractorIdx` so already-drawn points keep their colors.
- **Camera fights**: phases that auto-align the camera (`camAligned` + lerp toward `textFacePos`) must yield to the user — a `controls` `start` listener sets `camAligned = true` the moment the user grabs the view. Follow this pattern for any new camera steering.
- **Frame-rate independence**: drawing speeds are dt-based (`drawAcc` point budgets, sub-stepped curve sampling between `prevT` and `t`) — never per-frame counts.
- **Starfield**: stars wrap in a cube around the scene center and are re-projected in the vertex shader onto a shell 1×–10× the camera-to-scene distance, with zoom-relative point sizing — they must always read as far background.
- **Mobile** (`isMobile` in attractors.js): fewer trail points/stars, lower bloom resolution, capped pixel ratio. Keep new effects behind the same scaling.
- Tuning constants live in commented blocks at the top of each module (orchestrator.js "Tuning" section) — adjust there, not inline.
