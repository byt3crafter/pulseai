import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getOneDriveCredentials, graphRequest, MISSING_CREDENTIALS_MSG } from "../client.js";

export const onedriveSearchTool: Tool = {
    name: "onedrive_search",
    description: "Search the whole OneDrive for files and folders matching a query (name or content).",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "Search text, e.g. 'invoice January' or 'price list.xlsx'." },
            limit: { type: "number", description: "Max results (default 25, max 100)." },
        },
        required: ["query"],
    },
    async execute({ tenantId, args }) {
        const creds = await getOneDriveCredentials(tenantId, (args as any)._agentId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };

        const q = String(args.query).replace(/'/g, "''"); // escape single quotes for the OData function
        const limit = Math.min(Number(args.limit) || 25, 100);
        const res = await graphRequest(tenantId, (args as any)._agentId, creds, "GET",
            `${creds.drivePath}/root/search(q='${encodeURIComponent(q)}')`,
            { query: { $top: String(limit), $select: "id,name,size,webUrl,lastModifiedDateTime,folder,file" } });
        if (!res.ok) return { result: res.error };

        const items = (res.data.value || []).map((i: any) => ({
            name: i.name, id: i.id, type: i.folder ? "folder" : "file", size: i.size, webUrl: i.webUrl,
        }));
        return { result: JSON.stringify({ query: args.query, count: items.length, items }, null, 2), metadata: { count: items.length } };
    },
};
