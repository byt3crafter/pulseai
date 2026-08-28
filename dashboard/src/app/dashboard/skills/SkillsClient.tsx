"use client";

import { useMemo, useState, useTransition } from "react";
import { MagnifyingGlassIcon, CheckIcon } from "@heroicons/react/24/outline";
import { PageHeader, Card, CardHeader } from "../../../components/dashboard/ui";
import { setGrantsAction, setAgentSkillsAction, type LibrarySkill, type AgentSkillView } from "./actions";

export default function SkillsClient({ library, agents }: { library: LibrarySkill[]; agents: AgentSkillView[] }) {
    const [tab, setTab] = useState<"library" | "agents">("library");
    const [notice, setNotice] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    return (
        <div className="mx-auto w-full max-w-[1060px] px-6 py-7 sm:px-10 sm:py-9">
            <PageHeader
                title="Skills"
                description="Playbooks your agents can consult. Add them to your library, then give each agent the ones it needs."
            />

            <div className="mb-4 flex gap-1 border-b border-pulse-border-subtle">
                {(["library", "agents"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)}
                        className={`cursor-pointer border-b-2 px-3 py-2 text-sm transition-colors ${
                            tab === t ? "border-pulse-accent text-pulse-text" : "border-transparent text-pulse-muted hover:text-pulse-text"}`}>
                        {t === "library" ? "Library" : "Who has what"}
                    </button>
                ))}
            </div>

            {notice && <div className="mb-4 rounded-lg border border-pulse-border bg-pulse-panel-alt px-4 py-3 text-sm text-pulse-soft">{notice}</div>}

            {tab === "library"
                ? <Library library={library} pending={pending} onNotice={setNotice} startTransition={startTransition} />
                : <Agents library={library} agents={agents} pending={pending} onNotice={setNotice} startTransition={startTransition} />}
        </div>
    );
}

