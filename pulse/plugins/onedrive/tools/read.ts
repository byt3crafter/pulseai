import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getOneDriveCredentials, graphRequest, itemRef, MISSING_CREDENTIALS_MSG } from "../client.js";

const MAX_CHARS = 100_000;

export const onedriveReadTool: Tool = {
    name: "onedrive_read",
    description:
        "Read the text content of a OneDrive file (best for .txt, .csv, .md, .json, .xml). " +
        "Give a 'path' or 'item_id'. For binary files (images, PDFs, Office docs), use onedrive_share to get a link instead.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "File path from the drive root, e.g. '/notes/todo.txt'." },
            item_id: { type: "string", description: "File item id (alternative to path)." },
        },
        required: [],
    },
    async execute({ tenantId, args }) {
        const creds = await getOneDriveCredentials(tenantId, (args as any)._agentId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };
        if (!args.path && !args.item_id) return { result: "Provide either 'path' or 'item_id'." };

        const ref = itemRef(creds, { path: args.path as string, item_id: args.item_id as string });
        const res = await graphRequest<string>(tenantId, (args as any)._agentId, creds, "GET", `${ref}/content`, { expectText: true });
        if (!res.ok) return { result: res.error };

        let text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
        let truncated = false;
        if (text.length > MAX_CHARS) { text = text.slice(0, MAX_CHARS); truncated = true; }
        return {
            result: text + (truncated ? `\n\n…[truncated at ${MAX_CHARS} characters]` : ""),
            metadata: { chars: text.length, truncated },
        };
    },
};
