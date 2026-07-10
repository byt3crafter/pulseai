import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getOneDriveCredentials, graphRequest, itemRef, MISSING_CREDENTIALS_MSG } from "../client.js";

export const onedriveGetTool: Tool = {
    name: "onedrive_get",
    description: "Get metadata for a single OneDrive file or folder (size, type, web URL, timestamps). Give a 'path' or 'item_id'.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Item path from the drive root, e.g. '/Reports/jan.xlsx'." },
            item_id: { type: "string", description: "Item id (alternative to path)." },
        },
        required: [],
    },
    async execute({ tenantId, args }) {
        const creds = await getOneDriveCredentials(tenantId, (args as any)._agentId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };
        if (!args.path && !args.item_id) return { result: "Provide either 'path' or 'item_id'." };

        const ref = itemRef(creds, { path: args.path as string, item_id: args.item_id as string });
        const res = await graphRequest(tenantId, (args as any)._agentId, creds, "GET", ref, {
            query: { $select: "id,name,size,webUrl,lastModifiedDateTime,createdDateTime,folder,file,parentReference" },
        });
        if (!res.ok) return { result: res.error };
        return { result: JSON.stringify(res.data, null, 2), metadata: { id: res.data.id, name: res.data.name } };
    },
};
