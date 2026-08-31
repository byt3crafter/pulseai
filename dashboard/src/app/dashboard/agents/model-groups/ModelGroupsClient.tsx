"use client";

import { useState, useTransition } from "react";
import { PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { PageHeader, Card, CardHeader } from "../../../../components/dashboard/ui";
import { saveModelGroupAction, deleteModelGroupAction, type ModelGroupRow, type Strategy } from "./actions";

type AvailableModel = { id: string; label: string; provider: string };

const STRATEGY_COPY: Record<Strategy, { title: string; help: string }> = {
    failover: { title: "Failover", help: "Use the first model; if it errors or is rate-limited, fall through to the next. The agent always answers." },
    cost: { title: "Cost", help: "Cheapest model for simple turns, capable model for complex or tool turns. Order the list cheap → capable." },
    both: { title: "Cost + failover", help: "Pick by cost, and still fall through the whole group on error." },
};

export default function ModelGroupsClient({ groups, available }: { groups: ModelGroupRow[]; available: AvailableModel[] }) {
    const [editing, setEditing] = useState<ModelGroupRow | "new" | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function del(id: string) {
        const fd = new FormData(); fd.set("id", id);
        startTransition(async () => setNotice((await deleteModelGroupAction(fd)).message));
    }

    return (
        <div className="mx-auto w-full max-w-page px-6 py-7 sm:px-10 sm:py-9">
            <PageHeader
                title="Model groups"
                description="A named set of models an agent auto-picks from. Assign a group to an agent instead of a single model — it chooses per your strategy and falls through on failure."
            />
            {notice && <div className="mb-4 rounded-lg border border-pulse-border bg-pulse-panel-alt px-4 py-3 text-sm text-pulse-soft">{notice}</div>}

            {available.length === 0 && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
                    No providers are connected. Add a provider key in Settings → AI Providers before building a group.
                </div>
            )}

            <Card>
                <CardHeader
                    title={`${groups.length} group${groups.length === 1 ? "" : "s"}`}
                    description="Order matters: it's the failover order, and for the cost strategy it's cheap → capable."
                    action={
                        <button type="button" onClick={() => setEditing("new")} disabled={available.length < 2}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-pulse-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-pulse-accent-hi disabled:opacity-50">
                            <PlusIcon className="h-4 w-4" /> New group
                        </button>
                    }
                />
                {groups.length === 0 ? (
                    <p className="px-5 py-12 text-center text-sm text-pulse-muted">No groups yet. Create one, then assign it to an agent.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-pulse-border-subtle text-xs text-pulse-muted">
                                <tr>
                                    <th className="px-5 py-3 text-left font-medium">Name</th>
                                    <th className="px-4 py-3 text-left font-medium">Strategy</th>
                                    <th className="px-4 py-3 text-left font-medium">Models (in order)</th>
                                    <th className="px-4 py-3 text-left font-medium">Agents</th>
                                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map((g) => (
                                    <tr key={g.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                        <td className="px-5 py-3 font-medium text-pulse-text">{g.name}</td>
                                        <td className="px-4 py-3 text-pulse-soft">{STRATEGY_COPY[g.strategy].title}</td>
                                        <td className="px-4 py-3 text-pulse-soft">{g.models.join("  →  ")}</td>
                                        <td className="px-4 py-3 text-pulse-soft">{g.agentCount}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button type="button" onClick={() => setEditing(g)} className="cursor-pointer rounded-lg px-2.5 py-1 text-xs text-pulse-accent hover:bg-pulse-hover">Edit</button>
                                                <button type="button" onClick={() => del(g.id)} disabled={pending} aria-label="Delete" className="cursor-pointer rounded-lg p-1.5 text-pulse-faint hover:bg-red-500/10 hover:text-red-400"><TrashIcon className="h-4 w-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {editing && (
                <GroupEditor
                    group={editing === "new" ? null : editing}
                    available={available}
                    onClose={() => setEditing(null)}
                    onSaved={(m) => { setNotice(m); setEditing(null); }}
                />
            )}
        </div>
    );
}

function GroupEditor({ group, available, onClose, onSaved }: {
    group: ModelGroupRow | null; available: AvailableModel[];
    onClose: () => void; onSaved: (msg: string) => void;
}) {
    const [name, setName] = useState(group?.name ?? "");
    const [strategy, setStrategy] = useState<Strategy>(group?.strategy ?? "failover");
    const [chosen, setChosen] = useState<string[]>(group?.models ?? []);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const labelOf = (id: string) => available.find((m) => m.id === id)?.label ?? id;
    const unpicked = available.filter((m) => !chosen.includes(m.id));

    function move(i: number, dir: -1 | 1) {
        const j = i + dir;
        if (j < 0 || j >= chosen.length) return;
        const next = [...chosen]; [next[i], next[j]] = [next[j], next[i]]; setChosen(next);
    }

    function save() {
        setError(null);
        if (!name.trim()) return setError("Give the group a name.");
        if (chosen.length < 2) return setError("Pick at least two models.");
        const fd = new FormData();
        if (group) fd.set("id", group.id);
        fd.set("name", name.trim());
        fd.set("strategy", strategy);
        fd.set("models", chosen.join(","));
        startTransition(async () => {
            const res = await saveModelGroupAction(fd);
            if (res.success) onSaved(res.message); else setError(res.message);
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="presentation">
            <div className="w-full max-w-lg rounded-2xl border border-pulse-border bg-pulse-panel shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="flex items-center gap-3 border-b border-pulse-border-subtle px-5 py-4">
                    <h2 className="flex-1 text-[15px] font-semibold text-pulse-text">{group ? "Edit group" : "New model group"}</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer rounded-lg p-1.5 text-pulse-faint hover:bg-pulse-hover hover:text-pulse-text"><XMarkIcon className="h-4 w-4" /></button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                    <label className="block">
                        <span className="mb-1 block text-xs text-pulse-muted">Name</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reliable, or Cheap-first"
                            className="w-full rounded-lg border border-pulse-border bg-pulse-bg px-3 py-2 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-pulse-accent/40" />
                    </label>

                    <div className="mt-4">
                        <span className="mb-1.5 block text-xs text-pulse-muted">Strategy</span>
                        <div className="space-y-1.5">
                            {(Object.keys(STRATEGY_COPY) as Strategy[]).map((s) => (
                                <label key={s} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${strategy === s ? "border-pulse-accent bg-pulse-accent/5" : "border-pulse-border-subtle hover:bg-pulse-hover"}`}>
                                    <input type="radio" name="strategy" checked={strategy === s} onChange={() => setStrategy(s)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                                    <span>
                                        <span className="block text-[13.5px] font-medium text-pulse-text">{STRATEGY_COPY[s].title}</span>
                                        <span className="mt-0.5 block text-xs text-pulse-muted">{STRATEGY_COPY[s].help}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="mt-4">
                        <span className="mb-1.5 block text-xs text-pulse-muted">Models, in order {strategy !== "failover" && "(cheap → capable)"}</span>
                        {chosen.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-pulse-border-subtle px-3 py-3 text-xs text-pulse-faint">Add at least two models from below.</p>
                        ) : (
                            <ol className="space-y-1.5">
                                {chosen.map((id, i) => (
                                    <li key={id} className="flex items-center gap-2 rounded-lg border border-pulse-border-subtle px-3 py-2">
                                        <span className="w-5 text-xs text-pulse-faint">{i + 1}</span>
                                        <span className="flex-1 text-[13px] text-pulse-text">{labelOf(id)}</span>
                                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Up" className="cursor-pointer rounded p-1 text-pulse-faint hover:text-pulse-text disabled:opacity-30"><ArrowUpIcon className="h-3.5 w-3.5" /></button>
                                        <button type="button" onClick={() => move(i, 1)} disabled={i === chosen.length - 1} aria-label="Down" className="cursor-pointer rounded p-1 text-pulse-faint hover:text-pulse-text disabled:opacity-30"><ArrowDownIcon className="h-3.5 w-3.5" /></button>
                                        <button type="button" onClick={() => setChosen(chosen.filter((x) => x !== id))} aria-label="Remove" className="cursor-pointer rounded p-1 text-pulse-faint hover:text-red-400"><XMarkIcon className="h-3.5 w-3.5" /></button>
                                    </li>
                                ))}
                            </ol>
                        )}
                        {unpicked.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {unpicked.map((m) => (
                                    <button key={m.id} type="button" onClick={() => setChosen([...chosen, m.id])}
                                        className="cursor-pointer rounded-full border border-pulse-border bg-pulse-panel-alt px-2.5 py-1 text-xs text-pulse-soft hover:border-pulse-accent hover:text-pulse-text">
                                        + {m.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
                </div>
                <div className="flex justify-end gap-2 border-t border-pulse-border-subtle px-5 py-3">
                    <button type="button" onClick={onClose} className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text">Cancel</button>
                    <button type="button" onClick={save} disabled={pending} className="cursor-pointer rounded-lg bg-pulse-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-pulse-accent-hi disabled:opacity-50">{pending ? "Saving…" : "Save group"}</button>
                </div>
            </div>
        </div>
    );
}
