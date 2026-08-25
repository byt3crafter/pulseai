/**
 * Deterministic look generation for floor avatars.
 *
 * Every agent gets a stable pixel person derived from its id, so the same agent
 * is byte-identical forever and desks never "change staff" between polls.
 *
 * There is deliberately no name -> character table anywhere in this feature.
 */

import type { Recipe, RGB, HairStyle, Cloth, Brow, Mouth, Facial } from "./pixel-avatar";

/** Bump to intentionally reroll every avatar in every deployment. */
export const SEED_VERSION = "pulse-floor-v1";

/** xmur3 — string -> well-avalanched 32-bit seed. */
function xmur3(str: string): () => number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}

/** mulberry32 — small, fast, pure-integer PRNG. Identical across V8 versions. */
function mulberry32(a: number): () => number {
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SKINS = ["light", "tan", "brown", "dark"] as const;

const HAIR_COLORS: RGB[] = [
    [28, 22, 18], [44, 34, 26], [58, 42, 28], [78, 54, 34], [104, 68, 40], [132, 84, 46],
    [154, 82, 46], [176, 140, 86], [206, 178, 116], [124, 120, 116], [188, 186, 182],
];

// Two presentation buckets keep combinations coherent without shrinking the
// space much. The overlap between them is deliberate — anyone can wear a suit.
const HAIR_A: HairStyle[] = ["styleShort", "styleFloppy", "styleSpiky", "styleMessy", "styleRecede", "styleBald", "styleCurly"];
const HAIR_B: HairStyle[] = ["styleFrame", "styleBun", "styleCurly", "styleMessy", "styleShort", "styleFloppy"];
const CLOTH_A: Cloth[] = ["suit", "dressshirt", "polo", "sweater", "cardigan"];
const CLOTH_B: Cloth[] = ["blouse", "cardigan", "sweater", "dressshirt", "suit"];

const GARMENTS: RGB[] = [
    [58, 63, 74], [44, 48, 58], [92, 98, 112], [172, 196, 224], [126, 150, 182], [86, 116, 150],
    [122, 60, 74], [176, 86, 74], [188, 146, 92], [110, 140, 110], [78, 116, 104],
    [150, 146, 170], [214, 168, 190], [236, 236, 232],
];
const TIES: RGB[] = [[170, 58, 58], [52, 68, 122], [40, 40, 50], [120, 82, 46], [76, 110, 96], [132, 92, 132]];
const BROWS: Brow[] = ["flat", "angry", "raised", "soft"];
const MOUTHS: Mouth[] = ["neutral", "smile", "smile", "grin", "frown"]; // weighted friendly
const FACIALS: Facial[] = ["mustache", "mustacheSm", "stubble", "goatee"];

/**
 * Stable procedural look for an agent, seeded by its id (falling back to name
 * for unsaved preview rows).
 *
 * THE DRAW ORDER BELOW IS APPEND-ONLY. Each pick/chance consumes one PRNG step,
 * so inserting a draw in the middle silently reshuffles every existing agent's
 * appearance. To add an axis, append it at the end; to reroll everyone, bump
 * SEED_VERSION.
 *
 * Note `avatar` is deliberately NOT part of the seed — re-uploading a photo must
 * not change who the pixel person is.
 */
export function recipeForAgent(agentId: string, name: string): Recipe {
    const key = `${SEED_VERSION}:${agentId || name}`;
    const rng = mulberry32(xmur3(key)());
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rng() * a.length)];
    const chance = (p: number) => rng() < p;

    const bucket = chance(0.5) ? "A" : "B";
    const skin = pick(SKINS);
    const hairc = pick(HAIR_COLORS);
    const hair = pick(bucket === "A" ? HAIR_A : HAIR_B);
    const cloth = pick(bucket === "A" ? CLOTH_A : CLOTH_B);
    const c1 = pick(GARMENTS);
    const brow = pick(BROWS);
    const mouth = pick(MOUTHS);
    const glasses = chance(0.28);
    const heavy = chance(0.18);
    const facial = bucket === "A" && chance(0.3) ? pick(FACIALS) : undefined;
    const lashes = bucket === "B" ? chance(0.75) : false;
    const blush = bucket === "B" && chance(0.35);
    const tie = (cloth === "suit" || cloth === "dressshirt") && chance(0.7) ? pick(TIES) : undefined;
    const part: "L" | "R" = chance(0.5) ? "L" : "R";
    const recede = hair === "styleShort" && chance(0.2) ? 1 : 0;
    const length = hair === "styleFrame" ? 15 + Math.floor(rng() * 6)
        : hair === "styleMessy" ? 8 + Math.floor(rng() * 8)
            : undefined;
    const vol = hair === "styleFrame" ? 1 + Math.floor(rng() * 2) : undefined;
    const c2 = cloth === "cardigan" || cloth === "polo" ? pick(GARMENTS) : undefined;

    return {
        skin, hairc, hair,
        hairargs: { part, recede, length, vol },
        cloth, c1, c2, tie, brow, mouth, glasses, heavy, facial, lashes, blush,
    };
}
