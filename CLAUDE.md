# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal portfolio site (GitHub Pages, `ilyaeis.github.io`). The home page is one column of plain text that sells Ilja as an R&D engineer in 3D Gaussian splatting. Order: the 3D head (floats right of the hero: a live Gaussian splat of his head, `clamp(140px, 20vw, 220px)` from 700 px, 120 px below, caption "Me in 3D: splat or mesh." plus the method line "Phone video, COLMAP, gsplat. Mesh: PGSR." and the hint), name, role line with start date and study (seniority up front), a small link to the few-photo study, the claim (h1), Resume, PDF and Email, Work (five items: the windows fix, pruning rules and kernels, the faster pipeline, the drone video, the mentoring/leading line, then "Next, I want to grow into leading a team." as a plain detail line), the flat card (a live Gaussian splat of a flat he trained; links the few-photo page), four side projects (the few-photo study first), Contact, a team line. No Tools section (the team tools are in the resume only). Dark theme only. No framework, no build step, no tests. three.js (0.180.0) and Spark (`@sparkjsdev/spark` 2.4.0, the splat renderer) load from a CDN through the import map in `index.html`, only after `load` (for the head) or when the flat card is near.

The design came from `~/Desktop/brain/reports/portfolio-site/design/` (`notes.md`: design rules and decisions; `proto/`: the approved prototype).

## Files

