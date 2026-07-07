import { getAgentMemories, getMemoryStats, deleteMemory, bulkDeleteMemories } from "./actions";
import { db } from "../../../../../storage/db";
import { agentProfiles } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AgentMemoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: agentId } = await params;

    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const agent = await db.query.agentProfiles.findFirst({ where: eq(agentProfiles.id, agentId) });
    if (!agent) return notFound();

    const { memories, total } = await getAgentMemories(agentId);
    const stats = await getMemoryStats(agentId);

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-500 hover:text-indigo-400 mb-2 inline-block transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                        <BrainIcon className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-pulse-text">Memory — {agent.name}</h1>
                        <p className="text-pulse-muted text-sm">Long-term memory entries stored by this agent.</p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Total" value={stats.total || 0} />
                    <StatCard label="Facts" value={stats.facts || 0} />
                    <StatCard label="Preferences" value={stats.preferences || 0} />
                    <StatCard label="Decisions" value={stats.decisions || 0} />
                </div>

                {/* Bulk Actions */}
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-pulse-text">Memory Entries</h2>
                            <p className="text-sm text-pulse-muted mt-1">{total} total entries</p>
                        </div>
                        <form action={bulkDeleteMemories} className="flex gap-2">
                            <input type="hidden" name="agentId" value={agentId} />
                            <select
                                name="category"
                                className="px-3 py-1.5 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text-soft focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            >
                                <option value="all">All Categories</option>
                                <option value="general">General</option>
                                <option value="fact">Facts</option>
                                <option value="preference">Preferences</option>
                                <option value="decision">Decisions</option>
                                <option value="task">Tasks</option>
                                <option value="relationship">Relationships</option>
                            </select>
                            <button type="submit" className="px-3 py-1.5 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                Bulk Delete
                            </button>
                        </form>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-pulse-muted border-b border-pulse-border-subtle">
                                    <th className="px-6 py-3 font-medium">Content</th>
                                    <th className="px-6 py-3 font-medium">Category</th>
                                    <th className="px-6 py-3 font-medium">Importance</th>
                                    <th className="px-6 py-3 font-medium">Uses</th>
                                    <th className="px-6 py-3 font-medium">Created</th>
                                    <th className="px-6 py-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {memories.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-sm text-pulse-faint">
                                            No memories stored yet. The agent will create memories using the memory_store tool.
                                        </td>
                                    </tr>
                                )}
                                {memories.map((mem) => (
                                    <tr key={mem.id} className="border-b border-pulse-border-subtle hover:bg-pulse-hover">
                                        <td className="px-6 py-3 text-sm text-pulse-text-soft max-w-md">
                                            <p className="truncate">{mem.content}</p>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className="px-2 py-1 text-xs bg-pulse-panel-alt text-pulse-muted rounded-full">
                                                {mem.category || "general"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-pulse-muted">{mem.importance}</td>
                                        <td className="px-6 py-3 text-sm text-pulse-muted">{mem.accessCount || 0}</td>
                                        <td className="px-6 py-3 text-xs text-pulse-faint">
                                            {mem.createdAt ? new Date(mem.createdAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-6 py-3">
                                            <form action={deleteMemory}>
                                                <input type="hidden" name="memoryId" value={mem.id} />
                                                <input type="hidden" name="agentId" value={agentId} />
                                                <button type="submit" className="text-xs text-red-400 hover:text-red-300 font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                                                    Delete
                                                </button>
                                            </form>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle p-4">
            <p className="text-2xl font-bold text-pulse-text">{value}</p>
            <p className="text-sm text-pulse-muted">{label}</p>
        </div>
    );
}

function BrainIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
        </svg>
    );
}
