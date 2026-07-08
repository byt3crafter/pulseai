import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getExistingPage, ACTION_TIMEOUT_MS } from "../client.js";

const MAX_TEXT_CHARS = 8000;
const MAX_LINKS = 100;

export const browserExtractTool: Tool = {
    name: "browser_extract",
    description:
        "Extract structured content from the current page: visible text, links, or the title. " +
        "Uses structured DOM APIs only — no arbitrary JS execution. Requires an active browser session.",
    parameters: {
        type: "object",
        properties: {
            selector: {
                type: "string",
                description: "CSS selector to scope text extraction to (default: entire body). Ignored for kind=links|title.",
            },
            kind: {
                type: "string",
                enum: ["text", "links", "title"],
                description: "What to extract (default: text)",
            },
        },
        required: [],
    },

    async execute({ tenantId, conversationId, args }) {
        try {
            const agentId = (args._agentId as string) || conversationId;
            const page = getExistingPage(tenantId, agentId);
            const kind = (args.kind as string) || "text";

            if (kind === "title") {
                return { result: JSON.stringify({ title: await page.title(), url: page.url() }) };
            }

            if (kind === "links") {
                const links = await page.$$eval("a[href]", (els) =>
                    els.map((el) => ({ text: (el.textContent || "").trim(), href: el.getAttribute("href") || "" }))
                );
                return {
                    result: JSON.stringify({ count: Math.min(links.length, MAX_LINKS), links: links.slice(0, MAX_LINKS) }),
                };
            }

            const locator = args.selector ? page.locator(String(args.selector)).first() : page.locator("body");
            const text = (await locator.innerText({ timeout: ACTION_TIMEOUT_MS })) || "";
            const truncated = text.length > MAX_TEXT_CHARS;

            return {
                result: JSON.stringify({
                    text: truncated
                        ? text.slice(0, MAX_TEXT_CHARS) + `\n…[truncated ${text.length - MAX_TEXT_CHARS} chars]`
                        : text,
                    truncated,
                }),
            };
        } catch (err: any) {
            return { result: JSON.stringify({ error: err?.message || "Extract failed" }) };
        }
    },
};
