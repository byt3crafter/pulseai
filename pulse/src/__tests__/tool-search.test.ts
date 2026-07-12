/**
 * Tool Search Tests — progressive tool disclosure.
 *
 * Verifies config parsing/defaults, the activation decision (off/auto/on +
 * threshold), the deferrable classification, and relevance ranking.
 */
import { describe, it, expect } from "vitest";
import {
    parseToolSearchConfig,
    isDeferrable,
    shouldUseToolSearch,
    rankDeferredTools,
    formatSearchResult,
    toolSearchDefinition,
    TOOL_SEARCH_NAME,
} from "../agent/tools/tool-search.js";
import { Tool } from "../agent/tools/tool.interface.js";

function tool(name: string, description: string, source?: Tool["source"]): Tool {
    return {
        name,
        description,
        source,
        parameters: { type: "object", properties: {} },
        async execute() { return { result: "" }; },
    };
}

describe("parseToolSearchConfig", () => {
    it("defaults to auto / 12 / 6 when unset", () => {
        const c = parseToolSearchConfig(undefined);
        expect(c).toEqual({ mode: "auto", threshold: 12, maxResults: 6 });
    });
    it("reads valid values", () => {
        const c = parseToolSearchConfig({ toolSearch: { mode: "on", threshold: 5, maxResults: 3 } });
        expect(c).toEqual({ mode: "on", threshold: 5, maxResults: 3 });
    });
    it("rejects an invalid mode and clamps numbers", () => {
        const c = parseToolSearchConfig({ toolSearch: { mode: "bogus", threshold: 0, maxResults: 999 } });
        expect(c.mode).toBe("auto");
        expect(c.threshold).toBe(1);   // clamped up from 0
        expect(c.maxResults).toBe(25); // clamped down from 999
    });
});

describe("isDeferrable", () => {
    it("defers extension tools, keeps built-ins", () => {
        expect(isDeferrable(tool("web_search", "", "plugin"))).toBe(true);
        expect(isDeferrable(tool("od_list", "", "mcp"))).toBe(true);
        expect(isDeferrable(tool("my_api", "", "custom"))).toBe(true);
        expect(isDeferrable(tool("ssh_run", "", "server"))).toBe(true);
        expect(isDeferrable(tool("get_current_time", "", "builtin"))).toBe(false);
        expect(isDeferrable(tool("calculator", ""))).toBe(false); // undefined source
    });
});

describe("shouldUseToolSearch", () => {
    it("never activates with zero deferrable tools", () => {
        expect(shouldUseToolSearch({ mode: "on", threshold: 1, maxResults: 6 }, 0)).toBe(false);
    });
    it("off never activates", () => {
        expect(shouldUseToolSearch({ mode: "off", threshold: 1, maxResults: 6 }, 50)).toBe(false);
    });
    it("on activates whenever there are deferrable tools", () => {
        expect(shouldUseToolSearch({ mode: "on", threshold: 99, maxResults: 6 }, 1)).toBe(true);
    });
    it("auto activates only above the threshold", () => {
        const cfg = { mode: "auto" as const, threshold: 12, maxResults: 6 };
        expect(shouldUseToolSearch(cfg, 12)).toBe(false);
        expect(shouldUseToolSearch(cfg, 13)).toBe(true);
    });
});

describe("rankDeferredTools", () => {
    const tools = [
        tool("onedrive_upload", "Upload a file to OneDrive", "plugin"),
        tool("web_search", "Search the web for current information", "plugin"),
        tool("send_email", "Send an email message", "plugin"),
        tool("erp_invoice", "Create an invoice in ERPNext", "plugin"),
    ];

    it("ranks name+description matches highest", () => {
        const { matches, total } = rankDeferredTools(tools, "upload a file to onedrive", 2);
        expect(total).toBe(4);
        expect(matches[0].name).toBe("onedrive_upload");
    });

    it("returns up to maxResults", () => {
        const { matches } = rankDeferredTools(tools, "anything", 2);
        expect(matches.length).toBe(2);
    });

    it("still returns results (discovery) when nothing matches", () => {
        const { matches } = rankDeferredTools(tools, "zzzzz", 3);
        expect(matches.length).toBe(3);
    });
});

describe("formatSearchResult / definition", () => {
    it("includes matched tool names and a note", () => {
        const out = formatSearchResult([tool("web_search", "Search the web", "plugin")], 5, "search");
        expect(out).toContain("web_search");
        expect(out).toContain("1 of 5");
    });
    it("meta-tool has the expected name and a query param", () => {
        const def = toolSearchDefinition();
        expect(def.name).toBe(TOOL_SEARCH_NAME);
        expect(def.input_schema.required).toContain("query");
    });
});
