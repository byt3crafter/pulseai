/**
 * Procedural office props.
 *
 * Same approach as pixel-avatar.ts: everything is drawn pixel-by-pixel in code,
 * so there are no art files, no licence, no attribution and nothing to
 * redistribute. That matters more here than it looks — Pulse ships Docker images
 * to customer-controlled servers and sells white-labelling, and every bought
 * asset pack we looked at either required a visible credit or stated no licence
 * at all.
 *
 * Furniture is much easier than people: no anatomy, no animation, no face. A
 * desk is a box with a grain and an outline.
 */

export type RGB = [number, number, number];
type Buf = Uint8ClampedArray;

const OUTLINE: RGB = [38, 34, 46];

interface Canvas { buf: Buf; w: number; h: number }

function make(w: number, h: number): Canvas {
    return { buf: new Uint8ClampedArray(w * h * 4), w, h };
}
function px(c: Canvas, x: number, y: number, col: RGB, a = 255): void {
    if (x < 0 || x >= c.w || y < 0 || y >= c.h) return;
    const i = (y * c.w + x) * 4;
    c.buf[i] = col[0]; c.buf[i + 1] = col[1]; c.buf[i + 2] = col[2]; c.buf[i + 3] = a;
}
function box(c: Canvas, x0: number, y0: number, x1: number, y1: number, col: RGB, a = 255): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(c, x, y, col, a);
}
function alphaAt(c: Canvas, x: number, y: number): number {
    if (x < 0 || x >= c.w || y < 0 || y >= c.h) return 0;
    return c.buf[(y * c.w + x) * 4 + 3];
}
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
function shade(rgb: RGB, f: number): RGB {
    return [clamp(rgb[0] * f), clamp(rgb[1] * f), clamp(rgb[2] * f)];
}

/** Ring the opaque silhouette, exactly as the characters are outlined. */
function outline(c: Canvas): void {
    const pts: [number, number][] = [];
    for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
            if (alphaAt(c, x, y) !== 0) continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
                if (alphaAt(c, x + dx, y + dy) === 255) { pts.push([x, y]); break; }
            }
        }
    }
    for (const [x, y] of pts) px(c, x, y, OUTLINE);
}

// ─── palettes ────────────────────────────────────────────────────────────────
const WOOD: RGB = [176, 137, 94];
const LEAF: RGB = [86, 138, 84];
const TERRACOTTA: RGB = [178, 102, 74];
const METAL: RGB = [156, 160, 168];
const PLASTIC: RGB = [64, 68, 78];
const PAPER: RGB = [238, 236, 228];

// ─── props ───────────────────────────────────────────────────────────────────

