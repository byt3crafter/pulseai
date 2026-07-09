export type BusinessIntegrationRuntime = "plugin" | "planned";

export interface BusinessCredentialField {
    name: string;
    label: string;
    type: "url" | "text" | "secret";
    placeholder?: string;
    required?: boolean;
    helpText?: string;
}

export interface BusinessIntegrationDefinition {
    id: string;
    name: string;
    pluginName: string;
    category: "ERP" | "Accounting" | "API";
    runtime: BusinessIntegrationRuntime;
    description: string;
    setupNotes: string;
    credentialSchema: BusinessCredentialField[];
}

export const BUSINESS_INTEGRATION_CATALOG: BusinessIntegrationDefinition[] = [
    {
        id: "erpnext",
        name: "ERPNext",
        pluginName: "erpnext",
        category: "ERP",
        runtime: "plugin",
        description: "ERPNext/Frappe documents, reports, and whitelisted server methods.",
        setupNotes: "Runtime is available when the ERPNext plugin is installed and approved by an administrator.",
        credentialSchema: [
            {
                name: "ERPNEXT_URL",
                label: "ERPNext URL",
                type: "url",
                placeholder: "https://your-site.erpnext.com",
                required: true,
                helpText: "Base URL of your ERPNext instance.",
            },
            {
                name: "ERPNEXT_API_KEY",
                label: "API Key",
                type: "text",
                required: true,
                helpText: "Generated in ERPNext user API access settings.",
            },
            {
                name: "ERPNEXT_API_SECRET",
                label: "API Secret",
                type: "secret",
                required: true,
                helpText: "Secret paired with the ERPNext API key.",
            },
        ],
    },
    {
        id: "xero",
        name: "Xero",
        pluginName: "xero",
        category: "Accounting",
        runtime: "planned",
        description: "Xero contacts, invoices, bills, payments, and reports.",
        setupNotes: "Credential setup is available now; runtime tools require the Xero plugin/OAuth slice.",
        credentialSchema: [
            { name: "XERO_CLIENT_ID", label: "Client ID", type: "text", required: true },
            { name: "XERO_CLIENT_SECRET", label: "Client Secret", type: "secret", required: true },
            { name: "XERO_TENANT_ID", label: "Tenant ID", type: "text", required: true },
            { name: "XERO_REFRESH_TOKEN", label: "Refresh Token", type: "secret", required: false, helpText: "Temporary manual setup until OAuth connect is implemented." },
        ],
    },
    {
        id: "pastel",
        name: "Sage Pastel",
        pluginName: "pastel",
        category: "Accounting",
        runtime: "planned",
        description: "Sage Pastel company data through an API gateway or supported connector.",
        setupNotes: "Credential setup is available now; runtime tools require the Pastel connector slice.",
        credentialSchema: [
            { name: "PASTEL_BASE_URL", label: "Base URL", type: "url", required: true },
            { name: "PASTEL_API_KEY", label: "API Key", type: "secret", required: true },
            { name: "PASTEL_COMPANY_ID", label: "Company ID", type: "text", required: false },
        ],
    },
    {
        id: "generic-rest",
        name: "Generic REST API",
        pluginName: "generic-rest",
        category: "API",
        runtime: "planned",
        description: "Tenant-configured REST API access for business systems without a dedicated plugin.",
        setupNotes: "Credential setup is available now; runtime tools require the generic REST tool slice.",
        credentialSchema: [
            { name: "REST_API_BASE_URL", label: "Base URL", type: "url", required: true },
            { name: "REST_API_TOKEN", label: "API Token", type: "secret", required: false },
            { name: "REST_API_AUTH_HEADER", label: "Auth Header", type: "text", placeholder: "Authorization", required: false },
        ],
    },
];

export function getBusinessIntegrationDefinition(id: string): BusinessIntegrationDefinition | undefined {
    return BUSINESS_INTEGRATION_CATALOG.find((entry) => entry.id === id);
}
