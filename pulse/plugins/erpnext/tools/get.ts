import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getErpNextCredentials, erpNextRequest, MISSING_CREDENTIALS_MSG } from "../client.js";

export const erpnextGetTool: Tool = {
    name: "erpnext_get",
    description:
        "Get a single ERPNext document by DocType and name. Returns all fields including child tables. " +
        "Use this to view full details of an invoice, order, customer, item, etc.",
    parameters: {
        type: "object",
        properties: {
            doctype: {
                type: "string",
                description: "ERPNext DocType name (e.g. 'Sales Invoice', 'Customer')",
            },
            name: {
                type: "string",
                description: "Document name/ID (e.g. 'SINV-00001', 'CUST-00001')",
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
            "GET",
            `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
        );

        if (!res.ok) return { result: res.error };

        return {
            result: JSON.stringify(res.data, null, 2),
            metadata: { doctype, name },
        };
    },
};
