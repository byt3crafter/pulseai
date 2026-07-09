import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getExistingPage, ACTION_TIMEOUT_MS } from "../client.js";

export const browserFillTool: Tool = {
    name: "browser_fill",
    description:
        "Fill one or more form fields by CSS selector, optionally clicking a submit element afterward. " +
        "Requires an active browser session — call browser_navigate first.",
    parameters: {
        type: "object",
        properties: {
            fields: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        selector: { type: "string", description: "CSS selector of the input field" },
                        value: { type: "string", description: "Value to type into the field" },
                    },
                    required: ["selector", "value"],
                },
                description: "Fields to fill, in order.",
            },
            submit_selector: {
                type: "string",
                description: "Optional CSS selector to click after filling all fields (e.g. a submit button)",
            },
        },
        required: ["fields"],
    },

    async execute({ tenantId, conversationId, args }) {
        try {
            const agentId = (args._agentId as string) || conversationId;
            const page = getExistingPage(tenantId, agentId);

            const fields = Array.isArray(args.fields) ? args.fields : [];
            const results: Array<{ selector: string; ok: boolean; error?: string }> = [];

            for (const field of fields) {
                const selector = String(field?.selector || "");
                try {
                    await page.fill(selector, String(field?.value ?? ""), { timeout: ACTION_TIMEOUT_MS });
                    results.push({ selector, ok: true });
                } catch (err: any) {
                    results.push({ selector, ok: false, error: err?.message || "fill failed" });
                }
            }

            let submitted = false;
            if (args.submit_selector) {
                await page.click(String(args.submit_selector), { timeout: ACTION_TIMEOUT_MS });
                await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
                submitted = true;
            }

            return { result: JSON.stringify({ fields: results, submitted, url: page.url() }) };
        } catch (err: any) {
            return { result: JSON.stringify({ error: err?.message || "Fill failed" }) };
        }
    },
};
