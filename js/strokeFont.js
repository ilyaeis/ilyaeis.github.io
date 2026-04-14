// ── Single-Stroke Font ─────────────────────────────────────────────
// Continuous polyline glyphs for text traced by the trail line.
// Each glyph: { width, path: [[x,y], ...] }  — one unbroken stroke.
// Coordinates: x in [0, width], y in [0, 1] (baseline → cap height).

const GLYPHS = {
    'A': {
        width: 0.65,
        path: [
            [0.0, 0.0], [0.325, 1.0], [0.65, 0.0],
            [0.51, 0.38], [0.14, 0.38]
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
            [0.5, 1.0], [0.0, 1.0], [0.0, 0.5],
            [0.38, 0.5], [0.0, 0.5],
            [0.0, 0.0], [0.5, 0.0]
        ]
    },
    'I': {
        width: 0.05,
        path: [[0.025, 1.0], [0.025, 0.0]]
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
            [0.0, 0.0], [0.0, 1.0],
            [0.35, 1.0], [0.5, 0.93], [0.55, 0.82],
            [0.55, 0.7], [0.5, 0.6], [0.35, 0.53], [0.0, 0.53]
        ]
    },
    'R': {
        width: 0.6,
        path: [
            [0.0, 0.0], [0.0, 1.0],
            [0.35, 1.0], [0.5, 0.97], [0.58, 0.9], [0.6, 0.8],
            [0.58, 0.7], [0.5, 0.6], [0.35, 0.55], [0.0, 0.55],
            [0.6, 0.0]
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
            [0.0, 1.0], [0.6, 1.0], [0.3, 1.0], [0.3, 0.0]
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
    '.': {
        width: 0.1,
        path: [
            [0.05, 0.12], [0.03, 0.06], [0.05, 0.0],
            [0.07, 0.06], [0.05, 0.12]
        ]
    }
};

const LETTER_SPACING = 0.12;
const LINE_SPACING = 1.5;

/**
 * Generate points for a single line of text (not centered).
 * @returns {{ points: {x:number,y:number}[], width: number }}
 */
function generateSingleLine(text, density) {
    let cursor = 0;
    const points = [];

    for (let ci = 0; ci < text.length; ci++) {
        const glyph = GLYPHS[text[ci]];
        if (!glyph) { cursor += 0.3; continue; }

        const { path, width } = glyph;

        for (let i = 0; i < path.length - 1; i++) {
            const [x0, y0] = path[i];
            const [x1, y1] = path[i + 1];
            const dx = x1 - x0, dy = y1 - y0;
            const segLen = Math.sqrt(dx * dx + dy * dy);
            const nPts = Math.max(2, Math.round(segLen * density));

            const start = (i === 0) ? 0 : 1;
            for (let j = start; j < nPts; j++) {
                const t = j / (nPts - 1);
                points.push({
                    x: cursor + x0 + dx * t,
                    y: y0 + dy * t
                });
            }
        }

        cursor += width + LETTER_SPACING;
    }

    return { points, width: cursor - (points.length > 0 ? LETTER_SPACING : 0) };
}

/**
 * Generate a dense sequence of 2D points tracing multiple lines of text,
 * each line centered horizontally, connected by smooth return curves.
 *
 * @param {string[]} lines    Array of uppercase text strings (one per line)
 * @param {number}   density  Interpolated points per unit length
 * @returns {{ points: {x:number,y:number}[], width: number }}
 */
export function generateTextLines(lines, density = 180) {
    const lineData = lines.map(text => generateSingleLine(text, density));
    const maxWidth = Math.max(...lineData.map(d => d.width));

    const allPoints = [];

    for (let li = 0; li < lines.length; li++) {
        const { points, width } = lineData[li];
        const yOff = -li * LINE_SPACING;
        const xOff = -width / 2;   // center each line independently

        // Add text points
        for (const p of points) {
            allPoints.push({ x: p.x + xOff, y: p.y + yOff });
        }

        // Smooth return curve to next line
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
            const nPts = Math.max(30, Math.round(dist * density * 0.4));

            for (let j = 1; j <= nPts; j++) {
                const t = j / nPts;
                const u = 1 - t;
                allPoints.push({
                    x: u*u*u*fx + 3*u*u*t*p1x + 3*u*t*t*p2x + t*t*t*tx,
                    y: u*u*u*fy + 3*u*u*t*p1y + 3*u*t*t*p2y + t*t*t*ty
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
