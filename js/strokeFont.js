// ── Single-Stroke Font ─────────────────────────────────────────────
// Continuous polyline glyphs for text traced by the trail line.
// Each glyph: { width, path: [[x,y], [x,y,1], ...] }
// Coordinates: x in [0, width], y in [0, 1] (baseline → cap height).
//
// A third element of 1 marks a "travel" move: the segment leading INTO
// that point is drawn faint (intensity flag c=0) instead of full. This
// lets glyphs like E/H/T retrace or hop without doubling brightness,
// since the trail renders with additive blending + bloom.
//
// Every generated point is { x, y, c } where c=1 is a letter stroke
// and c=0 is a faint travel/connector stroke.

const GLYPHS = {
    'A': {
        width: 0.65,
        path: [
            [0.0, 0.0], [0.325, 1.0], [0.65, 0.0],
            [0.5265, 0.38, 1], [0.1235, 0.38]
        ]
    },
    'B': {
        width: 0.55,
        path: [
            [0.0, 0.0], [0.0, 1.0],
            [0.35, 1.0], [0.5, 0.95], [0.55, 0.84],
            [0.55, 0.71], [0.5, 0.62], [0.35, 0.55], [0.0, 0.55],
            [0.35, 0.55, 1], [0.52, 0.48], [0.55, 0.34],
            [0.55, 0.16], [0.5, 0.05], [0.35, 0.0], [0.0, 0.0]
        ]
    },
    'C': {
        width: 0.6,
        path: [
            [0.6, 0.8], [0.55, 0.92], [0.45, 0.98], [0.3, 1.0],
            [0.15, 0.97], [0.05, 0.85], [0.0, 0.7], [0.0, 0.3],
            [0.05, 0.15], [0.15, 0.03], [0.3, 0.0], [0.45, 0.02],
            [0.55, 0.08], [0.6, 0.2]
        ]
    },
    'D': {
        width: 0.6,
        path: [
            [0.0, 0.0], [0.0, 1.0], [0.3, 1.0],
            [0.5, 0.92], [0.58, 0.8], [0.6, 0.65],
            [0.6, 0.35], [0.58, 0.2], [0.5, 0.08],
            [0.3, 0.0], [0.0, 0.0]
        ]
    },
    'E': {
        width: 0.5,
        path: [
            [0.5, 1.0], [0.0, 1.0], [0.0, 0.5], [0.38, 0.5],
            [0.0, 0.5, 1], [0.0, 0.0], [0.5, 0.0]
        ]
    },
    'F': {
        width: 0.5,
        path: [
            [0.5, 1.0], [0.0, 1.0], [0.0, 0.5], [0.38, 0.5],
            [0.0, 0.5, 1], [0.0, 0.0]
        ]
    },
    'G': {
        width: 0.62,
        path: [
            [0.6, 0.8], [0.55, 0.92], [0.45, 0.98], [0.3, 1.0],
            [0.15, 0.97], [0.05, 0.85], [0.0, 0.7], [0.0, 0.3],
            [0.05, 0.15], [0.15, 0.03], [0.3, 0.0], [0.45, 0.02],
            [0.55, 0.08], [0.6, 0.2], [0.6, 0.5], [0.35, 0.5]
        ]
    },
    'H': {
        width: 0.6,
        path: [
            [0.0, 1.0], [0.0, 0.0],
            [0.0, 0.5, 1], [0.6, 0.5], [0.6, 1.0],
            [0.6, 0.5, 1], [0.6, 0.0]
        ]
    },
    'I': {
        width: 0.05,
        path: [[0.025, 1.0], [0.025, 0.0]]
    },
    'J': {
        width: 0.52,
        path: [
            [0.5, 1.0], [0.5, 0.22], [0.45, 0.09], [0.34, 0.01],
            [0.2, 0.0], [0.09, 0.05], [0.02, 0.15]
        ]
    },
    'K': {
        width: 0.55,
        path: [
            [0.0, 1.0], [0.0, 0.0],
            [0.0, 0.45, 1], [0.55, 1.0],
            [0.0, 0.45, 1], [0.55, 0.0]
        ]
    },
    'L': {
        width: 0.5,
        path: [[0.0, 1.0], [0.0, 0.0], [0.5, 0.0]]
    },
    'M': {
        width: 0.7,
        path: [[0.0, 0.0], [0.0, 1.0], [0.35, 0.4], [0.7, 1.0], [0.7, 0.0]]
    },
    'N': {
        width: 0.6,
        path: [[0.0, 0.0], [0.0, 1.0], [0.6, 0.0], [0.6, 1.0]]
    },
    'O': {
        width: 0.6,
        path: [
            [0.6, 0.5], [0.58, 0.7], [0.5, 0.88], [0.35, 0.97], [0.3, 1.0],
            [0.1, 0.92], [0.02, 0.72], [0.0, 0.5],
            [0.02, 0.28], [0.1, 0.08], [0.3, 0.0],
            [0.5, 0.08], [0.58, 0.28], [0.6, 0.5]
        ]
    },
    'P': {
        width: 0.55,
        path: [
            [0.0, 0.53], [0.35, 0.53], [0.5, 0.6], [0.55, 0.7],
            [0.55, 0.82], [0.5, 0.93], [0.35, 1.0], [0.0, 1.0],
            [0.0, 0.0]
        ]
    },
    'Q': {
        width: 0.66,
        path: [
            [0.6, 0.5], [0.58, 0.7], [0.5, 0.88], [0.3, 1.0],
            [0.1, 0.92], [0.02, 0.72], [0.0, 0.5],
            [0.02, 0.28], [0.1, 0.08], [0.3, 0.0],
            [0.5, 0.08], [0.58, 0.28], [0.6, 0.5],
            [0.42, 0.16, 1], [0.66, -0.08]
        ]
    },
    'R': {
        width: 0.6,
        path: [
            [0.0, 0.0], [0.0, 1.0],
            [0.35, 1.0], [0.5, 0.97], [0.58, 0.9], [0.6, 0.8],
            [0.58, 0.7], [0.5, 0.6], [0.35, 0.55], [0.0, 0.55],
            [0.35, 0.55, 1], [0.6, 0.0]
        ]
    },
    'S': {
        width: 0.55,
        path: [
            [0.5, 0.85], [0.45, 0.95], [0.3, 1.0], [0.15, 0.95],
            [0.05, 0.85], [0.05, 0.72], [0.1, 0.62], [0.25, 0.55],
            [0.4, 0.45], [0.5, 0.35], [0.5, 0.2],
            [0.45, 0.08], [0.3, 0.0], [0.15, 0.05], [0.05, 0.15]
        ]
    },
    'T': {
        width: 0.6,
        path: [
            [0.0, 1.0], [0.6, 1.0],
            [0.3, 1.0, 1], [0.3, 0.0]
        ]
    },
    'U': {
        width: 0.6,
        path: [
            [0.0, 1.0], [0.0, 0.25],
            [0.03, 0.12], [0.1, 0.03], [0.2, 0.0], [0.4, 0.0],
            [0.5, 0.03], [0.57, 0.12], [0.6, 0.25],
            [0.6, 1.0]
        ]
    },
    'V': {
        width: 0.65,
        path: [[0.0, 1.0], [0.325, 0.0], [0.65, 1.0]]
    },
    'W': {
        width: 0.9,
        path: [[0.0, 1.0], [0.22, 0.0], [0.45, 0.55], [0.68, 0.0], [0.9, 1.0]]
    },
    'X': {
        width: 0.6,
        path: [
            [0.0, 1.0], [0.6, 0.0],
            [0.6, 1.0, 1], [0.0, 0.0]
        ]
    },
    'Y': {
        width: 0.6,
        path: [
            [0.0, 1.0], [0.3, 0.5], [0.6, 1.0],
            [0.3, 0.5, 1], [0.3, 0.0]
        ]
    },
    'Z': {
        width: 0.55,
        path: [[0.0, 1.0], [0.55, 1.0], [0.0, 0.0], [0.55, 0.0]]
    },
    '0': {
        width: 0.6,
        path: [
            [0.6, 0.5], [0.58, 0.7], [0.5, 0.88], [0.35, 0.97], [0.3, 1.0],
            [0.1, 0.92], [0.02, 0.72], [0.0, 0.5],
            [0.02, 0.28], [0.1, 0.08], [0.3, 0.0],
            [0.5, 0.08], [0.58, 0.28], [0.6, 0.5]
        ]
    },
    '1': {
        width: 0.36,
        path: [[0.08, 0.78], [0.28, 1.0], [0.28, 0.0]]
    },
    '2': {
        width: 0.5,
        path: [
            [0.02, 0.84], [0.12, 0.96], [0.27, 1.0], [0.4, 0.94],
            [0.46, 0.8], [0.43, 0.62], [0.3, 0.45], [0.12, 0.25],
            [0.0, 0.0], [0.5, 0.0]
        ]
    },
    '3': {
        width: 0.45,
        path: [
            [0.05, 0.85], [0.15, 0.95], [0.3, 1.0],
            [0.4, 0.92], [0.45, 0.78], [0.4, 0.6],
            [0.25, 0.52], [0.4, 0.44],
            [0.45, 0.28], [0.4, 0.1],
            [0.3, 0.0], [0.15, 0.05], [0.05, 0.15]
        ]
    },
    '4': {
        width: 0.52,
        path: [[0.42, 0.0], [0.42, 1.0], [0.0, 0.3], [0.52, 0.3]]
    },
    '5': {
        width: 0.5,
        path: [
            [0.45, 1.0], [0.05, 1.0], [0.03, 0.58], [0.15, 0.64],
            [0.3, 0.62], [0.42, 0.53], [0.48, 0.38], [0.46, 0.2],
            [0.36, 0.06], [0.2, 0.0], [0.07, 0.04], [0.0, 0.15]
        ]
    },
    '6': {
        width: 0.5,
        path: [
            [0.45, 0.9], [0.35, 0.97], [0.2, 1.0],
            [0.08, 0.92], [0.0, 0.75], [0.0, 0.35],
            [0.05, 0.15], [0.15, 0.03], [0.3, 0.0],
            [0.45, 0.08], [0.5, 0.22], [0.48, 0.38],
            [0.38, 0.48], [0.25, 0.5], [0.1, 0.45], [0.0, 0.35]
        ]
    },
    '7': {
        width: 0.55,
        path: [[0.0, 1.0], [0.55, 1.0], [0.18, 0.0]]
    },
    '8': {
        width: 0.58,
        path: [
            [0.3, 0.5], [0.13, 0.62], [0.07, 0.76], [0.13, 0.9],
            [0.3, 1.0], [0.47, 0.9], [0.53, 0.76], [0.47, 0.62],
            [0.3, 0.5], [0.13, 0.38], [0.06, 0.24], [0.13, 0.08],
            [0.3, 0.0], [0.47, 0.08], [0.54, 0.24], [0.47, 0.38],
            [0.3, 0.5]
        ]
    },
    '9': {
        width: 0.52,
        path: [
            [0.5, 0.62], [0.42, 0.52], [0.28, 0.48], [0.13, 0.53],
            [0.03, 0.65], [0.0, 0.78], [0.06, 0.91], [0.18, 0.99],
            [0.32, 1.0], [0.44, 0.93], [0.5, 0.8], [0.5, 0.62],
            [0.5, 0.3], [0.45, 0.12], [0.33, 0.02], [0.18, 0.0]
        ]
    },
    '.': {
        width: 0.1,
        path: [
            [0.05, 0.12], [0.03, 0.06], [0.05, 0.0],
            [0.07, 0.06], [0.05, 0.12]
        ]
    },
    ',': {
        width: 0.14,
        path: [[0.08, 0.1], [0.06, 0.02], [0.0, -0.1]]
    },
    '-': {
        width: 0.32,
        path: [[0.0, 0.4], [0.32, 0.4]]
    }
};

