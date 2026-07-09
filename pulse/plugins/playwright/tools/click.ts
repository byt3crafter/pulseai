import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getExistingPage, ACTION_TIMEOUT_MS } from "../client.js";

export const browserClickTool: Tool = {
    name: "browser_click",
    description:
        "Click an element on the current page — by CSS selector, or by visible text if `text` is given. " +
        "Requires an active browser session — call browser_navigate first.",
    parameters: {
        type: "object",
        properties: {
            selector: { type: "string", description: "CSS selector of the element to click (optional if `text` is given)" },
            text: {
                type: "string",
                description: "Visible text to click instead of a selector — matches the first element containing this text",
            },
        },
        required: [],
    },

    async execute({ tenantId, conversationId, args }) {
        try {
            const agentId = (args._agentId as string) || conversationId;
            const page = getExistingPage(tenantId, agentId);
            const urlBefore = page.url();

            if (args.text) {
                await page.getByText(String(args.text)).first().click({ timeout: ACTION_TIMEOUT_MS });
            } else if (args.selector) {
                await page.click(String(args.selector), { timeout: ACTION_TIMEOUT_MS });
            } else {
                return { result: JSON.stringify({ error: "Provide either `selector` or `text`." }) };
            }

            // Give any resulting navigation a brief moment to settle before reporting state.
            await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});

            return {
                result: JSON.stringify({
                    clicked: args.text ? `text:${args.text}` : args.selector,
                    navigated: page.url() !== urlBefore,
                    url: page.url(),
                    title: await page.title(),
                }),
            };
        } catch (err: any) {
            return { result: JSON.stringify({ error: err?.message || "Click failed" }) };
        }
    },
};
