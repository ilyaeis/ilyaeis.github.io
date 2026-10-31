// JavaScript port of ArrayDrawer.cpp (github.com/ilyaeis/sort_visualization).
// The same five layouts, sizes and colours, drawn on a canvas in the units of
// the original 1000 x 1000 SFML window (y down). Values are the original ones
// (2 .. 1000 for 500 items), so a value is also a length in pixels.

export const SCREEN = 1000;
export const LAYOUTS = ['columns', 'points', 'circle', 'spiral', 'pyramid'];

// Menu.hpp themes: text and column colour, selected text colour, background,
// main column colour, sub column colour
export const THEMES = [
    [[255, 183, 3], [251, 133, 0], [2, 48, 71], [247, 37, 133], [114, 9, 183]],
    [[141, 153, 174], [237, 242, 244], [43, 45, 66], [239, 35, 60], [217, 4, 41]],
    [[138, 201, 38], [25, 130, 196], [106, 76, 147], [255, 89, 94], [255, 202, 58]],
    [[255, 255, 255], [225, 229, 242], [2, 43, 58], [249, 233, 236], [191, 215, 255]],
    [[157, 78, 221], [199, 125, 255], [16, 0, 43], [199, 125, 255], [224, 170, 255]]
];
export const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

const PI = 3.14;                         // ArrayDrawer uses 3.14: the circle and the spiral do not quite close
const W = SCREEN, H = SCREEN;

// HSL_to_RGB from AnotherFunc.cpp (s = 1, l = 0.5 in every caller); sf::Color truncates
function hslToRgb(h, s, l) {
    const C = (1 - Math.abs(2 * l - 1)) * s;
    const X = C * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - C / 2;
    let r, g, b;
    if (h < 60) [r, g, b] = [C, X, 0];
    else if (h < 120) [r, g, b] = [X, C, 0];
    else if (h < 180) [r, g, b] = [0, C, X];
    else if (h < 240) [r, g, b] = [0, X, C];
    else if (h < 300) [r, g, b] = [X, 0, C];
    else [r, g, b] = [C, 0, X];
    return `rgb(${Math.trunc((r + m) * 255)},${Math.trunc((g + m) * 255)},${Math.trunc((b + m) * 255)})`;
}
// Colour by value: hue = 360 / screen_height × (value − 1)
const HUE = [];
for (let v = 0; v <= SCREEN; v++) HUE.push(hslToRgb(360 / H * Math.max(v - 1, 0), 1, 0.5));
const hue = (v) => HUE[Math.min(Math.max(v, 0), SCREEN)];

// sf::CircleShape(radius) at setPosition(x, y): (x, y) is the top-left corner of its box
function dot(ctx, x, y, r) { ctx.moveTo(x + 2 * r, y + r); ctx.arc(x + r, y + r, r, 0, 2 * Math.PI); }

function drawColumns(ctx, a, main, sub, col) {
    const s = 2;                                         // vector_one_item_size
    ctx.fillStyle = col.column;
    ctx.beginPath();
    for (let i = 0; i < a.length; i++) if (i !== main && i !== sub) ctx.rect(i * s, 0, s, a[i]);
    ctx.fill();
    if (main >= 0 && main < a.length) { ctx.fillStyle = col.main; ctx.fillRect(main * s, 0, s, a[main]); }
    if (sub >= 0 && sub < a.length && sub !== main) { ctx.fillStyle = col.sub; ctx.fillRect(sub * s, 0, s, a[sub]); }
}

function drawPoints(ctx, a, main, sub, col) {
    const s = 2;
    const at = (i) => dot(ctx, i * s - s, H - a[i] - s, s * 2);
    ctx.fillStyle = col.column;
    ctx.beginPath();
    for (let i = 0; i < a.length; i++) if (i !== main && i !== sub) at(i);
    ctx.fill();
    for (const [i, c] of [[main, col.main], [sub, col.sub]]) {
        if (i < 0 || i >= a.length) continue;
        ctx.fillStyle = c; ctx.beginPath(); at(i); ctx.fill();
    }
}

// index_of_num_next_after / find_index_of_max (AnotherFunc.cpp), as written
function indexOfMax(a) { let r = 0; for (let i = 0; i < a.length; i++) if (a[i] > a[r]) r = i; return r; }
function nextAfter(num, a, iMax) {
    let r = iMax;
    for (let i = 0; i < a.length; i++) if (a[i] > num && a[i] <= a[r]) r = i;
    return r;
}