const LETTER_SPACING = 0.12;
const LINE_SPACING = 1.5;
const SPACE_WIDTH = 0.3;

// Smoothing — gentle corners get rounded, sharp corners stay crisp
const SHARP_TURN = Math.PI * 50 / 180; // turns above ~50° are kept sharp
const FILLET = 0.06;                   // max corner-rounding radius
const SMOOTH_ITERATIONS = 2;

// Travel strokes (between letters / pen hops) — fewer points, the pen
// "skips" quickly over them and they render faint (c=0).
const TRAVEL_DENSITY = 0.35;           // fraction of full density
const CONNECTOR_SAG = 0.15;            // how far connectors dip below endpoints

// ── Corner-aware smoothing (clamped Chaikin corner cutting) ────────
// Rounds gentle polyline corners (curves like O, C, S) while leaving
// sharp corners (A apex, E corners, V bottom) untouched.
function smoothSubpath(pts) {
    if (pts.length < 3) return pts;

    let path = pts.map((p, i) => {
        let sharp = (i === 0 || i === pts.length - 1);
        if (!sharp) {
            const ax = p.x - pts[i - 1].x, ay = p.y - pts[i - 1].y;
            const bx = pts[i + 1].x - p.x, by = pts[i + 1].y - p.y;
            const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
            if (la > 1e-9 && lb > 1e-9) {
                const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
                sharp = Math.acos(dot) > SHARP_TURN;
            }
        }
        return { x: p.x, y: p.y, sharp };
    });

    for (let it = 0; it < SMOOTH_ITERATIONS; it++) {
        const out = [path[0]];
        for (let i = 1; i < path.length - 1; i++) {
            const v = path[i];
            if (v.sharp) { out.push(v); continue; }
            const a = path[i - 1], b = path[i + 1];
            const da = Math.hypot(v.x - a.x, v.y - a.y);
            const db = Math.hypot(b.x - v.x, b.y - v.y);
            // Cut at most FILLET away from the vertex (clamped Chaikin)
            const ta = Math.min(0.25, FILLET / Math.max(da, 1e-9));
            const tb = Math.min(0.25, FILLET / Math.max(db, 1e-9));
            out.push({ x: v.x + (a.x - v.x) * ta, y: v.y + (a.y - v.y) * ta, sharp: false });
            out.push({ x: v.x + (b.x - v.x) * tb, y: v.y + (b.y - v.y) * tb, sharp: false });
        }
        out.push(path[path.length - 1]);
        path = out;
    }
    return path;
}

