import { getGlobalSettings, getScheduledJobs, getModelPricingList, getProviderKeyStatuses, getEmailSettings, getSsoSettings } from "./actions";
import { getExecSafetySettings, getAuditLogs, getGlobalPolicyRules } from "./exec-safety/actions";
import { currentAccess } from "../../../utils/access";
import { getDeploymentFlags } from "../../../utils/branding";
import AdminSettingsClient from "./AdminSettingsClient";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const params = await searchParams;
    const tab = params.tab || "providers";

    const access = await currentAccess();
    const canWrite = access.can("platform.settings.write");
    const canBilling = access.can("platform.billing.write");

    const [settings, execSafety, auditLogs, policyRules, allJobs, modelPricingData, providerStatuses, emailSettings, ssoSettings, deploymentFlags] = await Promise.all([
        getGlobalSettings(),
        getExecSafetySettings(),
        getAuditLogs(0, 50),
        getGlobalPolicyRules(),
        getScheduledJobs(),
        getModelPricingList(),
        getProviderKeyStatuses(),
        getEmailSettings(),
        getSsoSettings(),
        getDeploymentFlags(),
    ]);

    const gwConfig = ((settings as any).gatewayConfig || {}) as any;

    return (
        <AdminSettingsClient
            tab={tab}
            settings={settings}
            execSafety={execSafety}
            auditLogs={auditLogs}
            policyRules={policyRules}
            memoryConfig={gwConfig.memory_system || {}}
            sandboxConfig={gwConfig.python_sandbox || {}}
            schedulingConfig={gwConfig.scheduling || {}}
            allJobs={allJobs}
            defaultSkills={Array.isArray(gwConfig.defaultSkills) ? gwConfig.defaultSkills : []}
            modelPricing={modelPricingData}
            providerStatuses={providerStatuses}
            emailSettings={emailSettings}
            ssoSettings={ssoSettings}
            standaloneMode={deploymentFlags.standaloneMode}
            canWrite={canWrite}
            canBilling={canBilling}
        />
    );
}
