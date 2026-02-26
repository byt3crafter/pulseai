import { CodeBracketIcon } from "@heroicons/react/24/outline";
import { getAgentScripts, deleteScript } from "./actions";
import { db } from "../../../../../storage/db";
import { agentProfiles } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AgentScriptsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: agentId } = await params;

    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const agent = await db.query.agentProfiles.findFirst({ where: eq(agentProfiles.id, agentId) });
    if (!agent) return notFound();

    const scripts = await getAgentScripts(agentId);

    return (
        <div className="p-8">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-50 rounded-lg">
                        <CodeBracketIcon className="w-6 h-6 text-violet-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Scripts — {agent.name}</h1>
                        <p className="text-slate-500 text-sm">View and manage scripts saved by this agent.</p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {scripts.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <CodeBracketIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-700">No saved scripts yet</h3>
                        <p className="text-sm text-slate-400 mt-1">
                            When this agent uses the script_save tool, scripts will appear here.
                        </p>
                    </div>
                ) : (
                    scripts.map((script) => (
                        <div key={script.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                                <div>
                                    <h3 className="font-mono font-semibold text-slate-900">{script.filename}</h3>
                                    <p className="text-sm text-slate-500 mt-0.5">
                                        {script.description || "No description"} &middot;{" "}
                                        <span className="text-slate-400">
                                            {script.language} &middot; {script.useCount || 0} uses
                                            {script.lastUsedAt && ` &middot; last used ${new Date(script.lastUsedAt).toLocaleDateString()}`}
                                        </span>
                                    </p>
                                </div>
                                <form action={deleteScript}>
                                    <input type="hidden" name="scriptId" value={script.id} />
                                    <input type="hidden" name="agentId" value={agentId} />
                                    <button type="submit" className="text-xs text-red-600 hover:text-red-800 font-medium px-3 py-1 border border-red-200 rounded-lg hover:bg-red-50">
                                        Delete
                                    </button>
                                </form>
                            </div>
                            <pre className="p-6 bg-slate-50 text-sm text-slate-800 font-mono overflow-x-auto whitespace-pre-wrap max-h-96">
                                {script.code}
                            </pre>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
