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
        <div className="p-8">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-50 rounded-lg">
                        <BrainIcon className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Memory — {agent.name}</h1>
                        <p className="text-slate-500 text-sm">Long-term memory entries stored by this agent.</p>
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
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Memory Entries</h2>
                            <p className="text-sm text-slate-500 mt-1">{total} total entries</p>
                        </div>
                        <form action={bulkDeleteMemories} className="flex gap-2">
                            <input type="hidden" name="agentId" value={agentId} />
                            <select
                                name="category"
                                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-700"
                            >
                                <option value="all">All Categories</option>
                                <option value="general">General</option>
                                <option value="fact">Facts</option>
                                <option value="preference">Preferences</option>
                                <option value="decision">Decisions</option>
                                <option value="task">Tasks</option>
                                <option value="relationship">Relationships</option>
                            </select>
                            <button type="submit" className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 font-medium">
                                Bulk Delete
                            </button>
                        </form>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
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
                                        <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">
                                            No memories stored yet. The agent will create memories using the memory_store tool.
                                        </td>
                                    </tr>
                                )}
                                {memories.map((mem) => (
                                    <tr key={mem.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-6 py-3 text-sm text-slate-700 max-w-md">
                                            <p className="truncate">{mem.content}</p>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded-full">
                                                {mem.category || "general"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-slate-500">{mem.importance}</td>
                                        <td className="px-6 py-3 text-sm text-slate-500">{mem.accessCount || 0}</td>
                                        <td className="px-6 py-3 text-xs text-slate-400">
                                            {mem.createdAt ? new Date(mem.createdAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-6 py-3">
                                            <form action={deleteMemory}>
                                                <input type="hidden" name="memoryId" value={mem.id} />
                                                <input type="hidden" name="agentId" value={agentId} />
                                                <button type="submit" className="text-xs text-red-600 hover:text-red-800 font-medium">
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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
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
