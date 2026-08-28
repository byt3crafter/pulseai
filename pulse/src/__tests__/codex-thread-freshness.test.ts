import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A settings change must reach a live Codex conversation.
 *
 * Codex reads `developerInstructions` ONCE, at thread/start. The provider then
 * caches the thread and reuses it for every later message, so a reused thread
 * is frozen with the prompt it was born with. Assigning a skill, editing a
 * persona or changing a standing order did nothing until the gateway
 * restarted — and nothing in the logs said so, which is what made it look like
 * the settings themselves were broken.
 *
 * Asserted at the source: the failure is a MISSING invalidation, which no
 * happy-path test would ever notice.
 */
const src = readFileSync(
    join(process.cwd(), "src", "agent", "providers", "codex-app-server.ts"),
    "utf8",
);

describe("a cached Codex thread is abandoned when the prompt changes", () => {
    it("hashes the system prompt the thread was started with", () => {
        expect(src).toMatch(/promptHash\s*=\s*createHash\("sha256"\)\.update\(params\.systemPrompt/);
    });

    it("drops the cached thread when that hash no longer matches", () => {
        expect(src).toMatch(/if \(cached && entry\.promptHash !== promptHash\)/);
        // and actually clears it, rather than only logging
        const branch = src.slice(src.indexOf("entry.promptHash !== promptHash"));
        expect(branch.slice(0, 600)).toMatch(/entry\.threadId = undefined/);
        expect(branch.slice(0, 600)).toMatch(/cached = undefined/);
    });

    it("records the hash when a thread is started, or it could never match", () => {
        expect(src).toMatch(/entry\.threadId = threadId;[\s\S]{0,120}entry\.promptHash = promptHash;/);
    });

    it("says so in the log, because a silent thread restart is confusing too", () => {
        expect(src).toMatch(/System prompt changed — starting a fresh Codex thread/);
    });

    it("still passes the prompt at thread/start", () => {
        // The whole mechanism depends on this being the delivery point.
        expect(src).toMatch(/developerInstructions: params\.systemPrompt/);
    });
});
