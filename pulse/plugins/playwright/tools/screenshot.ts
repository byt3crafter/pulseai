import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getExistingPage, ACTION_TIMEOUT_MS } from "../client.js";
import { config } from "../../../src/config.js";
import { deliverScreenshotToChannel } from "../deliver.js";

export const browserScreenshotTool: Tool = {
    name: "browser_screenshot",
    description:
        "Take a screenshot of the current page and save it to the agent's workspace. " +
        "Requires an active browser session — call browser_navigate first.",
    parameters: {
        type: "object",
        properties: {
            full_page: {
                type: "boolean",
                description: "Capture the full scrollable page instead of just the viewport (default: false)",
            },
        },
        required: [],
    },

    async execute({ tenantId, conversationId, args }) {
        try {
            const agentId = (args._agentId as string) || conversationId;
            const page = getExistingPage(tenantId, agentId);

            const dir = join(config.WORKSPACE_BASE_DIR, tenantId, agentId, "screenshots");
            await mkdir(dir, { recursive: true });
            const filePath = join(dir, `shot-${Date.now()}.png`);

            await page.screenshot({
                path: filePath,
                fullPage: Boolean(args.full_page),
                timeout: ACTION_TIMEOUT_MS,
            });

            const viewport = page.viewportSize();

            // Best-effort: push the image into the conversation's channel
            // (Telegram sendPhoto) so the user actually SEES it instead of a
            // container file path. Non-fatal on any failure.
            const delivery = await deliverScreenshotToChannel(
                tenantId,
                conversationId,
                filePath,
                `Screenshot: ${page.url()}`,
            );

            return {
                result: JSON.stringify({
                    path: filePath,
                    width: viewport?.width ?? null,
                    height: viewport?.height ?? null,
                    note: delivery.delivered
                        ? "saved to agent workspace AND sent to the user's chat as a photo — tell the user the screenshot is in this chat, do not give them the file path"
                        : "saved to agent workspace (file path only — this channel can't display images)",
                }),
            };
        } catch (err: any) {
            return { result: JSON.stringify({ error: err?.message || "Screenshot failed" }) };
        }
    },
};
