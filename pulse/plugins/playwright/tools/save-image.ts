import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { assertSafeNavigationUrl, getAllowPrivateNetwork } from "../client.js";
import { config } from "../../../src/config.js";
import { credentialVault } from "../../../src/agent/tools/credential-vault.js";
import { sendFileToConversation } from "../../../src/utils/channel-delivery.js";
import { logger } from "../../../src/utils/logger.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT_MS = 20_000;

/** Tenant toggle: Settings → Plugins → Playwright → PLAYWRIGHT_ENABLE_IMAGE_FETCH (default on). */
async function isImageFetchEnabled(tenantId: string): Promise<boolean> {
    try {
        const envVars = await credentialVault.getEnvVars(tenantId);
        const raw = (envVars["PLAYWRIGHT_ENABLE_IMAGE_FETCH"] || "").trim().toLowerCase();
        return raw !== "false"; // enabled unless explicitly disabled
    } catch (err) {
        logger.warn({ err, tenantId }, "Failed to read image-fetch toggle; defaulting to enabled");
        return true;
    }
}

const EXT_BY_MIME: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
};

export const browserSaveImageTool: Tool = {
    name: "browser_save_image",
    description:
        "Download an image from a URL (e.g. one found via browser_extract kind=links or an <img> src), " +
        "save it to the agent's workspace, and — when the conversation supports it (Telegram) — send it " +
        "to the user's chat so they see the actual image.",
    parameters: {
        type: "object",
        properties: {
            url: { type: "string", description: "Direct URL of the image to download (http/https)" },
            caption: { type: "string", description: "Optional caption to send with the image" },
        },
        required: ["url"],
    },

    async execute({ tenantId, conversationId, args }) {
        try {
            if (!(await isImageFetchEnabled(tenantId))) {
                return { result: JSON.stringify({ error: "Image fetching is disabled for this workspace (Settings → Plugins → Playwright)." }) };
            }

            const agentId = (args._agentId as string) || conversationId;
            const url = String(args.url || "");
            await assertSafeNavigationUrl(url, await getAllowPrivateNetwork(tenantId)); // same SSRF guard as navigation

            const res = await fetch(url, {
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                headers: { "User-Agent": "Mozilla/5.0 (compatible; PulseAgent)" },
            });
            if (!res.ok) {
                return { result: JSON.stringify({ error: `Fetch failed: HTTP ${res.status}` }) };
            }
            const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
            const ext = EXT_BY_MIME[mime];
            if (!ext) {
                return { result: JSON.stringify({ error: `Not an image (content-type: ${mime || "unknown"}). Supported: png, jpeg, webp, gif.` }) };
            }
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.byteLength > MAX_IMAGE_BYTES) {
                return { result: JSON.stringify({ error: `Image too large (${Math.round(buf.byteLength / 1024 / 1024)}MB > 10MB limit).` }) };
            }

            const dir = join(config.WORKSPACE_BASE_DIR, tenantId, agentId, "images");
            await mkdir(dir, { recursive: true });
            const filePath = join(dir, `img-${Date.now()}.${ext}`);
            await writeFile(filePath, buf);

            const delivery = await sendFileToConversation(
                tenantId,
                conversationId,
                filePath,
                String(args.caption || url).slice(0, 1024),
            );

            return {
                result: JSON.stringify({
                    path: filePath,
                    bytes: buf.byteLength,
                    mime,
                    note: delivery.delivered
                        ? "image sent to the user's chat — tell them it's in this chat, don't give the file path"
                        : "saved to agent workspace (this channel can't display images)",
                }),
            };
        } catch (err: any) {
            return { result: JSON.stringify({ error: err?.message || "Image download failed" }) };
        }
    },
};
