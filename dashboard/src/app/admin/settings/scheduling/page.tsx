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
                <a href="/admin/settings" className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">&larr; Back to Settings</a>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-50 rounded-lg">
                        <ClockIcon className="w-6 h-6 text-amber-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Scheduling</h1>
                </div>
                <p className="text-slate-500">Configure global scheduling settings for cron jobs and scheduled tasks.</p>
            </div>

            <div className="space-y-6">
                {/* Settings Form */}
                <form action={saveSchedulingSettings} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 space-y-6">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="enabled"
                                defaultChecked={sched.enabled !== false}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <div>
                                <span className="text-sm font-medium text-slate-900">Enable Scheduling System</span>
                                <p className="text-xs text-slate-500">When disabled, no scheduled jobs will execute.</p>
                            </div>
                        </label>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Max Jobs per Tenant</label>
                                <input
                                    type="number"
                                    name="maxJobsPerTenant"
                                    defaultValue={sched.max_jobs_per_tenant || 50}
                                    min={1}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Max Jobs per Agent</label>
                                <input
                                    type="number"
                                    name="maxJobsPerAgent"
                                    defaultValue={sched.max_jobs_per_agent || 10}
                                    min={1}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Min Interval (seconds)</label>
                                <input
                                    type="number"
                                    name="minInterval"
                                    defaultValue={sched.min_interval_seconds || 300}
                                    min={60}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                                <p className="text-xs text-slate-400 mt-1">Minimum seconds between runs. Default: 300 (5 min).</p>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <SaveButton label="Save Scheduling Settings" />
                        </div>
                    </div>
                </form>

                {/* Active Jobs Overview */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">All Scheduled Jobs</h2>
                        <p className="text-sm text-slate-500 mt-1">{allJobs.length} total jobs, {enabledCount} enabled</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
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
                                        <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">
                                            No scheduled jobs across any tenant.
                                        </td>
                                    </tr>
                                )}
                                {allJobs.map((job) => {
                                    const schedule =
                                        job.cronExpression ||
                                        (job.intervalSeconds ? `every ${job.intervalSeconds}s` : `once at ${job.runAt ? new Date(job.runAt).toLocaleString() : "—"}`);
                                    return (
                                        <tr key={job.id} className="border-b border-slate-50 hover:bg-slate-50">
                                            <td className="px-6 py-3 text-sm font-medium text-slate-900">{job.name}</td>
                                            <td className="px-6 py-3 text-sm text-slate-500">{job.agentName || "—"}</td>
                                            <td className="px-6 py-3">
                                                <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">{schedule}</code>
                                            </td>
                                            <td className="px-6 py-3 text-sm text-slate-500">{job.timezone || "UTC"}</td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    job.enabled
                                                        ? "bg-green-50 text-green-700"
                                                        : "bg-slate-100 text-slate-500"
                                                }`}>
                                                    {job.enabled ? "Enabled" : "Disabled"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-xs text-slate-400">
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
