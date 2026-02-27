/**
 * ERPNext Plugin for Pulse AI
 *
 * Gives agents direct tools for interacting with ERPNext — no Python scripting
 * required for common operations like listing invoices, creating documents,
 * running reports, and calling server methods.
 *
 * Credentials: ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET
 * (stored via Dashboard > Settings > API Credentials)
 */

import { definePlugin } from "../../src/plugins/sdk/index.js";
import { PromptContext } from "../../src/plugins/sdk/types.js";
import { getErpNextCredentials } from "./client.js";
import {
    erpnextListTool,
    erpnextGetTool,
    erpnextCreateTool,
    erpnextUpdateTool,
    erpnextDeleteTool,
    erpnextReportTool,
    erpnextMethodTool,
} from "./tools/index.js";

const ERPNEXT_PROMPT_CONTEXT = `
## ERPNext Integration — ACTIVE

Your ERPNext connection is configured and credentials are loaded. You have LIVE access to this tenant's ERPNext instance.

### Behavior Rules
- **When asked "do you have access to ERPNext?" or similar:** Don't just say yes. PROVE it — call \`erpnext_list\` with doctype "Company" and limit 1 to verify the connection is live, then tell the user what company/instance you're connected to.
- **When asked to fetch data or run a report:** Just DO it. Don't ask "which company?" if you can call \`erpnext_list\` on the Company doctype first to discover it yourself. Only ask when there's genuine ambiguity you can't resolve.
- **When asked for a report:** Pick the right report type and run it. If the user says "report for January", infer the current year unless told otherwise. Use \`erpnext_report\` directly.

### Available ERPNext Tools
- **erpnext_list** — Search/list documents with filters, fields, pagination
- **erpnext_get** — Get a single document with all details
- **erpnext_create** — Create a new document (saved as Draft)
- **erpnext_update** — Update fields on an existing document
- **erpnext_delete** — Delete a Draft or Cancelled document
- **erpnext_report** — Run financial and stock reports
- **erpnext_method** — Call whitelisted server methods (submit, cancel, etc.)

### Common DocTypes
- **Accounting:** Sales Invoice, Purchase Invoice, Payment Entry, Journal Entry, GL Entry
- **Selling:** Quotation, Sales Order, Customer
- **Buying:** Purchase Order, Supplier, Request for Quotation
- **Stock:** Item, Stock Entry, Delivery Note, Purchase Receipt, Warehouse
- **HR:** Employee, Salary Slip, Leave Application, Attendance

### Important Guidelines
- Dates must be in **YYYY-MM-DD** format (e.g. 2025-01-15)
- DocType names are **Title Case** with spaces (e.g. "Sales Invoice", not "sales_invoice")
- Document names are case-sensitive (e.g. "SINV-00001")
- New documents are created as **Draft** — use erpnext_method with frappe.client.submit to submit
- Submitted documents cannot be edited — cancel and amend instead
- Use filters to narrow results: [["status","=","Unpaid"],["posting_date",">=","2025-01-01"]]
- For financial reports, always specify the company and date range
`;

export default definePlugin({
    name: "erpnext",
    version: "1.0.0",
    description: "ERPNext integration — CRUD, reports, and server methods for business data management",
    author: "Pulse AI",

    credentialSchema: [
        {
            name: "ERPNEXT_URL",
            label: "ERPNext URL",
            type: "url",
            placeholder: "https://your-site.erpnext.com",
            required: true,
            helpText: "Base URL of your ERPNext instance",
        },
        {
            name: "ERPNEXT_API_KEY",
            label: "API Key",
            type: "text",
            placeholder: "e.g. abc123def456",
            required: true,
            helpText: "Found in ERPNext > User Settings > API Access",
        },
        {
            name: "ERPNEXT_API_SECRET",
            label: "API Secret",
            type: "secret",
            placeholder: "Enter API secret",
            required: true,
            helpText: "Generated alongside the API key",
        },
    ],

    tools: [
        erpnextListTool,
        erpnextGetTool,
        erpnextCreateTool,
        erpnextUpdateTool,
        erpnextDeleteTool,
        erpnextReportTool,
        erpnextMethodTool,
    ],

    hooks: {
        "before-prompt-build": async (ctx: PromptContext): Promise<PromptContext | null> => {
            // Only inject context if tenant has ERPNext credentials configured
            const creds = await getErpNextCredentials(ctx.tenantId);
            if (!creds) return null; // no change

            return {
                ...ctx,
                systemPrompt: ctx.systemPrompt + ERPNEXT_PROMPT_CONTEXT,
            };
        },
    },

    routes: [
        {
            method: "POST",
            path: "/webhook",
            handler: async (request: any, reply: any) => {
                const body = request.body || {};
                const event = body.event || "unknown";
                const doctype = body.doctype || "unknown";
                const name = body.name || "unknown";

                // Log the webhook for now — future: trigger agent actions
                request.log.info({ event, doctype, name }, "ERPNext webhook received");

                return reply.send({ status: "ok", event, doctype, name });
            },
        },
        {
            method: "GET",
            path: "/status",
            handler: async (_request: any, reply: any) => {
                return reply.send({
                    plugin: "erpnext",
                    version: "1.0.0",
                    status: "active",
                    tools: [
                        "erpnext_list",
                        "erpnext_get",
                        "erpnext_create",
                        "erpnext_update",
                        "erpnext_delete",
                        "erpnext_report",
                        "erpnext_method",
                    ],
                });
            },
        },
    ],
});
