import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getErpNextCredentials, erpNextRequest, MISSING_CREDENTIALS_MSG } from "../client.js";

export const erpnextReportTool: Tool = {
    name: "erpnext_report",
    description:
        "Run an ERPNext report and return the results. Supports standard reports like " +
        "General Ledger, Profit and Loss Statement, Balance Sheet, Accounts Receivable, " +
        "Accounts Payable, Trial Balance, Stock Balance, and custom Script Reports.",
    parameters: {
        type: "object",
        properties: {
            report_name: {
                type: "string",
                description:
                    "Report name exactly as it appears in ERPNext (e.g. 'General Ledger', 'Profit and Loss Statement', " +
                    "'Accounts Receivable', 'Trial Balance', 'Stock Balance')",
            },
            filters: {
                type: "object",
                additionalProperties: true,
                description:
                    "Report filters as JSON. Common filters: company, from_date, to_date, cost_center, account. " +
                    'Dates must be in YYYY-MM-DD format. Example: {"company":"My Company","from_date":"2025-01-01","to_date":"2025-12-31"}',
            },
        },
        required: ["report_name"],
    },

    async execute({ tenantId, args }) {
        const creds = await getErpNextCredentials(tenantId);
        if (!creds) return { result: MISSING_CREDENTIALS_MSG };

        const reportName = args.report_name as string;
        const filters = args.filters || {};

        const res = await erpNextRequest(
            creds,
            "GET",
            `/api/method/frappe.client.get_report_data`,
            undefined,
            {
                report_name: reportName,
                filters: JSON.stringify(filters),
            }
        );

        if (!res.ok) return { result: res.error };

        const columns = res.data?.columns || [];
        const result = res.data?.result || [];

        return {
            result: JSON.stringify(
                {
                    report: reportName,
                    filters,
                    column_count: columns.length,
                    row_count: result.length,
                    columns: columns.map((c: any) => c.label || c.fieldname || c),
                    rows: result.slice(0, 50), // Cap at 50 rows to avoid token explosion
                },
                null,
                2
            ),
            metadata: { report: reportName, rowCount: result.length },
        };
    },
};
