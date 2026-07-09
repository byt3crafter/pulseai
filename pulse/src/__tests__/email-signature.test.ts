import { describe, expect, it } from "vitest";
import { buildSignatureHtml, renderSignature, htmlToText, extensionForMime, type SignatureConfig } from "../channels/email/signature.js";

describe("buildSignatureHtml", () => {
    it("produces table-based, inline-styled markup with no flexbox/grid/<style>", () => {
        const html = buildSignatureHtml({ name: "Natalie Harrington", title: "CFO", company: "RunState Ltd." }, false);

        expect(html).toContain("<table");
        expect(html).not.toMatch(/display\s*:\s*flex/i);
        expect(html).not.toMatch(/display\s*:\s*grid/i);
        expect(html).not.toContain("<style");
        expect(html).not.toContain("class=");
    });

    it("includes a CID logo image only when hasLogo is true", () => {
        const withLogo = buildSignatureHtml({ name: "A" }, true);
        const withoutLogo = buildSignatureHtml({ name: "A" }, false);

        expect(withLogo).toContain('src="cid:signature-logo"');
        expect(withoutLogo).not.toContain("cid:signature-logo");
    });
});

describe("renderSignature — builder mode", () => {
    const sig: SignatureConfig = {
        enabled: true,
        mode: "builder",
        html: "",
        fields: {
            name: "Natalie Harrington",
            title: "CFO",
            company: "RunState Ltd.",
        },
    };

    it("substitutes fields + fromAddress into the output and leaves no leftover {{...}} tokens", () => {
        const { html, text } = renderSignature(sig, { fromAddress: "natalie@runstate.example" });

        expect(html).toContain("Natalie Harrington");
        expect(html).toContain("CFO");
        expect(html).toContain("RunState Ltd.");
        expect(html).toContain("natalie@runstate.example");
        expect(html).not.toMatch(/\{\{\s*\w+\s*\}\}/);

        expect(text).toContain("Natalie Harrington");
        expect(text).toContain("CFO");
        expect(text).toContain("RunState Ltd.");
        expect(text).toContain("natalie@runstate.example");
    });

    it("drops rows for missing fields instead of leaving empty labels", () => {
        const minimal: SignatureConfig = {
            enabled: true,
            mode: "builder",
            html: "",
            fields: { name: "Solo Founder" },
        };

        const { html, text } = renderSignature(minimal, {});

        expect(html).toContain("Solo Founder");
        // No phone/website/tagline fields and no fromAddress → no dangling "Phone:" label or empty <a> links.
        expect(html).not.toContain("Phone:");
        expect(html).not.toContain('href=""');
        expect(text.split("\n")).toEqual(["Solo Founder"]);
    });
});

describe("renderSignature — raw mode", () => {
    it("uses the provided HTML as-is (aside from variable substitution)", () => {
        const sig: SignatureConfig = {
            enabled: true,
            mode: "raw",
            html: "<p>Best,<br>{{name}} — {{title}} @ {{company}}</p>",
            fields: { name: "Jordan Lee", title: "Support Lead", company: "Acme Inc." },
        };

        const { html, text } = renderSignature(sig, {});

        expect(html).toBe("<p>Best,<br>Jordan Lee — Support Lead @ Acme Inc.</p>");
        expect(text).toContain("Jordan Lee — Support Lead @ Acme Inc.");
    });

    it("passes through raw HTML unchanged when it has no template variables", () => {
        const sig: SignatureConfig = {
            enabled: true,
            mode: "raw",
            html: "<p>Thanks,<br>The Acme Team</p>",
        };

        const { html } = renderSignature(sig, {});
        expect(html).toBe("<p>Thanks,<br>The Acme Team</p>");
    });
});

describe("htmlToText", () => {
    it("strips tags and collapses blank lines into a sane fallback", () => {
        const text = htmlToText("<table><tr><td>Name</td></tr><tr><td></td></tr><tr><td>Title</td></tr></table>");
        expect(text).toBe("Name\nTitle");
    });
});

describe("extensionForMime", () => {
    it("maps common image mime types to file extensions", () => {
        expect(extensionForMime("image/png")).toBe("png");
        expect(extensionForMime("image/jpeg")).toBe("jpg");
        expect(extensionForMime("image/gif")).toBe("gif");
        expect(extensionForMime(undefined)).toBe("png");
    });
});
