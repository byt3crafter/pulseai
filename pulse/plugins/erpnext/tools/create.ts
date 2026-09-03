import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getErpNextCredentials, erpNextRequest, normalizeDocPayload, MISSING_CREDENTIALS_MSG } from "../client.js";

export const erpnextCreateTool: Tool = {
    name: "erpnext_create",
    description:
        "Create a new ERPNext document. The document is saved as Draft by default. " +
        "Use erpnext_method with 'frappe.client.submit' to submit it after creation. " +
        "Provide all required fields for the DocType. " +
        "Journal Entry rows go in `accounts` using `debit_in_account_currency` / `credit_in_account_currency` " +
        "(plain `debit`/`credit` are read-only and recomputed). Child tables (e.g. Journal Entry Account) " +
        "cannot be created or queried on their own — always send them inside the parent document.",
    parameters: {
        type: "object",
        properties: {
            doctype: {
                type: "string",
                description: "ERPNext DocType name (e.g. 'Sales Invoice', 'Journal Entry')",
            },
            data: {
                type: "object",
                additionalProperties: true,
                description:
                    "Document field values as JSON. Include child table rows as arrays. " +
                    'Example for Sales Invoice: {"customer":"CUST-001","items":[{"item_code":"ITEM-001","qty":1,"rate":100}]}',
            },
        },
        required: ["doctype", "data"],
    },

    async execute({ tenantId, args }) {
        const creds = await getErpNextCredentials(tenantId, (args as any)._agentId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };

        const { doctype, data } = args as { doctype: string; data: Record<string, any> };
        const res = await erpNextRequest(creds, "POST", `/api/resource/${encodeURIComponent(doctype)}`, normalizeDocPayload(doctype, data));

        if (!res.ok) return { result: res.error };

        const name = res.data?.name || "unknown";
        return {
            result: JSON.stringify({ created: true, doctype, name, data: res.data }, null, 2),
            metadata: { doctype, name, action: "created" },
        };
    },
};
