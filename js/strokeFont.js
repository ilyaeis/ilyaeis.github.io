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
    'B': {
        width: 0.55,
        path: [
            [0.0, 0.0], [0.0, 1.0],
            [0.35, 1.0], [0.5, 0.95], [0.55, 0.85],
            [0.55, 0.7], [0.5, 0.6], [0.35, 0.55], [0.0, 0.55],
            [0.35, 0.55], [0.52, 0.48], [0.55, 0.35],
            [0.55, 0.15], [0.5, 0.05], [0.35, 0.0], [0.0, 0.0]
        ]
    },
    'F': {
        width: 0.5,
        path: [
            [0.5, 1.0], [0.0, 1.0], [0.0, 0.5],
            [0.38, 0.5], [0.0, 0.5],
            [0.0, 0.0]
        ]
    },
    'G': {
        width: 0.65,
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
            [0.0, 0.0], [0.0, 1.0], [0.0, 0.5],
            [0.6, 0.5], [0.6, 1.0], [0.6, 0.0]
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
    'Y': {
        width: 0.6,
        path: [[0.0, 1.0], [0.3, 0.5], [0.6, 1.0], [0.3, 0.5], [0.3, 0.0]]
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
    '0': {
        width: 0.6,
        path: [
            [0.6, 0.5], [0.58, 0.7], [0.5, 0.88], [0.35, 0.97], [0.3, 1.0],
            [0.1, 0.92], [0.02, 0.72], [0.0, 0.5],
            [0.02, 0.28], [0.1, 0.08], [0.3, 0.0],
            [0.5, 0.08], [0.58, 0.28], [0.6, 0.5]
        ]
    },
    '.': {
        width: 0.1,
        path: [
            [0.05, 0.12], [0.03, 0.06], [0.05, 0.0],
            [0.07, 0.06], [0.05, 0.12]
        ]
    },
    '&': {
        width: 0.65,
        path: [
            [0.55, 0.1], [0.4, 0.0], [0.25, 0.0], [0.12, 0.1],
            [0.08, 0.25], [0.15, 0.4], [0.35, 0.55],
            [0.15, 0.7], [0.08, 0.85], [0.15, 0.97], [0.3, 1.0],
            [0.45, 0.93], [0.5, 0.8], [0.35, 0.55],
            [0.5, 0.35], [0.6, 0.2]
        ]
    }
};

const LETTER_SPACING = 0.12;
const LINE_SPACING = 1.5;

/**
 * Generate points for a single line of text (not centered).
 * @returns {{ points: {x:number,y:number}[], width: number }}
 */
export function generateSingleLine(text, density) {
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
            const nPts = Math.max(15, Math.round(dist * density * 0.1));

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

/**
 * Generate 3D points for a wireframe-sphere rock (3 tilted rings) plus label text below.
 * The outline starts from center (0,0,0) with a short approach line to the first vertex.
 * Grey preview rocks use points[0..outlineCount-1].
 *
 * @param {number} sizeFactor  Relative rock radius (1.0 = large)
 * @param {number} seed        Deterministic seed for shape variation
 * @param {string} label       Main label text (uppercase)
 * @param {string|null} sublabel  Secondary label, or null
 * @param {number} density     Points per unit length
 * @returns {{ points: {x:number,y:number,z:number}[], outlineCount: number }}
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

    // Approach line: center (0,0) → first vertex
    const first = outline[0];
    const approachDist = Math.sqrt(first.x * first.x + first.y * first.y);
    const approachN = Math.max(3, Math.round(approachDist * density * 0.3));
    for (let j = 1; j <= approachN; j++) {
        const t = j / approachN;
        allPoints.push({ x: first.x * t, y: first.y * t, z: 0 });
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
                z: 0
            });
        }
    }

    const outlineCount = allPoints.length;

    // ── Label text below rock ──────────────────────────────────────
    const labelScale = Math.max(0.35, sizeFactor * 0.45);
    const { points: labelPts, width: labelW } = generateSingleLine(label, density);

    const labelX = -labelW * labelScale / 2; // centered
    const labelY = -sizeFactor * 1.2 - 0.2;  // below rock

    // Transition curve: outline end → label start
    const last = allPoints[allPoints.length - 1];
    const firstLX = labelPts.length > 0 ? labelPts[0].x * labelScale + labelX : 0;
    const firstLY = labelPts.length > 0 ? labelPts[0].y * labelScale + labelY : labelY;

    const tDist = Math.sqrt((firstLX - last.x) ** 2 + (firstLY - last.y) ** 2);
    const transN = Math.max(5, Math.round(tDist * density * 0.08));
    const tmx = (last.x + firstLX) / 2;
    const tmy = Math.min(last.y, firstLY) - 0.15 * sizeFactor;

    for (let j = 1; j <= transN; j++) {
        const t = j / transN;
        const u = 1 - t;
        allPoints.push({
            x: u * u * last.x + 2 * u * t * tmx + t * t * firstLX,
            y: u * u * last.y + 2 * u * t * tmy + t * t * firstLY,
            z: 0
        });
    }

    for (const p of labelPts) {
        allPoints.push({ x: p.x * labelScale + labelX, y: p.y * labelScale + labelY, z: 0 });
    }

    // ── Sublabel ───────────────────────────────────────────────────
    if (sublabel) {
        const subScale = labelScale * 0.85;
        const { points: subPts, width: subW } = generateSingleLine(sublabel, density);

        const subX = -subW * subScale / 2;
        const subY = labelY - 0.8 * labelScale;

        const prev = allPoints[allPoints.length - 1];
        const fsx = subPts.length > 0 ? subPts[0].x * subScale + subX : 0;
        const fsy = subPts.length > 0 ? subPts[0].y * subScale + subY : subY;

        const sd = Math.sqrt((fsx - prev.x) ** 2 + (fsy - prev.y) ** 2);
        const sn = Math.max(4, Math.round(sd * density * 0.08));
        const smx = (prev.x + fsx) / 2;
        const smy = Math.min(prev.y, fsy) - 0.1;

        for (let j = 1; j <= sn; j++) {
            const t = j / sn;
            const u = 1 - t;
            allPoints.push({
                x: u * u * prev.x + 2 * u * t * smx + t * t * fsx,
                y: u * u * prev.y + 2 * u * t * smy + t * t * fsy,
                z: 0
            });
        }

        for (const p of subPts) {
            allPoints.push({ x: p.x * subScale + subX, y: p.y * subScale + subY, z: 0 });
        }
    }

    return { points: allPoints, outlineCount };
}

/**
 * Generate 3D points for a small flag shape (vertical stick + triangular pennant).
 * @param {number} anchorX  Anchor x position (top of rock)
 * @param {number} anchorY  Anchor y position
 * @param {number} anchorZ  Anchor z position
 * @param {number} size     Flag size scale
 * @param {number} density  Interpolation density
 * @returns {{ points: {x:number,y:number,z:number}[] }}
 */
export function generateFlag(anchorX, anchorY, anchorZ, size = 0.3, density = 500) {
    const points = [];
    const stickHeight = size * 1.5;
    const flagWidth = size * 0.8;
    const flagHeight = size * 0.5;

    const topY = anchorY + stickHeight;

    // Vertical stick: anchor → top
    const stickN = Math.max(5, Math.round(stickHeight * density * 0.3));
    for (let j = 0; j <= stickN; j++) {
        const t = j / stickN;
        points.push({ x: anchorX, y: anchorY + stickHeight * t, z: anchorZ });
    }

    // Triangular pennant: top → tip → back to stick
    const tipX = anchorX + flagWidth;
    const tipY = topY - flagHeight / 2;
    const baseY = topY - flagHeight;

    // Top of stick → tip of pennant
    const seg1N = Math.max(4, Math.round(flagWidth * density * 0.2));
    for (let j = 1; j <= seg1N; j++) {
        const t = j / seg1N;
        points.push({
            x: anchorX + flagWidth * t,
            y: topY - (flagHeight / 2) * t,
            z: anchorZ
        });
    }

    // Tip → bottom of pennant (back on stick)
    const seg2N = Math.max(4, Math.round(flagWidth * density * 0.2));
    for (let j = 1; j <= seg2N; j++) {
        const t = j / seg2N;
        points.push({
            x: tipX - flagWidth * t,
            y: tipY - (flagHeight / 2) * t,
            z: anchorZ
        });
    }

    return { points };
}
