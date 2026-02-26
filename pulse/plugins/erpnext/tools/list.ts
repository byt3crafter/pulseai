import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getErpNextCredentials, erpNextRequest, MISSING_CREDENTIALS_MSG } from "../client.js";

export const erpnextListTool: Tool = {
    name: "erpnext_list",
    description:
        "List or search ERPNext documents. Supports filters, field selection, pagination, and sorting. " +
        "Use this to find invoices, orders, customers, items, journal entries, etc.",
    parameters: {
        type: "object",
        properties: {
            doctype: {
                type: "string",
                description: "ERPNext DocType name (e.g. 'Sales Invoice', 'Customer', 'Item', 'Journal Entry')",
            },
            filters: {
                type: "array",
                description:
                    'Filter array — each element is [field, operator, value]. ' +
                    'Operators: =, !=, >, <, >=, <=, like, not like, in, not in, between. ' +
                    'Example: [["status","=","Unpaid"],["grand_total",">",1000]]',
            },
            fields: {
                type: "array",
                description:
                    'Fields to return (default: ["name"]). Use ["*"] for all fields. ' +
                    'Example: ["name","customer","grand_total","status"]',
            },
            order_by: {
                type: "string",
                description: 'Sort order (default: "modified desc"). Example: "creation desc", "grand_total asc"',
            },
            limit_page_length: {
                type: "number",
                description: "Number of results to return (default: 20, max: 100)",
            },
            limit_start: {
                type: "number",
                description: "Offset for pagination (default: 0)",
            },
        },
        required: ["doctype"],
    },

    async execute({ tenantId, args }) {
        const creds = await getErpNextCredentials(tenantId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };

        const doctype = args.doctype as string;
        const query: Record<string, string> = {};

        if (args.filters) query.filters = JSON.stringify(args.filters);
        if (args.fields) query.fields = JSON.stringify(args.fields);
        if (args.order_by) query.order_by = args.order_by;

        const limit = Math.min(Number(args.limit_page_length) || 20, 100);
        query.limit_page_length = String(limit);
        if (args.limit_start) query.limit_start = String(args.limit_start);

        const res = await erpNextRequest(creds, "GET", `/api/resource/${encodeURIComponent(doctype)}`, undefined, query);

        if (!res.ok) return { result: res.error };

        const records = Array.isArray(res.data) ? res.data : [];
        return {
            result: JSON.stringify({ doctype, count: records.length, records }, null, 2),
            metadata: { doctype, count: records.length },
        };
    },
};
