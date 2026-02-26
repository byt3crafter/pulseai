import { getAgentSchedules, getJobRunHistory, createSchedule, toggleSchedule, deleteSchedule } from "./actions";
import { db } from "../../../../../storage/db";
import { agentProfiles } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AgentSchedulesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: agentId } = await params;

    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const agent = await db.query.agentProfiles.findFirst({ where: eq(agentProfiles.id, agentId) });
    if (!agent) return notFound();

    const schedules = await getAgentSchedules(agentId);

    return (
        <div className="p-8">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 rounded-lg">
                        <ClockIcon className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Schedules — {agent.name}</h1>
                        <p className="text-slate-500 text-sm">Manage cron jobs and scheduled tasks for this agent.</p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Create Schedule Form */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Create Schedule</h2>
                        <p className="text-sm text-slate-500 mt-1">Add a new scheduled job for this agent.</p>
                    </div>
                    <form action={createSchedule} className="p-6 space-y-4">
                        <input type="hidden" name="agentId" value={agentId} />
                        <input type="hidden" name="tenantId" value={agent.tenantId} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Job Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    placeholder="Daily invoice check"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Schedule Type</label>
                                <select
                                    name="scheduleType"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"
                                >
                                    <option value="cron">Cron Expression</option>
                                    <option value="interval">Interval</option>
                                    <option value="once">One-time</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Cron Expression</label>
                                <input
                                    type="text"
                                    name="cronExpression"
                                    placeholder="0 8 * * 1-5"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                                <p className="text-xs text-slate-400 mt-1">e.g., &quot;0 8 * * 1-5&quot; = weekdays at 8am</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Interval (seconds)</label>
                                <input
                                    type="number"
                                    name="intervalSeconds"
                                    placeholder="3600"
                                    min="300"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                                <p className="text-xs text-slate-400 mt-1">Min 300s (5 min). For interval type.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Run At (ISO datetime)</label>
                                <input
                                    type="datetime-local"
                                    name="runAt"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                                <p className="text-xs text-slate-400 mt-1">For one-time type.</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
                            <select
                                name="timezone"
                                defaultValue="UTC"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"
                            >
                                <option value="UTC">UTC</option>
                                <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
                                <option value="America/New_York">America/New_York (EST)</option>
                                <option value="America/Chicago">America/Chicago (CST)</option>
                                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                                <option value="Europe/London">Europe/London (GMT)</option>
                                <option value="Europe/Paris">Europe/Paris (CET)</option>
                                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                                <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                                <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Message / Instruction</label>
                            <textarea
                                name="message"
                                required
                                rows={3}
                                placeholder="Check ERPNext for unpaid invoices over R50,000 and send a summary."
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                            />
                            <p className="text-xs text-slate-400 mt-1">This is sent to the agent as a user message on each run.</p>
                        </div>

                        <div className="flex justify-end">
                            <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors text-sm">
                                Create Schedule
                            </button>
                        </div>
                    </form>
                </div>

                {/* Schedules Table */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Scheduled Jobs</h2>
                        <p className="text-sm text-slate-500 mt-1">{schedules.length} total jobs</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                    <th className="px-6 py-3 font-medium">Name</th>
                                    <th className="px-6 py-3 font-medium">Schedule</th>
                                    <th className="px-6 py-3 font-medium">Timezone</th>
                                    <th className="px-6 py-3 font-medium">Status</th>
                                    <th className="px-6 py-3 font-medium">Last Run</th>
                                    <th className="px-6 py-3 font-medium">Webhook</th>
                                    <th className="px-6 py-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {schedules.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">
                                            No scheduled jobs. Create one above or the agent can use schedule_job tool.
                                        </td>
                                    </tr>
                                )}
                                {schedules.map((job) => {
                                    const schedule =
                                        job.cronExpression ||
                                        (job.intervalSeconds ? `every ${job.intervalSeconds}s` : `once at ${job.runAt ? new Date(job.runAt).toLocaleString() : "—"}`);
                                    return (
                                        <tr key={job.id} className="border-b border-slate-50 hover:bg-slate-50">
                                            <td className="px-6 py-3">
                                                <div className="text-sm font-medium text-slate-900">{job.name}</div>
                                                <div className="text-xs text-slate-400 truncate max-w-xs">{job.message}</div>
                                            </td>
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
                                            <td className="px-6 py-3">
                                                {job.webhookToken && (
                                                    <code className="text-[10px] bg-slate-50 text-slate-400 px-1.5 py-0.5 rounded break-all max-w-[120px] inline-block truncate">
                                                        {job.webhookToken.substring(0, 12)}...
                                                    </code>
                                                )}
                                            </td>
                                            <td className="px-6 py-3">
                                                <div className="flex gap-2">
                                                    <form action={toggleSchedule}>
                                                        <input type="hidden" name="jobId" value={job.id} />
                                                        <input type="hidden" name="agentId" value={agentId} />
                                                        <input type="hidden" name="enabled" value={String(job.enabled)} />
                                                        <button type="submit" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                                                            {job.enabled ? "Disable" : "Enable"}
                                                        </button>
                                                    </form>
                                                    <form action={deleteSchedule}>
                                                        <input type="hidden" name="jobId" value={job.id} />
                                                        <input type="hidden" name="agentId" value={agentId} />
                                                        <button type="submit" className="text-xs text-red-600 hover:text-red-800 font-medium">
                                                            Delete
                                                        </button>
                                                    </form>
                                                </div>
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
