/**
 * image_generate — create an image with MiniMax image-01 using the tenant's
 * own MiniMax API key, save it to the agent workspace, and deliver it into
 * the conversation's chat (Telegram) when possible.
 *
 * API (verified against MiniMax docs): POST https://api.minimax.io/v1/image_generation
 *   { model:"image-01", prompt, aspect_ratio, response_format:"base64", n:1, prompt_optimizer:true }
 *   → { data: { image_base64: [ "<b64>" ] }, base_resp: { status_code, status_msg } }
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { Tool } from "../../src/agent/tools/tool.interface.js";
import { config } from "../../src/config.js";
import { db } from "../../src/storage/db.js";
import { installedPlugins, tenantPluginConfigs } from "../../src/storage/schema.js";
import { providerKeyService } from "../../src/agent/providers/provider-key-service.js";
import { credentialVault } from "../../src/agent/tools/credential-vault.js";
import { sendFileToConversation } from "../../src/utils/channel-delivery.js";
import { logger } from "../../src/utils/logger.js";

const GENERATION_TIMEOUT_MS = 60_000;
const ASPECT_RATIOS = new Set(["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"]);

/** Plugin enabled for tenant (platform toggle) AND IMAGEGEN_ENABLED config not "false". */
export async function isImagegenEnabledForTenant(tenantId: string): Promise<boolean> {
    try {
        const plugin = await db.query.installedPlugins.findFirst({
            where: eq(installedPlugins.name, "imagegen"),
        });
        if (!plugin || !plugin.enabled) return false;
        const override = await db.query.tenantPluginConfigs.findFirst({
            where: and(eq(tenantPluginConfigs.tenantId, tenantId), eq(tenantPluginConfigs.pluginId, plugin.id)),
        });
        if (override && override.enabled === false) return false;

        const envVars = await credentialVault.getEnvVars(tenantId);
        return (envVars["IMAGEGEN_ENABLED"] || "").trim().toLowerCase() !== "false";
    } catch (err) {
        logger.warn({ err, tenantId }, "imagegen enablement check failed");
        return false;
    }
}

export const imageGenerateTool: Tool = {
    name: "image_generate",
    description:
        "Generate an image from a text prompt (MiniMax image-01). The image is sent to the user's chat " +
        "when the channel supports it (Telegram), otherwise saved to your workspace. Billed per image " +
        "to the workspace's MiniMax account.",
    parameters: {
        type: "object",
        properties: {
            prompt: { type: "string", description: "Vivid, specific description of the image to create" },
            aspect_ratio: {
                type: "string",
                description: 'One of "1:1" (default), "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"',
            },
        },
        required: ["prompt"],
    },

    async execute({ tenantId, conversationId, args }) {
        try {
            if (!(await isImagegenEnabledForTenant(tenantId))) {
                return { result: JSON.stringify({ error: "Image generation is disabled for this workspace (Settings → Plugins → Image Generation)." }) };
            }

            const resolved = await providerKeyService.resolveKey(tenantId, "minimax");
            if (!resolved?.key) {
                return { result: JSON.stringify({ error: "No MiniMax API key connected — add one in Settings → AI Providers to generate images." }) };
            }

            const prompt = String(args.prompt || "").trim();
            if (!prompt) return { result: JSON.stringify({ error: "A prompt is required." }) };
            const aspectRatio = ASPECT_RATIOS.has(String(args.aspect_ratio)) ? String(args.aspect_ratio) : "1:1";

            const res = await fetch("https://api.minimax.io/v1/image_generation", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolved.key}` },
                body: JSON.stringify({
                    model: "image-01",
                    prompt,
                    aspect_ratio: aspectRatio,
                    response_format: "base64",
                    n: 1,
                    prompt_optimizer: true,
                }),
                signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
            });

            const j: any = await res.json().catch(() => null);
            const code = j?.base_resp?.status_code;
            if (!res.ok || (code !== undefined && code !== 0)) {
                if (code === 1002) return { result: JSON.stringify({ error: "MiniMax rate limit hit — try again in a minute." }) };
                if (code === 1008) return { result: JSON.stringify({ error: "MiniMax balance is empty — image generation needs a top-up on the MiniMax account." }) };
                return { result: JSON.stringify({ error: `Image generation failed: ${j?.base_resp?.status_msg || `HTTP ${res.status}`}` }) };
            }

            const b64 = j?.data?.image_base64?.[0];
            if (!b64) return { result: JSON.stringify({ error: "MiniMax returned no image data." }) };
            const buf = Buffer.from(b64, "base64");

            const agentId = (args._agentId as string) || conversationId;
            const dir = join(config.WORKSPACE_BASE_DIR, tenantId, agentId, "images");
            await mkdir(dir, { recursive: true });
            const filePath = join(dir, `gen-${Date.now()}.jpg`);
            await writeFile(filePath, buf);

            const delivery = await sendFileToConversation(tenantId, conversationId, filePath, prompt.slice(0, 200));

            return {
                result: JSON.stringify({
                    path: filePath,
                    bytes: buf.byteLength,
                    aspect_ratio: aspectRatio,
                    note: delivery.delivered
                        ? "image sent to the user's chat — tell them it's in this chat, don't give the file path"
                        : "saved to agent workspace (this channel can't display images)",
                }),
            };
        } catch (err: any) {
            return { result: JSON.stringify({ error: err?.message || "Image generation failed" }) };
        }
    },
};
