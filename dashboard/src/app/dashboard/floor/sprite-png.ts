/**
 * Server-side PNG encoding for floor avatars.
 *
 * Sprites are encoded in Node (never in a browser canvas) so the whole avatar
 * pipeline stays isomorphic pure math. That is what keeps the floor free of
 * SSR guards, StrictMode double-invoke handling, and theme-change regeneration:
 * sprites are just props from a Server Component.
 *
 * An 18x26 RGBA sprite encodes to roughly 300 bytes, i.e. a ~420-char data URL.
 */

import { deflateSync } from "node:zlib";
import { composePose, type Pose } from "./pixel-avatar";
import { recipeForAgent, SEED_VERSION } from "./recipe";

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(b: Uint8Array): number {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

/** Minimal RGBA8 PNG: IHDR + a single IDAT (filter 0 per row) + IEND. */
export function encodePng(buf: Uint8ClampedArray, w: number, h: number): Buffer {
    const stride = w * 4;
    const raw = Buffer.alloc(h * (stride + 1));
    for (let y = 0; y < h; y++) {
        raw[y * (stride + 1)] = 0; // filter: None
        raw.set(buf.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type: RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

import type { AgentSprite } from "./types";
export type { AgentSprite };

/**
 * Module-level LRU. Survives across requests in the same Node process, so a warm
 * process pays a Map lookup instead of ~0.1ms of drawing per pose.
 *
 * The bound is not optional: on a large multi-tenant instance an unbounded cache
 * is a slow memory leak.
 */
const CACHE = new Map<string, AgentSprite>();
const CACHE_MAX = 512;

function dataUrl(pose: Pose, recipe: ReturnType<typeof recipeForAgent>): string {
    const { buf, w, h } = composePose(recipe, pose);
    return `data:image/png;base64,${encodePng(buf, w, h).toString("base64")}`;
}

/** Stable sprite set for one agent. Cached by id. */
export function spriteForAgent(agentId: string, name: string): AgentSprite {
    const key = `${SEED_VERSION}:${agentId || name}`;
    const hit = CACHE.get(key);
    if (hit) {
        CACHE.delete(key); // LRU touch
        CACHE.set(key, hit);
        return hit;
    }

    const recipe = recipeForAgent(agentId, name);
    const sprite: AgentSprite = {
        idle: dataUrl("seatIdle", recipe),
        typeA: dataUrl("seatTypeA", recipe),
        typeB: dataUrl("seatTypeB", recipe),
    };

    CACHE.set(key, sprite);
    if (CACHE.size > CACHE_MAX) {
        const oldest = CACHE.keys().next().value;
        if (oldest !== undefined) CACHE.delete(oldest);
    }
    return sprite;
}
