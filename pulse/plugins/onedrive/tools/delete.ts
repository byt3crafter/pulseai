import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getOneDriveCredentials, graphRequest, itemRef, MISSING_CREDENTIALS_MSG } from "../client.js";

export const onedriveDeleteTool: Tool = {
    name: "onedrive_delete",
    description: "Delete a OneDrive file or folder (moves it to the recycle bin). Give a 'path' or 'item_id'.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Item path from the drive root, e.g. '/Reports/old.csv'." },
            item_id: { type: "string", description: "Item id (alternative to path)." },
        },
        required: [],
    },
    async execute({ tenantId, args }) {
        const creds = await getOneDriveCredentials(tenantId, (args as any)._agentId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };
        if (!args.path && !args.item_id) return { result: "Provide either 'path' or 'item_id'." };

        const ref = itemRef(creds, { path: args.path as string, item_id: args.item_id as string });
        const res = await graphRequest(tenantId, (args as any)._agentId, creds, "DELETE", ref, { expectText: true });
        if (!res.ok) return { result: res.error };
        return { result: JSON.stringify({ deleted: true, target: args.path || args.item_id }, null, 2), metadata: { deleted: true } };
    },
};
