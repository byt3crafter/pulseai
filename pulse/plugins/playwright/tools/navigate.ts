import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getOrCreateSession, assertSafeNavigationUrl, getAllowPrivateNetwork, ACTION_TIMEOUT_MS } from "../client.js";

export const browserNavigateTool: Tool = {
    name: "browser_navigate",
    description:
        "Navigate the browser to a URL. Creates a browser session for this agent if one doesn't already exist. " +
        "Always call this before browser_click, browser_fill, browser_extract, or browser_screenshot.",
    parameters: {
        type: "object",
        properties: {
            url: { type: "string", description: "Absolute URL to navigate to, e.g. https://example.com" },
        },
        required: ["url"],
    },

    async execute({ tenantId, conversationId, args }) {
        try {
            const agentId = (args._agentId as string) || conversationId;
            const allowPrivateNetwork = await getAllowPrivateNetwork(tenantId);
            const safeUrl = await assertSafeNavigationUrl(String(args.url || ""), allowPrivateNetwork);

            const page = await getOrCreateSession(tenantId, agentId);
            const response = await page.goto(safeUrl.toString(), {
                waitUntil: "domcontentloaded",
                timeout: ACTION_TIMEOUT_MS,
            });

            return {
                result: JSON.stringify({
                    url: page.url(),
                    title: await page.title(),
                    status: response?.status() ?? null,
                }),
            };
        } catch (err: any) {
            return { result: JSON.stringify({ error: err?.message || "Navigation failed" }) };
        }
    },
};
