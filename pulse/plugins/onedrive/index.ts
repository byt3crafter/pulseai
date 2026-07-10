/**
 * Microsoft OneDrive Plugin for Pulse AI
 *
 * Gives agents tools to work with files in OneDrive / Microsoft 365 via the
 * Microsoft Graph API — list, search, read, upload, share and manage files.
 *
 * Auth is OAuth2 (refresh-token grant). Credentials are stored per tenant
 * (or per agent) in the vault:
 *   MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REFRESH_TOKEN, MS_TENANT_ID (optional)
 *
 * The Microsoft Graph API itself is free — you only need a Microsoft/M365
 * account and a (free) Azure Entra app registration for the OAuth login.
 */

import { definePlugin } from "../../src/plugins/sdk/index.js";
import { PromptContext } from "../../src/plugins/sdk/types.js";
import { isPluginEnabledForTenant } from "../../src/plugins/tenant-access.js";
import { getOneDriveCredentials } from "./client.js";
import {
    onedriveListTool,
    onedriveSearchTool,
    onedriveGetTool,
    onedriveReadTool,
    onedriveUploadTool,
    onedriveCreateFolderTool,
    onedriveShareTool,
    onedriveDeleteTool,
} from "./tools/index.js";

const ONEDRIVE_PROMPT_CONTEXT = `
## OneDrive Integration — ACTIVE

Your OneDrive (Microsoft 365) connection is configured. You have LIVE access to this tenant's OneDrive.

### Behavior Rules
- **When asked "do you have access to OneDrive?":** Prove it — call \`onedrive_list\` on the root and report a couple of the files/folders you can see.
- **When asked to find a file:** Use \`onedrive_search\` with a query rather than guessing paths.
- **When asked to read a document:** Use \`onedrive_read\` for text files (.txt, .csv, .md, .json). For PDFs, images or Office files, use \`onedrive_share\` to return a link instead of trying to read raw bytes.
- **When saving a report you generated:** Use \`onedrive_upload\` with a clear path and filename.

### Available OneDrive Tools
- **onedrive_list** — List files/folders in a folder (default root)
- **onedrive_search** — Search the whole drive by name/content
- **onedrive_get** — Get metadata for one item
- **onedrive_read** — Read a text file's content
- **onedrive_upload** — Upload/overwrite a small text file
- **onedrive_create_folder** — Create a folder
- **onedrive_share** — Create a shareable link
- **onedrive_delete** — Delete a file/folder (to recycle bin)

### Guidelines
- Address items by **path** from the drive root (e.g. "/Reports/2026/jan.csv") or by **item_id**.
- Keep uploads to text-based files (reports, CSV, notes). For larger/binary files, share a link.
`;

export default definePlugin({
    name: "onedrive",
    version: "1.0.0",
    description: "Microsoft OneDrive integration — list, search, read, upload, share and manage files via Microsoft Graph",
    author: "Runstate",

    // Least-privilege: only Microsoft's Graph API + login host.
    permissions: {
        network: ["graph.microsoft.com", "login.microsoftonline.com"],
    },

    credentialSchema: [
        {
            name: "MS_CLIENT_ID",
            label: "Azure App (Client) ID",
            type: "text",
            placeholder: "00000000-0000-0000-0000-000000000000",
            required: true,
            helpText: "From your app registration in Microsoft Entra ID (Azure AD).",
        },
        {
            name: "MS_CLIENT_SECRET",
            label: "Client Secret",
            type: "secret",
            placeholder: "Enter client secret",
            required: true,
            helpText: "A client secret created for the app registration.",
        },
        {
            name: "MS_REFRESH_TOKEN",
            label: "Refresh Token",
            type: "secret",
            placeholder: "OAuth refresh token",
            required: true,
            helpText: "OAuth refresh token with Files.ReadWrite + offline_access. (One-click Connect coming soon.)",
        },
        {
            name: "MS_TENANT_ID",
            label: "Tenant ID",
            type: "text",
            placeholder: "common",
            required: false,
            helpText: "Your Azure AD tenant id, or leave as 'common'.",
        },
    ],

    tools: [
        onedriveListTool,
        onedriveSearchTool,
        onedriveGetTool,
        onedriveReadTool,
        onedriveUploadTool,
        onedriveCreateFolderTool,
        onedriveShareTool,
        onedriveDeleteTool,
    ],

    hooks: {
        "before-prompt-build": async (ctx: PromptContext): Promise<PromptContext | null> => {
            const enabled = await isPluginEnabledForTenant("onedrive", ctx.tenantId);
            if (!enabled) return null;

            const creds = await getOneDriveCredentials(ctx.tenantId);
            if (!creds) return null; // not configured — no change

            return { ...ctx, systemPrompt: ctx.systemPrompt + ONEDRIVE_PROMPT_CONTEXT };
        },
    },

    routes: [
        {
            method: "GET",
            path: "/status",
            handler: async (_request: any, reply: any) => {
                return reply.send({
                    plugin: "onedrive",
                    version: "1.0.0",
                    status: "active",
                    tools: [
                        "onedrive_list",
                        "onedrive_search",
                        "onedrive_get",
                        "onedrive_read",
                        "onedrive_upload",
                        "onedrive_create_folder",
                        "onedrive_share",
                        "onedrive_delete",
                    ],
                });
            },
        },
    ],
});
