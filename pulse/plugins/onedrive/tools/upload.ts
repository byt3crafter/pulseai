import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getOneDriveCredentials, graphRequest, itemRef, MISSING_CREDENTIALS_MSG } from "../client.js";

export const onedriveUploadTool: Tool = {
    name: "onedrive_upload",
    description:
        "Upload/overwrite a small text file in OneDrive (e.g. a generated report, CSV or note). " +
        "Give the full destination 'path' including the file name, and the text 'content'. Best for files under ~4 MB.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Destination path incl. filename, e.g. '/Reports/2026/jan-summary.csv'." },
            content: { type: "string", description: "Text content to write to the file." },
            content_type: { type: "string", description: "MIME type (optional, default text/plain). e.g. 'text/csv', 'application/json'." },
        },
        required: ["path", "content"],
    },
    async execute({ tenantId, args }) {
        const creds = await getOneDriveCredentials(tenantId, (args as any)._agentId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };

        const ref = itemRef(creds, { path: args.path as string });
        const res = await graphRequest(tenantId, (args as any)._agentId, creds, "PUT", `${ref}/content`, {
            rawBody: String(args.content),
            contentType: (args.content_type as string) || "text/plain",
        });
        if (!res.ok) return { result: res.error };
        return {
            result: JSON.stringify({ uploaded: true, name: res.data.name, id: res.data.id, webUrl: res.data.webUrl, size: res.data.size }, null, 2),
            metadata: { id: res.data.id, name: res.data.name },
        };
    },
};
