import { getAgentSchedules, getJobRunHistory, createSchedule, updateSchedule, toggleSchedule, deleteSchedule } from "./actions";
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
        <div className="mx-auto w-full max-w-page px-6 py-7 sm:px-10 sm:py-9">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-500 hover:text-indigo-400 mb-2 inline-block transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                        <ClockIcon className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-pulse-text">Schedules — {agent.name}</h1>
                        <p className="text-pulse-muted text-sm">Manage cron jobs and scheduled tasks for this agent.</p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Create Schedule Form */}
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Create Schedule</h2>
                        <p className="text-sm text-pulse-muted mt-1">Add a new scheduled job for this agent.</p>
                    </div>
                    <form action={createSchedule} className="p-6 space-y-4">
                        <input type="hidden" name="agentId" value={agentId} />
                        <input type="hidden" name="tenantId" value={agent.tenantId} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Job Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    placeholder="Daily invoice check"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Schedule Type</label>
                                <select
                                    name="scheduleType"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                >
                                    <option value="cron">Cron Expression</option>
                                    <option value="interval">Interval</option>
                                    <option value="once">One-time</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Cron Expression</label>
                                <input
                                    type="text"
                                    name="cronExpression"
                                    placeholder="0 8 * * 1-5"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                                <p className="text-xs text-pulse-faint mt-1">e.g., &quot;0 8 * * 1-5&quot; = weekdays at 8am</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Interval (seconds)</label>
                                <input
                                    type="number"
                                    name="intervalSeconds"
                                    placeholder="3600"
                                    min="300"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                                <p className="text-xs text-pulse-faint mt-1">Min 300s (5 min). For interval type.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Run At (ISO datetime)</label>
                                <input
                                    type="datetime-local"
                                    name="runAt"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                                <p className="text-xs text-pulse-faint mt-1">For one-time type.</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Timezone</label>
                            <select
                                name="timezone"
                                defaultValue="UTC"
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
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
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Message / Instruction</label>
                            <textarea
                                name="message"
                                required
                                rows={3}
                                placeholder="Check ERPNext for unpaid invoices over R50,000 and send a summary."
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            />
                            <p className="text-xs text-pulse-faint mt-1">This is sent to the agent as a user message on each run.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Only run when</label>
                            <select
                                name="precondition"
                                defaultValue=""
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            >
                                <option value="">Always run</option>
                                <option value="email_unread">There is unread email</option>
                            </select>
                            <p className="text-xs text-pulse-faint mt-1">
                                A quick check before the agent is woken. A schedule that finds nothing
                                still costs a full run, so a job that mostly has nothing to do is far
                                cheaper with a condition on it.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Tools it may use</label>
                            <input
                                type="text"
                                name="tools"
                                placeholder="Leave empty for all tools — e.g. email_fetch_unread, email_read"
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            />
                            <p className="text-xs text-pulse-faint mt-1">
                                Every run sends the schema for every tool the agent has, before it reads
                                a word of the instruction. Naming just what this job needs makes each run
                                far cheaper.
                            </p>
                        </div>

                        <div className="flex justify-end">
                            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors motion-reduce:transition-none text-sm cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel">
                                Create Schedule
                            </button>
                        </div>
                    </form>
                </div>

                {/* Schedules Table */}
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Scheduled Jobs</h2>
                        <p className="text-sm text-pulse-muted mt-1">{schedules.length} total jobs</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-pulse-muted border-b border-pulse-border-subtle">
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
                                        <td colSpan={7} className="px-6 py-12 text-center text-sm text-pulse-faint">
                                            No scheduled jobs. Create one above or the agent can use schedule_job tool.
                                        </td>
                                    </tr>
                                )}
                                {schedules.map((job) => {
                                    const schedule =
                                        job.cronExpression ||
                                        (job.intervalSeconds ? `every ${job.intervalSeconds}s` : `once at ${job.runAt ? new Date(job.runAt).toLocaleString() : "—"}`);
                                    return (
                                        <tr key={job.id} className="border-b border-pulse-border-subtle hover:bg-pulse-hover">
                                            <td className="px-6 py-3">
                                                <div className="text-sm font-medium text-pulse-text">{job.name}</div>
                                                <div className="text-xs text-pulse-faint truncate max-w-xs">{job.message}</div>
                                                {/*
                                                    Editable after creation, because the two settings that stop a
                                                    job burning tokens are worth nothing if they only apply to
                                                    schedules that do not exist yet.
                                                */}
                                                <details className="mt-1.5">
                                                    <summary className="text-xs text-pulse-accent cursor-pointer select-none list-none hover:underline">
                                                        {job.precondition || (job.tools as string[] | null)?.length
                                                            ? `Runs when: ${job.precondition === "email_unread" ? "unread email" : "always"}${(job.tools as string[] | null)?.length ? ` · ${(job.tools as string[]).length} tools` : ""}`
                                                            : "Limit when it runs"}
                                                    </summary>
                                                    <form action={updateSchedule} className="mt-2 space-y-2 rounded-lg border border-pulse-border bg-pulse-panel-alt p-3">
                                                        <input type="hidden" name="jobId" value={job.id} />
                                                        <input type="hidden" name="agentId" value={agentId} />
                                                        <label className="block text-[11px] font-medium text-pulse-text-soft">Only run when</label>
                                                        <select
                                                            name="precondition"
                                                            defaultValue={job.precondition || ""}
                                                            className="w-full px-2 py-1.5 text-xs rounded border border-pulse-border bg-pulse-panel text-pulse-text outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                        >
                                                            <option value="">Always run</option>
                                                            <option value="email_unread">There is unread email</option>
                                                        </select>
                                                        <label className="block text-[11px] font-medium text-pulse-text-soft">Tools it may use</label>
                                                        <input
                                                            type="text"
                                                            name="tools"
                                                            defaultValue={((job.tools as string[] | null) || []).join(", ")}
                                                            placeholder="Leave empty for all tools"
                                                            className="w-full px-2 py-1.5 text-xs rounded border border-pulse-border bg-pulse-panel text-pulse-text placeholder:text-pulse-faint outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                        />
                                                        <p className="text-[10px] text-pulse-faint">
                                                            Every run sends the schema for every tool the agent has. Naming
                                                            just the ones this job needs makes it much cheaper.
                                                        </p>
                                                        <button type="submit" className="px-2.5 py-1 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                                            Save
                                                        </button>
                                                    </form>
                                                </details>
                                            </td>
                                            <td className="px-6 py-3">
                                                <code className="text-xs bg-pulse-panel-alt text-pulse-text-soft px-2 py-1 rounded">{schedule}</code>
                                            </td>
                                            <td className="px-6 py-3 text-sm text-pulse-muted">{job.timezone || "UTC"}</td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    job.enabled
                                                        ? "bg-green-500/10 text-green-400"
                                                        : "bg-pulse-panel-alt text-pulse-muted"
                                                }`}>
                                                    {job.enabled ? "Enabled" : "Disabled"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-xs text-pulse-faint">
                                                {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "Never"}
                                            </td>
                                            <td className="px-6 py-3">
                                                {job.webhookToken && (
                                                    <code className="text-[10px] bg-pulse-panel-alt text-pulse-faint px-1.5 py-0.5 rounded break-all max-w-[120px] inline-block truncate">
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
                                                        <button type="submit" className="text-xs text-indigo-500 hover:text-indigo-400 font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                                                            {job.enabled ? "Disable" : "Enable"}
                                                        </button>
                                                    </form>
                                                    <form action={deleteSchedule}>
                                                        <input type="hidden" name="jobId" value={job.id} />
                                                        <input type="hidden" name="agentId" value={agentId} />
                                                        <button type="submit" className="text-xs text-red-400 hover:text-red-300 font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
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
