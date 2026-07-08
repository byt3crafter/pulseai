/**
 * Playwright Browser Plugin for Pulse AI
 *
 * Gives agents real browser tools — navigate, screenshot, click, fill forms,
 * and extract page content — driven by a system Chromium install via
 * playwright-core (no bundled browser download).
 *
 * Config: PLAYWRIGHT_ALLOW_PRIVATE_NETWORK (optional, default "false"),
 * stored via Dashboard > Settings > Plugins like any other plugin credential.
 */

import { definePlugin } from "../../src/plugins/sdk/index.js";
import { PromptContext } from "../../src/plugins/sdk/types.js";
import { isPluginEnabledForTenant, closeAllSessions } from "./client.js";
import {
    browserNavigateTool,
    browserScreenshotTool,
    browserClickTool,
    browserFillTool,
    browserExtractTool,
    browserCloseTool,
    browserSaveImageTool,
} from "./tools/index.js";

const PLAYWRIGHT_PROMPT_CONTEXT = `
## Browser Tools — ACTIVE

You have a real, headless Chromium browser available through the browser_* tools.

### Available Tools
- **browser_navigate** — Go to a URL. ALWAYS call this first — it creates your browser session.
- **browser_click** — Click an element by CSS selector, or by its visible text.
- **browser_fill** — Fill one or more form fields, optionally submitting afterward.
- **browser_extract** — Pull structured content off the page: visible text, all links, or the title.
- **browser_screenshot** — Capture the current page as an image.
- **browser_save_image** — Download an image by URL; it is sent to the user's chat (Telegram) or saved to your workspace.
- **browser_close** — Close your browser session when you're done with it.

### Behavior Rules
- Always call \`browser_navigate\` before any other browser_* tool — every other tool operates on the
  page from your most recent navigation, and will error if no session exists yet.
- \`browser_screenshot\` and \`browser_save_image\` deliver the image straight into the user's chat when
  the channel supports it (Telegram) — the tool result says whether it was sent. Only mention a file path
  when delivery wasn't possible. You cannot "see" the images yourself.
- \`browser_extract\` reads structured page content only (text/links/title) — it cannot run custom
  JavaScript on the page.
- Your browser session is private to you and auto-closes after a few minutes of inactivity, or when you
  call \`browser_close\`.
- Navigation to internal/private network addresses is blocked by default for security. If a request to
  an internal site fails for that reason, tell the user their admin can enable private network access
  for this integration in Settings if that's genuinely needed.
`;

export default definePlugin({
    name: "playwright",
    version: "1.0.0",
    description: "Browser automation — navigate, screenshot, click, fill forms, and extract content from web pages",
    author: "Pulse AI",

    // Least-privilege: outbound HTTP(S) to whatever the agent navigates to (SSRF-guarded
    // by default), no shell commands, and file writes confined to each agent's own
    // workspace screenshots folder.
    permissions: {
        network: ["*"],
        commands: [],
        filesystem: ["${WORKSPACE_BASE_DIR}/<tenantId>/<agentId>/screenshots"],
    },

    credentialSchema: [
        {
            name: "PLAYWRIGHT_ALLOW_PRIVATE_NETWORK",
            label: "Allow Private Network Access",
            type: "text",
            placeholder: "false",
            required: false,
            helpText:
                'Type "true" to let this tenant\'s agents navigate to internal/private network addresses ' +
                "(intranet access). Default: false — internal/loopback/link-local hosts are blocked.",
        },
        {
            name: "PLAYWRIGHT_ENABLE_IMAGE_FETCH",
            label: "Allow Image Downloads (browser_save_image)",
            type: "text",
            placeholder: "true",
            required: false,
            helpText:
                'Type "false" to disable the browser_save_image tool (downloading images from the web ' +
                "and sending them into the chat). Default: enabled.",
        },
    ],

    tools: [
        browserNavigateTool,
        browserScreenshotTool,
        browserClickTool,
        browserFillTool,
        browserExtractTool,
        browserCloseTool,
        browserSaveImageTool,
    ],

    hooks: {
        "before-prompt-build": async (ctx: PromptContext): Promise<PromptContext | null> => {
            // Only inject usage guidance if this tenant hasn't had the plugin disabled.
            const enabled = await isPluginEnabledForTenant(ctx.tenantId, "playwright");
            if (!enabled) return null; // no change

            return {
                ...ctx,
                systemPrompt: ctx.systemPrompt + PLAYWRIGHT_PROMPT_CONTEXT,
            };
        },

        "gateway-stop": async (): Promise<void> => {
            await closeAllSessions();
        },
    },
});