function Library({ library, pending, onNotice, startTransition }: {
    library: LibrarySkill[]; pending: boolean; onNotice: (s: string) => void;
    startTransition: (cb: () => void) => void;
}) {
    const [q, setQ] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const rows = useMemo(() => {
        const n = q.trim().toLowerCase();
        if (!n) return library;
        return library.filter((s) =>
            s.qualifiedName.toLowerCase().includes(n) || s.description.toLowerCase().includes(n));
    }, [library, q]);

    function apply(granted: boolean) {
        const ids = [...selected];
        startTransition(async () => {
            const res = await setGrantsAction(ids, granted);
            onNotice(res.message);
            if (res.success) setSelected(new Set());
        });
    }

    if (library.length === 0) {
        return (
            <Card>
                <p className="px-5 py-14 text-center text-sm text-pulse-muted">
                    No skills are available yet. An administrator needs to import and approve a skill pack first.
                </p>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader title={`${library.filter((s) => s.granted).length} of ${library.length} in your library`}
                description="Adding a skill makes it available to assign. It does nothing until an agent carries it." />

            {/* Fixed-height bar that swaps contents, so selecting never shifts the list. */}
            <div className="flex h-12 items-center gap-3 border-b border-pulse-border-subtle px-5">
                {selected.size > 0 ? (
                    <>
                        <span className="text-sm font-medium text-pulse-text">{selected.size} selected</span>
                        <button type="button" onClick={() => setSelected(new Set())} className="cursor-pointer text-sm text-pulse-muted hover:text-pulse-text">Clear</button>
                        <div className="ml-auto flex gap-2">
                            <button type="button" disabled={pending} onClick={() => apply(false)}
                                className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text disabled:opacity-50">Remove</button>
                            <button type="button" disabled={pending} onClick={() => apply(true)}
                                className="cursor-pointer rounded-lg bg-pulse-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-pulse-accent-hi disabled:opacity-50">
                                {pending ? "Saving…" : "Add to library"}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="relative w-full max-w-sm">
                        <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-pulse-faint" />
                        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills" aria-label="Search skills"
                            className="w-full bg-transparent py-2 pl-6 pr-3 text-sm text-pulse-text placeholder-pulse-faint outline-none" />
                    </div>
                )}
            </div>

            <div className="max-h-[560px] overflow-y-auto">
                {rows.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-pulse-muted">No skills match that.</p>
                ) : rows.map((s) => {
                    const on = selected.has(s.id);
                    return (
                        <label key={s.id}
                            className={`flex cursor-pointer items-start gap-3 border-b border-pulse-border-subtle px-5 py-3 last:border-b-0 ${on ? "bg-pulse-panel-alt" : "hover:bg-pulse-hover"}`}>
                            <input type="checkbox" checked={on}
                                onChange={() => setSelected((p) => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                                className="mt-1 h-4 w-4 cursor-pointer rounded border-pulse-border bg-pulse-panel accent-indigo-600" />
                            <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className="text-[13.5px] font-medium text-pulse-text">{s.qualifiedName}</span>
                                    {s.granted && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-400">
                                            <CheckIcon className="h-3 w-3" /> In library
                                        </span>
                                    )}
                                    {s.agentCount > 0 && (
                                        <span className="text-[11px] text-pulse-faint">{s.agentCount} agent{s.agentCount === 1 ? "" : "s"}</span>
                                    )}
                                </span>
                                <span className="mt-0.5 block line-clamp-2 text-xs text-pulse-muted">{s.description}</span>
                            </span>
                            <span className="shrink-0 text-[11px] text-pulse-faint">{s.packName}</span>
                        </label>
                    );
                })}
            </div>
        </Card>
    );
}

function Agents({ library, agents, pending, onNotice, startTransition }: {
    library: LibrarySkill[]; agents: AgentSkillView[]; pending: boolean;
    onNotice: (s: string) => void; startTransition: (cb: () => void) => void;
}) {
    const granted = library.filter((s) => s.granted);
    const [openAgent, setOpenAgent] = useState<string | null>(null);
    const [draft, setDraft] = useState<Set<string>>(new Set());

    if (granted.length === 0) {
        return (
            <Card>
                <p className="px-5 py-14 text-center text-sm text-pulse-muted">
                    Your library is empty. Add skills on the Library tab before assigning them.
                </p>
            </Card>
        );
    }

    function open(a: AgentSkillView) {
        setOpenAgent(a.agentId);
        setDraft(new Set(a.skillIds));
    }
    function save(agentId: string) {
        startTransition(async () => {
            const res = await setAgentSkillsAction(agentId, [...draft]);
            onNotice(res.message);
            if (res.success) setOpenAgent(null);
        });
    }

    return (
        <Card>
            <CardHeader title="Who has what"
                description="Each agent carries only the skills you give it — that is what keeps the prompt small." />
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="border-b border-pulse-border-subtle text-xs text-pulse-muted">
                        <tr>
                            <th scope="col" className="px-5 py-3 text-left font-medium">Agent</th>
                            <th scope="col" className="px-4 py-3 text-left font-medium">Skills</th>
                            <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {agents.map((a) => (
                            <tr key={a.agentId} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                <td className="px-5 py-3 font-medium text-pulse-text">{a.agentName}</td>
                                <td className="px-4 py-3 text-pulse-soft">{a.skillIds.length}</td>
                                <td className="px-4 py-3 text-right">
                                    <button type="button" onClick={() => open(a)}
                                        className="cursor-pointer rounded-lg px-2.5 py-1 text-xs text-pulse-accent hover:bg-pulse-hover">
                                        Change
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {openAgent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpenAgent(null)} role="presentation">
                    <div className="w-full max-w-lg rounded-2xl border border-pulse-border bg-pulse-panel shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                        <div className="border-b border-pulse-border-subtle px-5 py-4">
                            <h2 className="text-[15px] font-semibold text-pulse-text">
                                Skills for {agents.find((a) => a.agentId === openAgent)?.agentName}
                            </h2>
                            <p className="mt-0.5 text-xs text-pulse-muted">{draft.size} of {granted.length} selected</p>
                        </div>
                        <div className="max-h-80 overflow-y-auto px-5 py-3">
                            {granted.map((s) => (
                                <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2 hover:bg-pulse-hover">
                                    <input type="checkbox" checked={draft.has(s.id)}
                                        onChange={() => setDraft((p) => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                                        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-pulse-border bg-pulse-panel accent-indigo-600" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] text-pulse-text">{s.qualifiedName}</span>
                                        <span className="mt-0.5 block line-clamp-1 text-xs text-pulse-muted">{s.description}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-pulse-border-subtle px-5 py-3">
                            <button type="button" onClick={() => setOpenAgent(null)} className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text">Cancel</button>
                            <button type="button" disabled={pending} onClick={() => save(openAgent)}
                                className="cursor-pointer rounded-lg bg-pulse-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-pulse-accent-hi disabled:opacity-50">
                                {pending ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}
