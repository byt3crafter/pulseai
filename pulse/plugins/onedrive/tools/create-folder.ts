import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getOneDriveCredentials, graphRequest, itemRef, MISSING_CREDENTIALS_MSG } from "../client.js";

export const onedriveCreateFolderTool: Tool = {
    name: "onedrive_create_folder",
    description: "Create a new folder in OneDrive under the root or a given parent folder.",
    parameters: {
        type: "object",
        properties: {
            name: { type: "string", description: "New folder name." },
            parent_path: { type: "string", description: "Parent folder path (optional, default root), e.g. '/Reports'." },
        },
        required: ["name"],
    },
    async execute({ tenantId, args }) {
        const creds = await getOneDriveCredentials(tenantId, (args as any)._agentId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };

        const ref = itemRef(creds, { path: args.parent_path as string });
        const res = await graphRequest(tenantId, (args as any)._agentId, creds, "POST", `${ref}/children`, {
            json: { name: args.name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" },
        });
        if (!res.ok) return { result: res.error };
        return {
            result: JSON.stringify({ created: true, name: res.data.name, id: res.data.id, webUrl: res.data.webUrl }, null, 2),
            metadata: { id: res.data.id, name: res.data.name },
        };
    },
};
