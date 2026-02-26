import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getErpNextCredentials, erpNextRequest, MISSING_CREDENTIALS_MSG } from "../client.js";

export const erpnextUpdateTool: Tool = {
    name: "erpnext_update",
    description:
        "Update fields on an existing ERPNext document. Only the specified fields are changed. " +
        "Cannot update submitted documents — amend or cancel them first.",
    parameters: {
        type: "object",
        properties: {
            doctype: {
                type: "string",
                description: "ERPNext DocType name",
            },
            name: {
                type: "string",
                description: "Document name/ID to update",
            },
            data: {
                type: "object",
                description: 'Fields to update as JSON. Example: {"status":"Closed","notes":"Updated by agent"}',
            },
        },
        required: ["doctype", "name", "data"],
    },

    async execute({ tenantId, args }) {
        const creds = await getErpNextCredentials(tenantId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };

        const { doctype, name, data } = args as { doctype: string; name: string; data: Record<string, any> };
        const res = await erpNextRequest(
            creds,
            "PUT",
            `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
            data
        );

        if (!res.ok) return { result: res.error };

        return {
            result: JSON.stringify({ updated: true, doctype, name, data: res.data }, null, 2),
            metadata: { doctype, name, action: "updated" },
        };
    },
};
