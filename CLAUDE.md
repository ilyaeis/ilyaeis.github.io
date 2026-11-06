# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal portfolio site (GitHub Pages, `ilyaeis.github.io`). The home page is one column of plain text that sells Ilja as an R&D engineer in 3D Gaussian splatting. Order: the 3D head (floats right of the hero: a live Gaussian splat of his head, 220 px, 120 px on phones, caption "Me, as a Gaussian splat. Drag to turn."), name and role line, the claim (h1), Resume (PDF) and Email, Work (four items: three results and the mentoring/leading line), the flat card (a live Gaussian splat of a flat he trained), Tools, five side projects, Contact, a credits line. Dark theme only. No framework, no build step, no tests. three.js (0.180.0) and Spark (`@sparkjsdev/spark` 2.4.0, the splat renderer) load from a CDN through the import map in `index.html`, only after `load` (for the head) or when the flat card is near.

The design came from `~/Desktop/brain/reports/portfolio-site/design/` (`notes.md`: design rules and decisions; `proto/`: the approved prototype).

## Files

- `index.html` — the page. All text is in the HTML. `<head>`: meta, OG/twitter tags (`og-image.png?v=4`), canonical, favicon, JSON-LD `Person` (`@id` `https://ilyaeis.github.io/#me`, shared with `resume.html`), the import map. Section ids: `#work`, `#flat`, `#tools`, `#projects`, `#contact` (`llms.txt` links them).
- `css/style.css` — the page style. Colour tokens on `:root` (`--bg #121110`, `--fg`, `--fg-2`, `--line`, `--bg-2`, `--accent #f2b85a` amber, from the lamps of the splat). One font: Inter from Google Fonts.
- `js/page.js` — the only script the page loads. It loads `js/head.js` (after load, at idle, in view), inserts the Instagram embed and loads `js/flat.js` when each comes near the view. The flat waits until the head splat is in, so only one splat loads at a time.
- `js/flat.js` — the flat viewer: three.js + Spark, drag to look round from a fixed spot by the sofa.
- `js/head.js` — the head viewer (home page hero and resume, same file and assets; `.me` CSS in `style.css` and `resume.css`): three.js + Spark, drag to orbit round the head (pitch ±0.35 rad, no zoom), a slow idle turn until the first drag (none with `prefers-reduced-motion`). Transparent canvas on a dark tile (`#121110` in both themes: the shirt's thin edge splats need a dark ground).
- `resume.html` (+ `css/resume.css`) — the HTML resume: one column, plain text. Next to the name floats a small 3D head (`.me`, 160 px, 104 px on phones): his head as a Gaussian splat, shown by `js/head.js`. Hidden in print, so the PDFs stay text-only with no photo. Its JSON-LD (`ProfilePage`) shares the Person `@id` with `index.html`.
- `resume.md`, `resume.json` (JSON Resume), `resume.pdf`, `resume-dark.pdf` — machine and print copies of the resume.
- `llms.txt` — index for agents: the resume files, the page anchors, the apps.
- `apps/sorting/` — the sorting visualizer (C++ algorithms compiled to WebAssembly, JS drawing). Standalone; the page links it.
- `assets/room/apartment-preview.sog` (1.1 MB, 80k splats), `apartment-lite.sog` (6.5 MB, 350k), `poster.jpg` (the card's poster, shot from the viewer). `assets/head/head-lite.sog` (1 MB, 78k splats; metres, head centre at the origin, +Y up, face toward +Z) and `poster.webp` (15 KB, 320 px with alpha, the front view shot from `head.js`). The 4.7 MB full head is not shipped. `assets/og-image.png`, `favicon.ico`, `favicon-32.png`, `robots.txt`, `sitemap.xml`.

## Keep the content in sync

The same facts appear in several places. When one changes, update all of them:
- `index.html` (the visible text, the meta and OG descriptions, the JSON-LD),
- `resume.html` and its JSON-LD, `resume.md`, `resume.json`, the two PDFs,
- `llms.txt` (its summary paragraph and the anchor list).

Rules:
- The windows fix says "in all Giraffe360 Gaussian splat videos since June 2026" (say splat videos, never "every tour").
- The page gives no splat count. The resume may name the 350k lite model.
- Dates are year-only where the month is unknown. Add months in `resume.html`, its JSON-LD, `resume.md` and `resume.json`.
- Regenerate both PDFs after any `resume.html` change: serve the site, then `google-chrome --headless=new --no-pdf-header-footer --print-to-pdf=resume.pdf "http://localhost:PORT/resume.html"` and `google-chrome --headless=new --no-pdf-header-footer --print-to-pdf=resume-dark.pdf "http://localhost:PORT/resume.html?print=dark"`. Each must stay 2 pages at most (`pdfinfo`). Ctrl+P keeps the white print style.

## Loading rules (the page must stay light)

- First paint needs only `index.html`, `css/style.css` and the font (the head poster loads beside them at low priority). No three.js, no splat bytes, no Instagram bytes before they are near.
- Instagram: `page.js` inserts the plain `/embed/` iframe of the before/after post when its box is within 600 px of the view, after `load`. The placeholder `.embed-box` has the final size from the start (height = 1.25 × width + 210 px), then the height that the iframe reports (`MEASURE` postMessage). Only `https://www.instagram.com/` sources, and the message must come from that origin and that iframe. The reel stays a text link (its embed does not play inline).
- The flat card: the poster shows at once (`loading="lazy"`). An IntersectionObserver (`rootMargin: 600px`) imports `js/flat.js` only when the card is near. `flat.js` fetches `apartment-preview.sog`, shows it, then `apartment-lite.sog` replaces it. The lite splat on every device; never the old 730k model. Rendering stops when the stage is offscreen.
- The head (home page and resume): the poster shows at once (`fetchpriority="low"`). After `load`, at idle, an IntersectionObserver imports `js/head.js`, which loads `head-lite.sog` on every device. The canvas replaces the poster after a few frames. `resume.html` has its own import map (same CDN URLs as `index.html`). `touch-action: pan-y` on the stage.
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
