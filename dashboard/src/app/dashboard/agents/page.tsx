import { db } from "../../../storage/db";
import { agentProfiles, tenantProviderKeys } from "../../../storage/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CpuChipIcon } from "@heroicons/react/24/outline";
import { getModelDisplayName, getProviderName } from "../../../utils/models";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';
    let agents: any[] = [];

    let connectedProviders: string[] = [];

    if (!isNextBuild) {
        agents = await db.select()
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, session.user.tenantId));

        const providerRows = await db.select({ provider: tenantProviderKeys.provider })
            .from(tenantProviderKeys)
            .where(and(
                eq(tenantProviderKeys.tenantId, session.user.tenantId),
                eq(tenantProviderKeys.isActive, true)
            ));
        connectedProviders = providerRows.map((r) => r.provider);
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-pulse-text">Agent Profiles</h1>
                        <p className="text-sm text-pulse-muted mt-1">Manage distinct AI personas, their workspaces, models, and tool access.</p>
                    </div>
                    <Link
                        href="/dashboard/agents/new"
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors motion-reduce:transition-none text-sm shadow-sm cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 self-start sm:self-auto"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Create Agent
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents.map((agent) => (
                        <Link
                            key={agent.id}
                            href={`/dashboard/agents/${agent.id}`}
                            className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden flex flex-col hover:shadow-md hover:border-pulse-accent/40 transition-all motion-reduce:transition-none group"
                        >
                            <div className="p-5 flex-1 relative">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-10 h-10 rounded-lg bg-pulse-tint flex items-center justify-center group-hover:bg-pulse-accent/15 transition-colors motion-reduce:transition-none">
                                        <CpuChipIcon className="w-6 h-6 text-pulse-accent-hi" />
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="px-2 py-1 bg-pulse-tint text-pulse-accent-hi text-xs font-medium rounded-full">
                                            {getModelDisplayName(agent.modelId ?? "claude-sonnet-4-20250514")}
                                        </span>
                                        {agent.dockerSandboxEnabled && (
                                            <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs font-semibold rounded border border-red-500/30 uppercase tracking-wider">
                                                Sandbox
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <h3 className="text-lg font-bold text-pulse-text mb-1">{agent.name}</h3>
                                <p className="text-xs text-pulse-faint font-mono mb-4">ID: {agent.id.slice(0, 8)}...</p>

                                <div className="text-sm text-pulse-text-soft bg-pulse-panel-alt p-3 rounded-lg border border-pulse-border-subtle h-24 overflow-hidden relative">
                                    <div className="font-semibold text-pulse-faint text-xs uppercase mb-1">System Prompt</div>
                                    <div className="line-clamp-3 leading-relaxed">{agent.systemPrompt || "No prompt configured. Click to set up workspace."}</div>
                                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-pulse-panel-alt to-transparent"></div>
                                </div>
                            </div>

                            <div className="px-5 py-3 bg-pulse-panel-alt border-t border-pulse-border-subtle flex justify-between items-center">
                                <span className="text-xs text-pulse-faint">
                                    {getProviderName(agent.modelId ?? "claude-sonnet-4-20250514")}
                                </span>
                                <div className="flex items-center gap-1.5">
                                    {agent.workspacePath ? (
                                        <span className="w-2 h-2 rounded-full bg-emerald-400" title="Workspace active" />
                                    ) : (
                                        <span className="w-2 h-2 rounded-full bg-pulse-border-strong" title="No workspace" />
                                    )}
                                    <span className="text-xs text-pulse-muted group-hover:text-pulse-accent-hi transition-colors motion-reduce:transition-none">
                                        Edit &rarr;
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}

                    {agents.length === 0 && (
                        <div className="col-span-full py-16 text-center bg-pulse-panel rounded-xl border border-dashed border-pulse-border flex flex-col items-center justify-center">
                            <CpuChipIcon className="w-12 h-12 text-pulse-faint mb-4" />
                            <h3 className="text-lg font-medium text-pulse-text mb-1">No Agent Profiles Found</h3>
                            <p className="text-sm text-pulse-muted max-w-sm mx-auto">Create your first AI persona to start tailoring system prompts and connecting specialized tools.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
