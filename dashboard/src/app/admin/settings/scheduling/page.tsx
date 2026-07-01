import { db } from "../../../../storage/db";
import { globalSettings, scheduledJobs, jobRuns, agentProfiles } from "../../../../storage/schema";
import { eq, desc, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import SaveButton from "../../../../components/SaveButton";
import { requireAdmin } from "../../../../utils/admin-auth";

export const dynamic = "force-dynamic";

async function saveSchedulingSettings(formData: FormData) {
    "use server";
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;

    try {
        const currentSettings = await db.query.globalSettings.findFirst({
            where: (table, { eq }) => eq(table.id, "root"),
        });
        const gwConfig: any = currentSettings?.gatewayConfig
            ? { ...(currentSettings.gatewayConfig as any) }
            : {};

        gwConfig.scheduling = {
            enabled: formData.get("enabled") === "on",
            max_jobs_per_tenant: parseInt(formData.get("maxJobsPerTenant") as string) || 50,
            max_jobs_per_agent: parseInt(formData.get("maxJobsPerAgent") as string) || 10,
            min_interval_seconds: parseInt(formData.get("minInterval") as string) || 300,
        };

        await db
            .insert(globalSettings)
            .values({ id: "root", gatewayConfig: gwConfig, updatedAt: new Date() })
            .onConflictDoUpdate({
                target: globalSettings.id,
                set: { gatewayConfig: gwConfig, updatedAt: new Date() },
            });

        revalidatePath("/admin/settings/scheduling");
    } catch (error) {
        console.error("Failed to save scheduling settings:", error);
    }
}

export default async function SchedulingSettingsPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const settings = await db.query.globalSettings.findFirst({
        where: (table, { eq }) => eq(table.id, "root"),
    });
    const gwConfig = (settings?.gatewayConfig || {}) as any;
    const sched = gwConfig.scheduling || {};

    // Get all active jobs with agent names for the overview
    const allJobs = await db
        .select({
            id: scheduledJobs.id,
            name: scheduledJobs.name,
            scheduleType: scheduledJobs.scheduleType,
            cronExpression: scheduledJobs.cronExpression,
            intervalSeconds: scheduledJobs.intervalSeconds,
            runAt: scheduledJobs.runAt,
            enabled: scheduledJobs.enabled,
            timezone: scheduledJobs.timezone,
            lastRunAt: scheduledJobs.lastRunAt,
            agentName: agentProfiles.name,
            tenantId: scheduledJobs.tenantId,
        })
        .from(scheduledJobs)
        .leftJoin(agentProfiles, eq(scheduledJobs.agentId, agentProfiles.id))
        .orderBy(desc(scheduledJobs.createdAt))
        .limit(50);

    const enabledCount = allJobs.filter((j) => j.enabled).length;

    return (
        <div className="p-8">
            <div className="mb-8">
                <a href="/admin/settings" className="text-sm text-[#F5A524] hover:text-[#FFC24B] mb-2 inline-block">&larr; Back to Settings</a>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-[#F5A524]/10 rounded-lg">
                        <ClockIcon className="w-6 h-6 text-[#F5A524]" />
                    </div>
                    <h1 className="text-3xl font-bold text-[#EDEDED] tracking-tight">Scheduling</h1>
                </div>
                <p className="text-[#8A8A90]">Configure global scheduling settings for cron jobs and scheduled tasks.</p>
            </div>

            <div className="space-y-6">
                {/* Settings Form */}
                <form action={saveSchedulingSettings} className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                    <div className="p-6 space-y-6">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="enabled"
                                defaultChecked={sched.enabled !== false}
                                className="w-4 h-4 text-[#F5A524] border-[#242429] rounded focus:ring-[#F5A524]"
                            />
                            <div>
                                <span className="text-sm font-medium text-[#EDEDED]">Enable Scheduling System</span>
                                <p className="text-xs text-[#8A8A90]">When disabled, no scheduled jobs will execute.</p>
                            </div>
                        </label>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Max Jobs per Tenant</label>
                                <input
                                    type="number"
                                    name="maxJobsPerTenant"
                                    defaultValue={sched.max_jobs_per_tenant || 50}
                                    min={1}
                                    className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#101012] text-[#EDEDED]"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Max Jobs per Agent</label>
                                <input
                                    type="number"
                                    name="maxJobsPerAgent"
                                    defaultValue={sched.max_jobs_per_agent || 10}
                                    min={1}
                                    className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#101012] text-[#EDEDED]"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Min Interval (seconds)</label>
                                <input
                                    type="number"
                                    name="minInterval"
                                    defaultValue={sched.min_interval_seconds || 300}
                                    min={60}
                                    className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#101012] text-[#EDEDED]"
                                />
                                <p className="text-xs text-[#5A5A61] mt-1">Minimum seconds between runs. Default: 300 (5 min).</p>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <SaveButton label="Save Scheduling Settings" />
                        </div>
                    </div>
                </form>

                {/* Active Jobs Overview */}
                <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                    <div className="p-6 border-b border-[#242429]">
                        <h2 className="text-lg font-semibold text-[#EDEDED]">All Scheduled Jobs</h2>
                        <p className="text-sm text-[#8A8A90] mt-1">{allJobs.length} total jobs, {enabledCount} enabled</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-[#8A8A90] border-b border-[#242429]">
                                    <th className="px-6 py-3 font-medium">Name</th>
                                    <th className="px-6 py-3 font-medium">Agent</th>
                                    <th className="px-6 py-3 font-medium">Schedule</th>
                                    <th className="px-6 py-3 font-medium">Timezone</th>
                                    <th className="px-6 py-3 font-medium">Status</th>
                                    <th className="px-6 py-3 font-medium">Last Run</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allJobs.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#5A5A61]">
                                            No scheduled jobs across any tenant.
                                        </td>
                                    </tr>
                                )}
                                {allJobs.map((job) => {
                                    const schedule =
                                        job.cronExpression ||
                                        (job.intervalSeconds ? `every ${job.intervalSeconds}s` : `once at ${job.runAt ? new Date(job.runAt).toLocaleString() : "—"}`);
                                    return (
                                        <tr key={job.id} className="border-b border-[#242429] hover:bg-[#101012]">
                                            <td className="px-6 py-3 text-sm font-medium text-[#EDEDED]">{job.name}</td>
                                            <td className="px-6 py-3 text-sm text-[#8A8A90]">{job.agentName || "—"}</td>
                                            <td className="px-6 py-3">
                                                <code className="text-xs bg-[#141417] text-[#B5B5BA] px-2 py-1 rounded">{schedule}</code>
                                            </td>
                                            <td className="px-6 py-3 text-sm text-[#8A8A90]">{job.timezone || "UTC"}</td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    job.enabled
                                                        ? "bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40"
                                                        : "bg-[#141417] text-[#8A8A90] border border-[#242429]"
                                                }`}>
                                                    {job.enabled ? "Enabled" : "Disabled"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-xs text-[#5A5A61]">
                                                {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "Never"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ClockIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
    );
}