- `index.html` — the page. All text is in the HTML. `<head>`: meta, OG/twitter tags (`og-image.png?v=4`), canonical, favicon, JSON-LD `Person` (`@id` `https://ilyaeis.github.io/#me`, shared with `resume.html`), the import map. Section ids: `#work`, `#flat`, `#projects`, `#contact` (`llms.txt` links them).
- `css/style.css` — the page style. Colour tokens on `:root` (`--bg #121110`, `--fg`, `--fg-2`, `--line`, `--bg-2`, `--accent #f2b85a` amber, from the lamps of the splat). One font: Inter from Google Fonts.
- `js/page.js` — the only script the page loads. It loads `js/head.js` (after load, at idle, in view) and loads `js/flat.js` when each comes near the view. The flat waits until the head splat is in, so only one splat loads at a time.
- `js/flat.js` — the flat viewer: three.js + Spark, drag to look round from a fixed spot by the sofa.
- `few-photo/index.html` — the few-photo study (public Zip-NeRF rooms): byline (name, date, code link), result line, the camera-path planner first (coverage definition, two inline SVG charts from the per-frame coverage data, a summary table), input photos, the pose-model table and still, the generated-views clip (`preload="none"`), how it was measured, credits. Every number must match `~/Desktop/brain/reports/world-models-3d/phase2-results.md` and `phase3/*.md`. Code: `github.com/ilyaeis/few-photo-splats` (local copy `~/work/few-photo-splats`). Its media: `assets/few-photo/` (`photos.webp`, `poses.webp`, `gen.mp4` + `gen.webp` poster; 0.77 MB). Any page that shows Stable Virtual Camera output must say "Powered by Stability AI" and keep the licence notice. Never show SHARP output (Apple research-only licence). Keep the credit "Zip-NeRF (Barron et al.), CC BY 4.0".
- `js/head.js` — the head viewer (home page hero and resume, same file and assets; `.me` CSS in `style.css` and `resume.css`): three.js + Spark, drag to orbit round the head (pitch ±0.35 rad, no zoom), a slow idle turn until the first drag (none with `prefers-reduced-motion`). Transparent canvas; a soft oval CSS mask fades the shoulders, so no splat edge meets the box edge (works on dark and white). The caption hint (`.me-hint`, set by `page.js`) says "Loading 3D…", then "Drag to turn." once live, and nothing if it fails (the poster stays). Drag works only once live. The caption switch (`.me-switch`: two `<button>`s "splat" and "mesh" with `aria-pressed`, hidden until the head starts to load, hit box from padding) swaps the splat for the textured mesh of the same capture (`setMode` in `head.js`), so a visitor can compare them. The mesh gets a lit, flat-shaded Lambert material and a light on the camera, so it looks different from the splat at 200 px. The view angle stays. The hint says "Loading…" while the mesh loads; on an error it goes back to the splat. `?head=mesh` starts with the mesh (for screenshots).
- `resume.html` (+ `css/resume.css`) — the HTML resume: one column, plain text. Next to the name floats a small 3D head (`.me`, 160 px, 104 px on phones; loaded by `js/page.js`, like the home page): his head as a Gaussian splat, shown by `js/head.js`, with the same splat or mesh switch. Hidden in print, so the PDFs stay text-only with no photo. Its JSON-LD (`ProfilePage`) shares the Person `@id` with `index.html`.
- `resume.md`, `resume.json` (JSON Resume), `resume.pdf`, `resume-dark.pdf` — machine and print copies of the resume. The resume page links only the white PDF; the dark one stays in `llms.txt`.
- `llms.txt` — index for agents: the resume files, the page anchors, the apps.
- `apps/sorting/` — the sorting visualizer (C++ algorithms compiled to WebAssembly, JS drawing). Standalone; the page links it.
- `assets/room/apartment-lite.sog` (6.5 MB, 350k), `poster.jpg` (the card's poster, shot from the viewer). `assets/head/head-lite.sog` (1 MB, 78k splats; metres, head centre at the origin, +Y up, face toward +Z) and `poster.webp` (15 KB, 320 px with alpha, the front view shot from `head.js`). `assets/head/head-mesh.glb` (1.3 MB, 100k triangles, same frame as the splat; meshopt-compressed, unlit, a JPEG texture, vertex alpha fades the bottom; `head.js` sets `depthWrite = true`, as the loader turns it off for transparent materials). The 4.7 MB full head is not shipped. `assets/og-image.png`, `favicon.ico`, `favicon-32.png`, `robots.txt`, `sitemap.xml`.

## Keep the content in sync

The same facts appear in several places. When one changes, update all of them:
- `index.html` (the visible text, the meta and OG descriptions, the JSON-LD),
- `resume.html` and its JSON-LD, `resume.md`, `resume.json`, the two PDFs,
- `llms.txt` (its summary paragraph and the anchor list).

Rules:
- The windows fix says "in all Giraffe360 Gaussian splat videos since June 2026" (say splat videos, never "every tour"). No cause, mechanism or metric for it in public.
- Analytic-Splatting is "in our gsplat fork" (no upstream PR).
- Experience on the resume: 7 short bullets at most.
- "Next, I want to grow into leading a team." appears once: on the home page only.
- The pipeline speed-up is "from 2 h 30 min to 1 h 30 min, even after new steps were added" (unit to be confirmed by Ilja).
- The page gives no splat count. The resume may name the 350k lite model.
- Dates are year-only where the month is unknown. Add months in `resume.html`, its JSON-LD, `resume.md` and `resume.json`.
- Regenerate both PDFs after any `resume.html` change: serve the site, then `google-chrome --headless=new --no-pdf-header-footer --print-to-pdf=resume.pdf "http://localhost:PORT/resume.html"` and `google-chrome --headless=new --no-pdf-header-footer --print-to-pdf=resume-dark.pdf "http://localhost:PORT/resume.html?print=dark"`. Each must stay 2 pages at most (`pdfinfo`). If the Chrome CLI hangs, print with puppeteer (`waitUntil: 'load'`, `printBackground`, `preferCSSPageSize`), as in the harness folder's `rf-pdf.mjs`. Ctrl+P keeps the white print style.

## Loading rules (the page must stay light)

- First paint needs only `index.html`, `css/style.css` and the font (the head poster loads beside them at low priority). No three.js and no splat bytes before they are near.
- Instagram: no embed (Ilja's choice). The windows item and the drone item link the posts as plain text links.
- The flat card: the poster shows at once (`loading="lazy"`). An IntersectionObserver (`rootMargin: 600px`) imports `js/flat.js` only when the card is near. `flat.js` fetches `apartment-lite.sog`; the poster stays until it is in (no blurry preview). The lite splat on every device; never the old 730k model. Rendering stops when the stage is offscreen.
- The head (home page and resume): the poster shows at once (`fetchpriority="low"`). After `load`, at idle (`requestIdleCallback` with a 1.5 s timeout; 100 ms `setTimeout` where it is missing), an IntersectionObserver imports `js/head.js`, which loads `head-lite.sog` on every device. The canvas replaces the poster after a few frames. `head-mesh.glb`, `GLTFLoader` and the meshopt decoder (from `three/addons/`) load only when the visitor first presses "mesh". `resume.html` has its own import map (same CDN URLs as `index.html`). CSS and `page.js` links, and the `head.js` import in `page.js`, carry `?v=N`: bump it when they change, or browsers run a cached copy (that is how the head once stayed a static poster). `touch-action: pan-y` on the stage.
- Viewer: camera at room units `(0, -0.11, 0.25)`, looking at `(0, -0.22, -0.78)`, FOV 54. Yaw ±1.3 rad, pitch down 0.5, pitch up only 0.12 (the splat ceiling is cut; a free look up shows black smears). Critically damped follow (`DAMP`). Arrow keys work when the stage has focus. `touch-action: pan-y` on the stage: a horizontal drag looks round, a vertical touch still scrolls the page. The "Drag to look around" pill goes on the first drag. `recolor` 0.9; Spark `minAlpha 1/255`, `maxStdDev 3`.
- Paths in `flat.js` are relative to the page (`assets/room/...`). The page lives at the site root.

## Commands

```bash
# Serve locally (any static server works; ES modules need http://, not file://)
python3 -m http.server 8000
# then open http://localhost:8000/
```

- Deployed by pushing to `main` (GitHub Pages).
- No lint/test/build tooling.

## Verify

Use the design harness (`~/Desktop/brain/reports/portfolio-site/design/harness/`, Node 22; its `README.md` has the details). It serves the folder, shoots desktop, laptop and phone, and builds a contact sheet:

```bash
cd ~/Desktop/brain/reports/portfolio-site/design/harness
node shoot.mjs <repo or worktree> --page index.html --label NAME --metrics --a11y --wait 20
node shoot.mjs --compare out/OLD out/NAME      # A left, B right
```

- Read `out/NAME/small/sheet-small.jpg` first, then single files in `small/`.
- Expect: 0 console errors, 0 failed requests, axe 0 violations, 0 touch targets under 44 px, 0 text under 12 px, and no splat bytes in `metrics.json` (the card is below the first screen).
- Shoot `resume.html` and `apps/sorting/` too after a change that touches them.
- Check links: collect the `href`/`src` values of `index.html`, `resume.html` and `llms.txt`, and `curl` them on the local server (LinkedIn answers 999 to bots; that is fine).
- Test the drag on a real phone after viewer changes (pointer capture plus `touch-action: pan-y`).

## Conventions

- Plain HTML, CSS and ES modules. No build step, no framework.
- Text: short lines, one idea per line. The detail lives in the resume PDF, not on the page.
- Voice: plain, his own. No slogans, no "I find X, and I ship Y" lines, no em-dashes, no numbered proofs, no middle-dot separators, no uppercase tracked labels. Lists may be uneven.
- Touch targets at least 44 px. Inline links that are not buttons get the hit box from padding with a negative margin, so the text rhythm does not change.
- Old `?go=` deep links have no redirects; they land on the page top.