// ── Point emitters ─────────────────────────────────────────────────

// Dense interpolation of a stroke subpath (c=1)
function emitStroke(points, sp, xOff, density, includeFirst) {
    for (let i = 0; i < sp.length - 1; i++) {
        const x0 = sp[i].x, y0 = sp[i].y;
        const dx = sp[i + 1].x - x0, dy = sp[i + 1].y - y0;
        const segLen = Math.hypot(dx, dy);
        const nPts = Math.max(2, Math.round(segLen * density));
        const start = (i === 0 && includeFirst) ? 0 : 1;
        for (let j = start; j < nPts; j++) {
            const t = j / (nPts - 1);
            points.push({ x: xOff + x0 + dx * t, y: y0 + dy * t, c: 1 });
        }
    }
}

// Straight faint travel line (intra-glyph pen hop, c=0)
function emitTravel(points, x0, y0, x1, y1, density) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(3, Math.round(dist * density * TRAVEL_DENSITY));
    for (let j = 1; j <= n; j++) {
        const t = j / n;
        points.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, c: 0 });
    }
}

// Curved faint connector between strokes — sags below the endpoints
// like a handwriting ligature (c=0). Long transitions (rock → label)
// override the sag depth and use a sparser density.
function emitConnector(points, x0, y0, x1, y1, density,
    { sag = CONNECTOR_SAG, densityFactor = TRAVEL_DENSITY, minPts = 6 } = {}) {
    const cx = (x0 + x1) / 2;
    const cy = Math.min(y0, y1) - sag;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(minPts, Math.round(dist * density * densityFactor));
    for (let j = 1; j <= n; j++) {
        const t = j / n, u = 1 - t;
        points.push({
            x: u * u * x0 + 2 * u * t * cx + t * t * x1,
            y: u * u * y0 + 2 * u * t * cy + t * t * y1,
            c: 0
        });
    }
}