/** Potted plant — the cheapest thing that makes a room look inhabited. */
export function plant(): Canvas {
    const c = make(14, 18);
    const [lh, lb, ls] = [shade(LEAF, 1.25), LEAF, shade(LEAF, 0.7)];
    // foliage: a rough dome, hand-placed so it doesn't read as a circle
    for (const [x, y] of [
        [6, 1], [7, 1], [5, 2], [6, 2], [7, 2], [8, 2],
        [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3],
        [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],
        [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5],
        [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
        [4, 7], [5, 7], [8, 7], [9, 7],
    ] as const) px(c, x, y, lb);
    for (const [x, y] of [[6, 1], [7, 1], [4, 3], [5, 3], [3, 4], [4, 4], [5, 5]] as const) px(c, x, y, lh);
    for (const [x, y] of [[10, 4], [11, 4], [10, 5], [11, 5], [9, 6], [10, 6]] as const) px(c, x, y, ls);
    // stem
    box(c, 6, 7, 7, 9, shade(LEAF, 0.6));
    // pot, tapered
    box(c, 3, 10, 10, 11, shade(TERRACOTTA, 1.15));
    box(c, 3, 12, 10, 15, TERRACOTTA);
    box(c, 4, 16, 9, 16, shade(TERRACOTTA, 0.75));
    for (let y = 12; y <= 15; y++) px(c, 10, y, shade(TERRACOTTA, 0.75));
    outline(c);
    return c;
}

/** Filing cabinet — three drawers, handles, a hint of depth on top. */
export function cabinet(): Canvas {
    const c = make(14, 20);
    const body = METAL;
    box(c, 2, 2, 11, 3, shade(body, 1.2));   // top surface
    box(c, 2, 4, 11, 17, body);
    for (let y = 4; y <= 17; y++) px(c, 11, y, shade(body, 0.78));
    // drawers
    for (const dy of [5, 9, 13]) {
        box(c, 3, dy, 10, dy + 2, shade(body, 0.92));
        box(c, 5, dy + 1, 8, dy + 1, shade(body, 0.62)); // handle
    }
    box(c, 2, 18, 11, 18, shade(body, 0.7));
    outline(c);
    return c;
}

/** Water cooler — bottle, tap, base. */
export function cooler(): Canvas {
    const c = make(12, 22);
    const water: RGB = [126, 178, 208];
    box(c, 3, 1, 8, 2, shade(water, 0.8));
    box(c, 2, 3, 9, 8, water);
    box(c, 3, 3, 4, 7, shade(water, 1.2));   // highlight
    for (let y = 3; y <= 8; y++) px(c, 9, y, shade(water, 0.75));
    box(c, 2, 9, 9, 18, PAPER);
    for (let y = 9; y <= 18; y++) px(c, 9, y, shade(PAPER, 0.82));
    box(c, 5, 11, 6, 12, PLASTIC);            // tap
    box(c, 2, 19, 9, 20, shade(PAPER, 0.7));
    outline(c);
    return c;
}

/** Meeting table with chairs tucked either side. */
export function meetingTable(): Canvas {
    const c = make(34, 20);
    box(c, 4, 6, 29, 7, shade(WOOD, 1.18));
    box(c, 4, 8, 29, 13, WOOD);
    box(c, 4, 14, 29, 15, shade(WOOD, 0.72));
    // grain
    for (const y of [9, 11]) for (let x = 6; x < 28; x += 3) px(c, x, y, shade(WOOD, 0.9));
    // chairs
    for (const x of [7, 14, 21, 27]) {
        box(c, x, 2, x + 4, 4, PLASTIC);
        box(c, x, 17, x + 4, 19, PLASTIC);
    }
    outline(c);
    return c;
}

/** Whiteboard on a wall — a frame, a couple of scrawls. */
export function whiteboard(): Canvas {
    const c = make(26, 14);
    box(c, 1, 1, 24, 12, PAPER);
    box(c, 1, 1, 24, 1, shade(PAPER, 1.05));
    for (let y = 1; y <= 12; y++) { px(c, 1, y, shade(METAL, 0.9)); px(c, 24, y, shade(METAL, 0.9)); }
    box(c, 1, 12, 24, 12, shade(METAL, 0.8));
    // scrawls
    box(c, 4, 4, 14, 4, [120, 140, 190]);
    box(c, 4, 6, 18, 6, [120, 140, 190]);
    box(c, 4, 8, 10, 8, [190, 130, 130]);
    outline(c);
    return c;
}

/** Coffee machine — because every office has one. */
export function coffee(): Canvas {
    const c = make(12, 16);
    box(c, 2, 1, 9, 10, PLASTIC);
    box(c, 3, 2, 8, 4, [92, 98, 110]);        // display
    box(c, 4, 6, 7, 8, shade(WOOD, 0.6));     // pot
    box(c, 2, 11, 9, 13, shade(PLASTIC, 1.2));
    box(c, 2, 14, 9, 14, shade(PLASTIC, 0.7));
    outline(c);
    return c;
}

export const PROPS = { plant, cabinet, cooler, meetingTable, whiteboard, coffee } as const;
export type PropName = keyof typeof PROPS;
