import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getOneDriveCredentials, graphRequest, itemRef, MISSING_CREDENTIALS_MSG } from "../client.js";

export const onedriveShareTool: Tool = {
    name: "onedrive_share",
    description: "Create a shareable link to a OneDrive file or folder. Use for binary files (PDFs, images, Office docs) or to share with someone.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Item path from the drive root, e.g. '/Reports/jan.pdf'." },
            item_id: { type: "string", description: "Item id (alternative to path)." },
            access: { type: "string", description: "'view' (read-only, default) or 'edit'." },
            scope: { type: "string", description: "'organization' (default, anyone in your org) or 'anonymous' (anyone with the link)." },
        },
        required: [],
    },
    async execute({ tenantId, args }) {
        const creds = await getOneDriveCredentials(tenantId, (args as any)._agentId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };
        if (!args.path && !args.item_id) return { result: "Provide either 'path' or 'item_id'." };

        const ref = itemRef(creds, { path: args.path as string, item_id: args.item_id as string });
        const type = args.access === "edit" ? "edit" : "view";
        const scope = args.scope === "anonymous" ? "anonymous" : "organization";
        const res = await graphRequest(tenantId, (args as any)._agentId, creds, "POST", `${ref}/createLink`, {
            json: { type, scope },
        });
        if (!res.ok) return { result: res.error };
        const link = res.data?.link?.webUrl || "(no link returned)";
        return { result: JSON.stringify({ shared: true, access: type, scope, link }, null, 2), metadata: { link } };
    },
};