/**
 * Generate points for a single line of text (not centered).
 * Letters are joined by faint curved connectors; intra-glyph pen hops
 * are faint straight lines. Lowercase input is uppercased.
 * @returns {{ points: {x:number,y:number,c:number}[], width: number }}
 */
function generateSingleLine(text, density = 500) {
    text = String(text).toUpperCase();
    let cursor = 0;
    const points = [];
    let lastGlyphEnd = null;
    let emittedGlyph = false;

    for (const ch of text) {
        const glyph = GLYPHS[ch];
        if (!glyph) { cursor += SPACE_WIDTH; continue; }

        // Split path into stroke subpaths at travel markers ([x,y,1])
        const subpaths = [];
        let cur = [];
        for (const entry of glyph.path) {
            if (entry[2] && cur.length) { subpaths.push(cur); cur = []; }
            cur.push({ x: entry[0], y: entry[1] });
        }
        if (cur.length) subpaths.push(cur);

        // Faint connector from the previous letter's exit to this entry
        const entryPt = subpaths[0][0];
        if (lastGlyphEnd) {
            emitConnector(points, lastGlyphEnd.x, lastGlyphEnd.y,
                cursor + entryPt.x, entryPt.y, density);
        }

        for (let si = 0; si < subpaths.length; si++) {
            const sp = smoothSubpath(subpaths[si]);
            if (si > 0) {
                const prev = points[points.length - 1];
                emitTravel(points, prev.x, prev.y,
                    cursor + sp[0].x, sp[0].y, density);
            }
            const includeFirst = !lastGlyphEnd && si === 0;
            emitStroke(points, sp, cursor, density, includeFirst);
        }

        lastGlyphEnd = points[points.length - 1];
        cursor += glyph.width + LETTER_SPACING;
        emittedGlyph = true;
    }

    return { points, width: cursor - (emittedGlyph ? LETTER_SPACING : 0) };
}

