import { describe, it, expect } from "vitest";
import { dedupeToolsForMcp } from "../gateway/routes/mcp.js";

/*
 * Regression guard for the production incident where a Codex agent lost its
 * ENTIRE toolset. getEnabledTools returned `commitment_create` twice (built-in
 * + commitments plugin); the MCP SDK's mcp.tool() throws on a duplicate name,
 * and that throw aborted the whole registration loop — every tool listed after
 * the dupe (server_list/server_exec included) never registered, so the agent
 * couldn't see its own servers and improvised with raw shell.
 *
 * dedupeToolsForMcp is the fix's testable core: a duplicate must be skipped,
 * never registered, so it can never throw and take the rest down with it.
 */
describe("dedupeToolsForMcp", () => {
    const t = (name: string) => ({ name });

    it("keeps the first occurrence and skips a later duplicate", () => {
        const { toRegister, skipped } = dedupeToolsForMcp([
            t("commitment_create"), t("server_list"), t("commitment_create"), t("server_exec"),
        ]);
        expect(toRegister.map((x) => x.name)).toEqual(["commitment_create", "server_list", "server_exec"]);
        expect(skipped).toEqual(["commitment_create"]);
    });

    it("the duplicate NEVER survives — the exact shape that used to crash the bridge", () => {
        // server_exec appears AFTER the duplicate; before the fix it would be
        // dropped when the dupe threw. It must be present now.
        const names = ["a", "commitment_create", "commitment_create", "server_exec"];
        const { toRegister } = dedupeToolsForMcp(names.map(t));
        const registered = toRegister.map((x) => x.name);
        expect(registered).toContain("server_exec");
        expect(registered.filter((n) => n === "commitment_create")).toHaveLength(1);
    });

    it("also dedupes against reserved (already-registered) names", () => {
        const { toRegister, skipped } = dedupeToolsForMcp(
            [t("send_message"), t("note_save")],
            ["send_message", "list_conversations", "get_conversation"],
        );
        expect(toRegister.map((x) => x.name)).toEqual(["note_save"]);
        expect(skipped).toEqual(["send_message"]);
    });

    it("passes a clean list through untouched", () => {
        const { toRegister, skipped } = dedupeToolsForMcp([t("a"), t("b"), t("c")]);
        expect(toRegister.map((x) => x.name)).toEqual(["a", "b", "c"]);
        expect(skipped).toEqual([]);
    });
});
