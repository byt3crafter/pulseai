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
];

export function getBusinessIntegrationDefinition(id: string): BusinessIntegrationDefinition | undefined {
    return BUSINESS_INTEGRATION_CATALOG.find((entry) => entry.id === id);
}