/**
 * Generate a dense sequence of 2D points tracing multiple lines of text,
 * each line centered horizontally, connected by smooth return curves.
 *
 * @param {string[]} lines    Array of text strings (one per line)
 * @param {number}   density  Interpolated points per unit length
 * @returns {{ points: {x:number,y:number,c:number}[], width: number }}
 */
export function generateTextLines(lines, density = 500) {
    const lineData = lines.map(text => generateSingleLine(text, density));
    const maxWidth = Math.max(...lineData.map(d => d.width));

    const allPoints = [];

    for (let li = 0; li < lines.length; li++) {
        const { points, width } = lineData[li];
        const yOff = -li * LINE_SPACING;
        const xOff = -width / 2;   // center each line independently

        // Add text points
        for (const p of points) {
            allPoints.push({ x: p.x + xOff, y: p.y + yOff, c: p.c });
        }

        // Smooth faint return curve to next line
        if (li < lines.length - 1) {
            const nextLine = lineData[li + 1];
            const nextXOff = -nextLine.width / 2;

            const last = points[points.length - 1];
            const first = nextLine.points[0];

            const fx = last.x + xOff,     fy = last.y + yOff;
            const tx = first.x + nextXOff, ty = first.y + yOff - LINE_SPACING;

            // Bezier: drop below current line, sweep left, arrive at next start
            const drop = LINE_SPACING * 0.4;
            const p1x = fx, p1y = fy - drop;
            const p2x = tx, p2y = ty - drop * 0.5;

            const dist = Math.sqrt((tx - fx) ** 2 + (ty - fy) ** 2);
            const nPts = Math.max(15, Math.round(dist * density * 0.1));

            for (let j = 1; j <= nPts; j++) {
                const t = j / nPts;
                const u = 1 - t;
                allPoints.push({
                    x: u*u*u*fx + 3*u*u*t*p1x + 3*u*t*t*p2x + t*t*t*tx,
                    y: u*u*u*fy + 3*u*u*t*p1y + 3*u*t*t*p2y + t*t*t*ty,
                    c: 0
                });
            }
        }
    }

    // Center everything vertically
    const topY = 1.0;
    const bottomY = -(lines.length - 1) * LINE_SPACING;
    const centerY = (topY + bottomY) / 2;

    for (const p of allPoints) {
        p.y -= centerY;
    }

    return { points: allPoints, width: maxWidth };
}

