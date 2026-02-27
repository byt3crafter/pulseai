import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getErpNextCredentials, erpNextRequest, MISSING_CREDENTIALS_MSG } from "../client.js";

/**
 * Allowlisted server methods that are safe for agent use.
 * Keeps agents from calling arbitrary Frappe/ERPNext methods.
 */
const ALLOWED_METHODS = new Set([
    // Document lifecycle
    "frappe.client.submit",
    "frappe.client.cancel",
    "frappe.client.amend",

    // Utility
    "frappe.client.get_count",
    "frappe.client.get_list",
    "frappe.client.get_value",
    "frappe.client.set_value",

    // ERPNext specific
    "erpnext.accounts.utils.get_balance_on",
    "erpnext.stock.utils.get_stock_balance",
    "erpnext.accounts.party.get_party_account",
    "erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice",
    "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice",
    "erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice",
]);

export const erpnextMethodTool: Tool = {
    name: "erpnext_method",
    description:
        "Call a whitelisted ERPNext server method. Use this for operations like submitting documents, " +
        "cancelling documents, getting account balances, stock balances, and creating linked documents. " +
        "Allowed methods: " + Array.from(ALLOWED_METHODS).join(", "),
    parameters: {
        type: "object",
        properties: {
            method: {
                type: "string",
                description: "Fully qualified method name (e.g. 'frappe.client.submit')",
            },
            args: {
                type: "object",
                additionalProperties: true,
                description:
                    'Method arguments as JSON. For submit/cancel: {"doctype":"Sales Invoice","name":"SINV-00001"}. ' +
                    'For get_balance_on: {"account":"Debtors - TC","date":"2025-12-31"}',
            },
        },
        required: ["method"],
    },

    async execute({ tenantId, args: toolArgs }) {
        const creds = await getErpNextCredentials(tenantId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };

        const method = toolArgs.method as string;
        const methodArgs = (toolArgs.args as Record<string, any>) || {};

        if (!ALLOWED_METHODS.has(method)) {
            return {
                result:
                    `Method "${method}" is not in the allowlist. Allowed methods:\n` +
                    Array.from(ALLOWED_METHODS).map((m) => `- ${m}`).join("\n"),
            };
        }

        const res = await erpNextRequest(creds, "POST", `/api/method/${method}`, methodArgs);

        if (!res.ok) return { result: res.error };

        return {
            result: JSON.stringify({ method, success: true, data: res.data }, null, 2),
            metadata: { method },
        };
    },
};
