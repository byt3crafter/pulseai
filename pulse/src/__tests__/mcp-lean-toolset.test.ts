import { describe, it, expect } from "vitest";
import { selectLeanToolset } from "../gateway/routes/mcp.js";

/*
 * Progressive tool disclosure for the Codex bridge: instead of registering all
 * ~111 tools (~48k prompt tokens EVERY turn — the main reason Codex was slow),
 * register only a small always-core set + tools relevant to THIS question, and
 * defer the rest behind tool_search. These lock the selection behaviour.
 */
const CORE = new Set(["get_current_time", "memory_search", "notify"]);

const tools = [
    { name: "get_current_time", description: "current time" },
    { name: "memory_search", description: "search memory" },
    { name: "notify", description: "send a notification" },
    { name: "server_list", description: "list configured servers" },
    { name: "server_exec", description: "run a command on a server over SSH" },
    { name: "email_send", description: "send an email" },
    { name: "erpnext_create", description: "create an ERPNext document" },
    { name: "bookmark_save", description: "save a bookmark" },
];

describe("selectLeanToolset", () => {
    it("registers core + question-relevant tools, defers the rest", () => {
        const { initial, deferred } = selectLeanToolset(tools, "do you have access to any servers?", CORE);
        const names = initial.map((t) => t.name);
        // core always present
        expect(names).toEqual(expect.arrayContaining(["get_current_time", "memory_search", "notify"]));
        // "servers" pulls in the server tools
        expect(names).toContain("server_list");
        expect(names).toContain("server_exec");
        // unrelated tools are deferred, not registered
        expect(deferred.map((t) => t.name)).toEqual(expect.arrayContaining(["email_send", "erpnext_create", "bookmark_save"]));
        expect(names).not.toContain("erpnext_create");
    });

    it("a bare greeting loads ONLY the core set — the fast path", () => {
        const { initial, deferred } = selectLeanToolset(tools, "hello", CORE);
        expect(initial.map((t) => t.name).sort()).toEqual(["get_current_time", "memory_search", "notify"]);
        // everything non-core deferred → tiny prompt, fast first token
        expect(deferred.length).toBe(tools.length - 3);
    });

    it("matches on description, not just name", () => {
        const { initial } = selectLeanToolset(tools, "I need to run a command over ssh", CORE);
        expect(initial.map((t) => t.name)).toContain("server_exec"); // desc mentions SSH
    });

    it("an empty query still yields the core set (never empty)", () => {
        const { initial } = selectLeanToolset(tools, "", CORE);
        expect(initial.map((t) => t.name).sort()).toEqual(["get_current_time", "memory_search", "notify"]);
    });
});
