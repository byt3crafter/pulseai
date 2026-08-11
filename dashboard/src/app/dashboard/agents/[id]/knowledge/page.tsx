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
        <div className="p-4 sm:p-5 lg:p-6">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-500 hover:text-indigo-400 mb-2 inline-block transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                        <BookOpenIcon className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-pulse-text">Knowledge Base — {agent.name}</h1>
                        <p className="text-pulse-muted text-sm">
                            API reference templates included in this agent&apos;s system prompt.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Add Template */}
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Add Knowledge Template</h2>
                        <p className="text-sm text-pulse-muted mt-1">Pre-built API references to help the agent write better integration code.</p>
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
                                            className={`w-full text-left p-4 rounded-lg border transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                                isActive
                                                    ? "border-green-500/30 bg-green-500/10 text-green-400 cursor-default"
                                                    : "border-pulse-border-subtle hover:border-indigo-400 hover:bg-pulse-tint text-pulse-text-soft cursor-pointer"
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
                                    className="flex-1 px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint font-mono uppercase focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel">
                                    Add Custom
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Active Knowledge Files */}
                {files.length === 0 ? (
                    <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle p-12 text-center">
                        <BookOpenIcon className="w-12 h-12 text-pulse-faint mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-pulse-text-soft">No knowledge files</h3>
                        <p className="text-sm text-pulse-faint mt-1">Add a template above to give this agent API reference context.</p>
                    </div>
                ) : (
                    files.map((file) => (
                        <div key={file.name} className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                            <div className="p-6 border-b border-pulse-border-subtle flex items-center justify-between">
                                <div>
                                    <h3 className="font-mono font-semibold text-pulse-text">{file.name}</h3>
                                    <p className="text-xs text-pulse-faint mt-0.5">Included in agent system prompt</p>
                                </div>
                                <form action={removeKnowledgeFile}>
                                    <input type="hidden" name="agentId" value={agentId} />
                                    <input type="hidden" name="tenantId" value={agent.tenantId} />
                                    <input type="hidden" name="fileName" value={file.name} />
                                    <button type="submit" className="text-xs text-red-400 hover:text-red-300 font-medium px-3 py-1 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
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
                                    className="w-full p-6 text-sm font-mono text-pulse-text-soft bg-pulse-panel border-0 focus:ring-0 outline-none resize-y"
                                />
                                <div className="px-6 py-3 bg-pulse-panel-alt border-t border-pulse-border-subtle flex justify-end">
                                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel-alt">
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
