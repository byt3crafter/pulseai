import { BookOpenIcon } from "@heroicons/react/24/outline";
import {
    getKnowledgeFiles,
    addKnowledgeTemplate,
    removeKnowledgeFile,
    updateKnowledgeFile,
    addCustomKnowledge,
    getTemplates,
} from "./actions";
import { db } from "../../../../../storage/db";
import { agentProfiles } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AgentKnowledgePage({ params }: { params: Promise<{ id: string }> }) {
    const { id: agentId } = await params;

    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const agent = await db.query.agentProfiles.findFirst({ where: eq(agentProfiles.id, agentId) });
    if (!agent) return notFound();

    const TEMPLATES = await getTemplates();
    const files = await getKnowledgeFiles(agent.tenantId, agentId);
    const activeFileNames = new Set(files.map((f) => f.name));

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <BookOpenIcon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Knowledge Base — {agent.name}</h1>
                        <p className="text-slate-500 text-sm">
                            API reference templates included in this agent&apos;s system prompt.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Add Template */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Add Knowledge Template</h2>
                        <p className="text-sm text-slate-500 mt-1">Pre-built API references to help the agent write better integration code.</p>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {Object.entries(TEMPLATES).map(([key, tmpl]) => {
                                const isActive = activeFileNames.has(tmpl.fileName);
                                return (
                                    <form key={key} action={addKnowledgeTemplate}>
                                        <input type="hidden" name="agentId" value={agentId} />
                                        <input type="hidden" name="tenantId" value={agent.tenantId} />
                                        <input type="hidden" name="templateKey" value={key} />
                                        <button
                                            type="submit"
                                            disabled={isActive}
                                            className={`w-full text-left p-4 rounded-lg border transition-colors ${
                                                isActive
                                                    ? "border-green-200 bg-green-50 text-green-700 cursor-default"
                                                    : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700"
                                            }`}
                                        >
                                            <span className="font-medium text-sm">{tmpl.displayName}</span>
                                            <p className="text-xs mt-0.5 opacity-70">
                                                {isActive ? "Active" : "Click to add"}
                                            </p>
                                        </button>
                                    </form>
                                );
                            })}
                            {/* Custom template */}
                            <form action={addCustomKnowledge} className="flex gap-2">
                                <input type="hidden" name="agentId" value={agentId} />
                                <input type="hidden" name="tenantId" value={agent.tenantId} />
                                <input
                                    type="text"
                                    name="name"
                                    placeholder="CUSTOM_NAME"
                                    required
                                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono uppercase"
                                />
                                <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800">
                                    Add Custom
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Active Knowledge Files */}
                {files.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <BookOpenIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-700">No knowledge files</h3>
                        <p className="text-sm text-slate-400 mt-1">Add a template above to give this agent API reference context.</p>
                    </div>
                ) : (
                    files.map((file) => (
                        <div key={file.name} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                                <div>
                                    <h3 className="font-mono font-semibold text-slate-900">{file.name}</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Included in agent system prompt</p>
                                </div>
                                <form action={removeKnowledgeFile}>
                                    <input type="hidden" name="agentId" value={agentId} />
                                    <input type="hidden" name="tenantId" value={agent.tenantId} />
                                    <input type="hidden" name="fileName" value={file.name} />
                                    <button type="submit" className="text-xs text-red-600 hover:text-red-800 font-medium px-3 py-1 border border-red-200 rounded-lg hover:bg-red-50">
                                        Remove
                                    </button>
                                </form>
                            </div>
                            <form action={updateKnowledgeFile}>
                                <input type="hidden" name="agentId" value={agentId} />
                                <input type="hidden" name="tenantId" value={agent.tenantId} />
                                <input type="hidden" name="fileName" value={file.name} />
                                <textarea
                                    name="content"
                                    defaultValue={file.content}
                                    rows={15}
                                    className="w-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none resize-y"
                                />
                                <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
                                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
