import { db } from "../../../storage/db";
import { agentProfiles } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import CreateAgentModal from "./CreateAgentModal";
import { CpuChipIcon } from "@heroicons/react/24/outline";
import { getModelDisplayName, getProviderName } from "../../../utils/models";

export default async function AgentsPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';
    let agents: any[] = [];

    if (!isNextBuild) {
        agents = await db.select()
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, session.user.tenantId));
    }

    return (
        <div className="min-h-screen bg-transparent flex flex-col p-8">
            <div className="max-w-6xl w-full mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Agent Profiles</h1>
                        <p className="text-sm text-gray-500 mt-1">Manage distinct AI personas, their workspaces, models, and tool access.</p>
                    </div>
                    <CreateAgentModal />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents.map((agent) => (
                        <Link
                            key={agent.id}
                            href={`/dashboard/agents/${agent.id}`}
                            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md hover:border-indigo-200 transition-all group"
                        >
                            <div className="p-5 flex-1 relative">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                                        <CpuChipIcon className="w-6 h-6 text-blue-600 group-hover:text-indigo-600 transition-colors" />
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full">
                                            {getModelDisplayName(agent.modelId ?? "claude-sonnet-4-20250514")}
                                        </span>
                                        {agent.dockerSandboxEnabled && (
                                            <span className="px-2 py-1 bg-red-50 text-red-700 text-xs font-semibold rounded border border-red-100 uppercase tracking-wider">
                                                Sandbox
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">{agent.name}</h3>
                                <p className="text-xs text-gray-400 font-mono mb-4">ID: {agent.id.slice(0, 8)}...</p>

                                <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 h-24 overflow-hidden relative">
                                    <div className="font-semibold text-gray-400 text-xs uppercase mb-1">System Prompt</div>
                                    <div className="line-clamp-3 leading-relaxed">{agent.systemPrompt || "No prompt configured. Click to set up workspace."}</div>
                                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-50 to-transparent"></div>
                                </div>
                            </div>

                            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                                <span className="text-xs text-slate-400">
                                    {getProviderName(agent.modelId ?? "claude-sonnet-4-20250514")}
                                </span>
                                <div className="flex items-center gap-1.5">
                                    {agent.workspacePath ? (
                                        <span className="w-2 h-2 rounded-full bg-emerald-400" title="Workspace active" />
                                    ) : (
                                        <span className="w-2 h-2 rounded-full bg-slate-300" title="No workspace" />
                                    )}
                                    <span className="text-xs text-slate-500 group-hover:text-indigo-600 transition-colors">
                                        Edit &rarr;
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}

                    {agents.length === 0 && (
                        <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center">
                            <CpuChipIcon className="w-12 h-12 text-gray-300 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 mb-1">No Agent Profiles Found</h3>
                            <p className="text-sm text-gray-500 max-w-sm mx-auto">Create your first AI persona to start tailoring system prompts and connecting specialized tools.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