/**
 * Generate 2D points for an asteroid-shaped rock outline plus label text below.
 * The outline starts from center (0,0) with a short faint approach line to the
 * first vertex. Grey preview rocks use points[0..outlineCount-1].
 *
 * @param {number} sizeFactor  Relative rock radius (1.0 = large)
 * @param {number} seed        Deterministic seed for shape variation
 * @param {string} label       Main label text
 * @param {string|null} sublabel  Secondary label, or null
 * @param {number} density     Points per unit length
 * @returns {{ points: {x:number,y:number,c:number}[], outlineCount: number }}
 */
export function generateRockWithLabel(sizeFactor, seed, label, sublabel, density = 500) {
    const allPoints = [];

    // Seeded pseudo-random (deterministic per seed+index)
    function srand(i) {
        const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
        return x - Math.floor(x);
    }

    // ── Asteroid outline vertices ──────────────────────────────────
    const nVerts = 8 + Math.floor(srand(0) * 5); // 8-12 vertices
    const outline = [];
    for (let i = 0; i < nVerts; i++) {
        const angle = (i / nVerts) * Math.PI * 2;
        const r = sizeFactor * (0.65 + srand(i + 100) * 0.65);
        outline.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    outline.push({ x: outline[0].x, y: outline[0].y }); // close

    // Faint approach line: center (0,0) → first vertex
    const first = outline[0];
    const approachDist = Math.sqrt(first.x * first.x + first.y * first.y);
    const approachN = Math.max(3, Math.round(approachDist * density * 0.3));
    for (let j = 1; j <= approachN; j++) {
        const t = j / approachN;
        allPoints.push({ x: first.x * t, y: first.y * t, c: 0 });
    }

    // Dense interpolation of outline edges
    for (let i = 0; i < outline.length - 1; i++) {
        const dx = outline[i + 1].x - outline[i].x;
        const dy = outline[i + 1].y - outline[i].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const n = Math.max(2, Math.round(len * density));
        for (let j = (i === 0 ? 0 : 1); j < n; j++) {
            const t = j / (n - 1);
            allPoints.push({
                x: outline[i].x + dx * t,
                y: outline[i].y + dy * t,
                c: 1
            });
        }
    }

    const outlineCount = allPoints.length;

    // ── Label text below rock ──────────────────────────────────────
    const labelScale = Math.max(0.35, sizeFactor * 0.45);
    const { points: labelPts, width: labelW } = generateSingleLine(label, density);

    const labelX = -labelW * labelScale / 2; // centered
    const labelY = -sizeFactor * 1.2 - 0.2;  // below rock

    // Faint transition curve: outline end → label start
    const last = allPoints[allPoints.length - 1];
    const firstLX = labelPts.length > 0 ? labelPts[0].x * labelScale + labelX : 0;
    const firstLY = labelPts.length > 0 ? labelPts[0].y * labelScale + labelY : labelY;

    emitConnector(allPoints, last.x, last.y, firstLX, firstLY, density,
        { sag: 0.15 * sizeFactor, densityFactor: 0.08, minPts: 5 });

    for (const p of labelPts) {
        allPoints.push({ x: p.x * labelScale + labelX, y: p.y * labelScale + labelY, c: p.c });
    }

    // ── Sublabel (e.g. city) ───────────────────────────────────────
    if (sublabel) {
        const subScale = labelScale * 0.85;
        const { points: subPts, width: subW } = generateSingleLine(sublabel, density);

        const subX = -subW * subScale / 2;
        const subY = labelY - 0.8 * labelScale;

        const prev = allPoints[allPoints.length - 1];
        const fsx = subPts.length > 0 ? subPts[0].x * subScale + subX : 0;
        const fsy = subPts.length > 0 ? subPts[0].y * subScale + subY : subY;

        emitConnector(allPoints, prev.x, prev.y, fsx, fsy, density,
            { sag: 0.1, densityFactor: 0.08, minPts: 4 });

        for (const p of subPts) {
            allPoints.push({ x: p.x * subScale + subX, y: p.y * subScale + subY, c: p.c });
        }
    }

    return { points: allPoints, outlineCount };
}
