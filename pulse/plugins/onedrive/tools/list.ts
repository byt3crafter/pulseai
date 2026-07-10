import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getOneDriveCredentials, graphRequest, itemRef, MISSING_CREDENTIALS_MSG } from "../client.js";

const SELECT = "id,name,size,webUrl,lastModifiedDateTime,folder,file";

export const onedriveListTool: Tool = {
    name: "onedrive_list",
    description:
        "List files and folders in a OneDrive folder. Defaults to the root. " +
        "Give either a folder 'path' (e.g. '/Reports') or an 'item_id'.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Folder path from the drive root, e.g. '/Reports/2026'. Omit for the root." },
            item_id: { type: "string", description: "Folder item id (alternative to path)." },
            limit: { type: "number", description: "Max items to return (default 50, max 200)." },
        },
        required: [],
    },
    async execute({ tenantId, args }) {
        const creds = await getOneDriveCredentials(tenantId, (args as any)._agentId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };

        const ref = itemRef(creds, { path: args.path as string, item_id: args.item_id as string });
        const limit = Math.min(Number(args.limit) || 50, 200);
        const res = await graphRequest(tenantId, (args as any)._agentId, creds, "GET", `${ref}/children`, {
            query: { $select: SELECT, $top: String(limit) },
        });
        if (!res.ok) return { result: res.error };

        const items = (res.data.value || []).map((i: any) => ({
            name: i.name,
            id: i.id,
            type: i.folder ? "folder" : "file",
            size: i.size,
            modified: i.lastModifiedDateTime,
            webUrl: i.webUrl,
        }));
        return {
            result: JSON.stringify({ folder: args.path || "/", count: items.length, items }, null, 2),
            metadata: { count: items.length },
        };
    },
};
