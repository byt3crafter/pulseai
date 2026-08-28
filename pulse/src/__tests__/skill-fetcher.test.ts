import { describe, it, expect } from "vitest";
import { parseRepoUrl, tarballUrl } from "../skills/skill-fetcher.js";

/*
 * Both of these were found by importing the real packs on production, and both
 * had already done damage: one silently imported the wrong thing, the other
 * took the gateway down.
 */
describe("a browse URL naming a folder means that folder", () => {
    it("reads the ref and subfolder out of a GitHub tree URL", () => {
        // Exactly what you get by clicking a folder on github.com.
        expect(parseRepoUrl("https://github.com/anthropics/knowledge-work-plugins/tree/main/finance"))
            .toEqual({ url: "https://github.com/anthropics/knowledge-work-plugins", subdir: "finance", ref: "main" });
    });

    it("handles a nested folder and a non-default branch", () => {
        expect(parseRepoUrl("https://github.com/o/r/tree/v2/a/b/c"))
            .toEqual({ url: "https://github.com/o/r", subdir: "a/b/c", ref: "v2" });
    });

    it("leaves a plain repo URL alone", () => {
        expect(parseRepoUrl("https://github.com/o/r", "main"))
            .toEqual({ url: "https://github.com/o/r", subdir: "", ref: "main" });
    });

    it("keeps the explicit branch when the URL names no folder", () => {
        expect(parseRepoUrl("https://github.com/o/r", "develop").ref).toBe("develop");
    });

    /*
     * The regression that matters. Before this, a pack pointed at
     * .../tree/main/finance was reduced to owner/repo and imported the ENTIRE
     * repository — 212 skills from every department under a pack named
     * "Finance and accounting operations". Worse than failing, because the
     * count looks plausible and nobody has any reason to look.
     */
    it("does not collapse a subfolder URL to the whole repository", () => {
        expect(parseRepoUrl("https://github.com/o/r/tree/main/finance").subdir).toBe("finance");
    });
});

describe("archive URLs", () => {
    it("builds a codeload URL for GitHub", () => {
        expect(tarballUrl("https://github.com/o/r", "main"))
            .toBe("https://codeload.github.com/o/r/tar.gz/refs/heads/main");
    });

    it("refuses a host whose archive layout we do not know", () => {
        // Refusing by name means the SSRF guard is never the only thing between
        // an operator typo and an internal metadata endpoint.
        expect(() => tarballUrl("http://169.254.169.254/o/r")).toThrow(/Unsupported host/);
        expect(() => tarballUrl("https://gitea.internal/o/r")).toThrow(/Unsupported host/);
    });

    it("rejects a URL that names no repository", () => {
        expect(() => tarballUrl("https://github.com/onlyowner")).toThrow(/Expected a repository URL/);
    });
});