// "Circumference": dots on a circle by index, joined in value order
function drawCircle(ctx, a, main, sub, col, lw) {
    const n = a.length, R = H / 3, rDot = H / n;
    const step = 360 / n * PI / 180, Ox = W / 2, Oy = H / 2;
    const iMax = indexOfMax(a);
    let first = nextAfter(-1, a, iMax);
    ctx.lineWidth = lw;
    for (let i = 0; i < n; i++) {
        const second = nextAfter(a[first], a, iMax);
        const x1 = Ox + R * Math.cos(first * step), y1 = Oy + R * Math.sin(first * step);
        const x2 = Ox + R * Math.cos(second * step), y2 = Oy + R * Math.sin(second * step);
        let c1 = hue(a[first]), c2 = hue(a[second]), line = c1;
        if (first === main || first === sub) { c1 = col.main; line = col.main; }
        else if (second === main || second === sub) c2 = col.main;
        ctx.fillStyle = c1; ctx.beginPath(); dot(ctx, x1, y1, rDot); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); dot(ctx, x2, y2, rDot); ctx.fill();
        ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        first = second;
    }
}

// Spiral: one wedge per item, its radius from the value
function drawSpiral(ctx, a, main, sub) {
    const n = a.length, step = 360 / n * PI / 180, Ox = W / 2, Oy = H / 2;
    const k = (H / 2.2) / H;
    for (let i = 0; i < n; i++) {
        const r = k * a[i];
        ctx.fillStyle = hue(a[i]);
        ctx.beginPath();
        ctx.moveTo(Ox, Oy);
        ctx.lineTo(Ox + r * Math.cos(i * step), Oy + r * Math.sin(i * step));
        ctx.lineTo(Oy + r * 1.05 * Math.cos((i + 0.5) * step), Oy + r * 1.05 * Math.sin((i + 0.5) * step)); // (Oy as in the original)
        ctx.lineTo(Ox + r * Math.cos((i + 1) * step), Oy + r * Math.sin((i + 1) * step));
        ctx.fill();
        if (i === main || i === sub) {
            const rr = r / 9 + r;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); dot(ctx, Ox + rr * Math.cos(i * step), Oy + rr * Math.sin(i * step), H / n / 2); ctx.fill();
        }
    }
}

// Pyramid: stacked ellipse outlines, the width from the value. get_ellipse()
// scales a unit circle by (sizex / 4, sizey / 8) and gives it an outline of
// width / (sizey / 8) in its own units, so the outline is scaled too.
function drawPyramid(ctx, a, main, sub, col) {
    const n = a.length, height = H / 2, Ox = W / 2, Oy = H / 2 + H / 3;
    const hueStep = 360 / H, k = height / n;
    for (let i = n - 1; i >= 0; i--) {
        const y = Oy - (height - k * i) - height / 3;
        const sx = a[i] * k, sy = sx * k / 2, width = k * hueStep + 1;
        const rx = sx / 4, ry = sy / 8, t = width / ry;
        ctx.save();
        ctx.translate(Ox, y);
        ctx.scale(rx, ry);
        ctx.lineWidth = t;
        ctx.strokeStyle = (i === main || i === sub) ? col.column : hue(a[i]);
        ctx.beginPath(); ctx.arc(0, 0, 1 + t / 2, 0, 2 * Math.PI); ctx.stroke();
        ctx.restore();
    }
}

// get_text(): centred on its box, outline in the background colour (size / 10)
function text(ctx, str, size, x, y, col) {
    if (!str) return;
    ctx.font = `${size}px Ruda, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2 * Math.floor(size / 10);
    ctx.strokeStyle = col.background;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = col.column;
    ctx.fillText(str, x, y);
}

const DRAW = [drawColumns, drawPoints, drawCircle, drawSpiral, drawPyramid];

// draw_array(): clear, the layout, then the sort name, the array length and the speed.
// o = { layout: 0..4, theme: 0..4, name, speed, maxSpeed, lw: one screen pixel in these units }
export function drawArray(ctx, a, main, sub, o) {
    const t = THEMES[o.theme];
    const col = { column: rgb(t[0]), background: rgb(t[2]), main: rgb(t[3]), sub: rgb(t[4]) };
    ctx.fillStyle = col.background;
    ctx.fillRect(0, 0, W, H);
    DRAW[o.layout](ctx, a, main, sub, col, o.lw ?? 1);
    text(ctx, o.name, H / 25, W / 2, H * 0.85, col);
    text(ctx, 'Array length: ' + a.length, H / 50, W / 2, H * 0.89, col);
    if (o.maxSpeed > 0) text(ctx, `Speed: ${o.speed}/${o.maxSpeed}`, H / 50, W / 2, H * 0.82, col);
}
