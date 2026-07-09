/**
 * Image Generation Plugin for Pulse AI
 *
 * Gives agents an `image_generate` tool backed by MiniMax image-01, using the
 * tenant's existing MiniMax API key (Settings → AI Providers). Generated
 * images are saved to the agent's workspace and delivered straight into the
 * conversation's chat (Telegram) via the shared channel-delivery helper.
 *
 * Enable/disable: platform plugin approval + per-tenant plugin config
 * (IMAGEGEN_ENABLED, default on) + per-agent Tool Policy — same three layers
 * as every other plugin.
 */

import { definePlugin } from "../../src/plugins/sdk/index.js";
import { PromptContext } from "../../src/plugins/sdk/types.js";
import { imageGenerateTool, isImagegenEnabledForTenant } from "./tool.js";

const IMAGEGEN_PROMPT_CONTEXT = `
## Image Generation — ACTIVE

You can create images with the \`image_generate\` tool (MiniMax image-01).

### Behavior Rules
- When the user asks you to draw/create/generate a picture, CALL \`image_generate\` — don't describe what you would draw.
- Write a vivid, specific prompt (subject, style, lighting, composition). The user's words + your judgement.
- Pick an aspect_ratio that fits: "1:1" default, "16:9" landscapes/banners, "9:16" phone wallpapers/stories.
- The tool result tells you whether the image was sent to the user's chat — if so, say it's in the chat; never paste file paths.
- If generation fails due to quota/balance, tell the user plainly their MiniMax account needs a top-up.
`;

export default definePlugin({
    name: "imagegen",
    version: "1.0.0",
    description: "Image generation — agents create images with MiniMax image-01 and send them into the chat.",
    author: "Pulse AI",

    permissions: {
        network: ["api.minimax.io"],
        commands: [],
        filesystem: ["${WORKSPACE_BASE_DIR}/<tenantId>/<agentId>/images"],
    },

    credentialSchema: [
        {
            name: "IMAGEGEN_ENABLED",
            label: "Enable Image Generation",
            type: "text",
            placeholder: "true",
            required: false,
            helpText:
                'Type "false" to disable the image_generate tool for this workspace. Default: enabled. ' +
                "Uses your MiniMax API key from Settings → AI Providers (image-01 is billed per image).",
        },
    ],

    tools: [imageGenerateTool],

    hooks: {
        "before-prompt-build": async (ctx: PromptContext): Promise<PromptContext | null> => {
            try {
                if (await isImagegenEnabledForTenant(ctx.tenantId)) {
                    return { ...ctx, systemPrompt: ctx.systemPrompt + IMAGEGEN_PROMPT_CONTEXT };
                }
            } catch {
                // Non-fatal — skip guidance on any error.
            }
            return null;
        },
    },
});
