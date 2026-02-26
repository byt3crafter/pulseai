import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getErpNextCredentials, erpNextRequest, MISSING_CREDENTIALS_MSG } from "../client.js";

export const erpnextDeleteTool: Tool = {
    name: "erpnext_delete",
    description:
        "Delete an ERPNext document. Only works on Draft or Cancelled documents. " +
        "Submitted documents must be cancelled first using erpnext_method with 'frappe.client.cancel'.",
    parameters: {
        type: "object",
        properties: {
            doctype: {
                type: "string",
                description: "ERPNext DocType name",
            },
            name: {
                type: "string",
                description: "Document name/ID to delete",
            },
        },
        required: ["doctype", "name"],
    },

    async execute({ tenantId, args }) {
        const creds = await getErpNextCredentials(tenantId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };

        const { doctype, name } = args as { doctype: string; name: string };
        const res = await erpNextRequest(
            creds,
            "DELETE",
            `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
        );

        if (!res.ok) return { result: res.error };

        return {
            result: JSON.stringify({ deleted: true, doctype, name }, null, 2),
            metadata: { doctype, name, action: "deleted" },
        };
    },
};
