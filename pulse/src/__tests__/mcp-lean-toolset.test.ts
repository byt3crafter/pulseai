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

    it("stopwords don't drag in unrelated tools (the 48k-token bug)", () => {
        // "have/access/any/you/do" are stopwords; only "servers" is meaningful.
        // Without stopword filtering this pulled ~everything via description hits.
        const { initial } = selectLeanToolset(tools, "do you have access to any of them", CORE);
        // no meaningful noun → only core, nothing dragged in
        expect(initial.map((t) => t.name).sort()).toEqual(["get_current_time", "memory_search", "notify"]);
    });

    it("NEVER defers capability-defining tools (plugin/custom/mcp/server source)", () => {
        // The agent's real job — ERPNext, a customer API, SSH — must always be
        // loaded, even when the question doesn't name it. This is the fix for
        // "check if there is any update" → "server tools not exposed".
        const capabilityTools = [
            { name: "get_current_time", description: "time" },
            { name: "server_exec", description: "run over ssh", source: "server" },
            { name: "erpnext_create", description: "create doc", source: "plugin" },
            { name: "acme_api_call", description: "customer api", source: "custom" },
            { name: "email_send", description: "send email", source: "builtin" },
        ];
        const { initial, deferred } = selectLeanToolset(capabilityTools, "check if there is any update", CORE);
        const names = initial.map((t) => t.name);
        expect(names).toContain("server_exec");   // source: server
        expect(names).toContain("erpnext_create"); // source: plugin
        expect(names).toContain("acme_api_call");  // source: custom
        // the optional built-in with no query match is the only thing deferred
        expect(deferred.map((t) => t.name)).toEqual(["email_send"]);
    });

    it("caps the up-front set so a broad question can't reinflate context", () => {
        const many = Array.from({ length: 40 }, (_, i) => ({ name: `report_${i}`, description: "generate a report" }));
        const { initial, deferred } = selectLeanToolset(many, "make me a report", new Set<string>());
        // capped at MAX_INITIAL_MATCHES (12); the rest stay searchable
        expect(initial.length).toBeLessThanOrEqual(12);
        expect(deferred.length).toBeGreaterThan(0);
    });
});
