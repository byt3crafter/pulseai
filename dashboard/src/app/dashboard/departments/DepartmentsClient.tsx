"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    BuildingOffice2Icon,
    UserGroupIcon,
    CpuChipIcon,
    TrashIcon,
    PlusIcon,
    StarIcon,
    EyeIcon,
    ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import {
    createChannelAction,
    updateChannelAction,
    deleteChannelAction,
    addChannelAgentAction,
    removeChannelAgentAction,
    addChannelMemberAction,
    removeChannelMemberAction,
    setMemberAgentsAction,
} from "./actions";

type Channel = {
    id: string; kind: string; parentId: string | null; name: string;
    description: string | null; mode: string; leadAgentId: string | null;
};
type Named = { id: string; name: string | null };
type UserRow = { id: string; name: string | null; email: string };
type AgentLink = { channelId: string; agentProfileId: string; role: string; level: number; respondsWhen: string };
type MemberLink = { channelId: string; userId: string; role: string; access: string };
type MemberAgentLink = { channelId: string; userId: string; agentProfileId: string };

type Props = {
    channels: Channel[];
    allAgents: Named[];
    allUsers: UserRow[];
    channelAgents: AgentLink[];
    channelMembers: MemberLink[];
    channelMemberAgents: MemberAgentLink[];
};

export default function DepartmentsClient(props: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const departments = props.channels.filter((c) => c.kind === "department");
    const groupsByParent = useMemo(() => {
        const m: Record<string, Channel[]> = {};
        props.channels.filter((c) => c.kind === "group").forEach((g) => {
            if (!g.parentId) return;
            (m[g.parentId] ||= []).push(g);
        });
        return m;
    }, [props.channels]);

    const run = (action: (fd: FormData) => Promise<{ success: boolean; message: string }>, fd: FormData) => {
        startTransition(async () => {
            const res = await action(fd);
            setMsg({ ok: res.success, text: res.message });
            router.refresh();
        });
    };

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <BuildingOffice2Icon className="h-7 w-7 text-indigo-600" /> Departments
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Organize your company into departments and groups. Add agents (with a lead that answers &amp; routes)
                        and people (talk or read-only). The persona lives on each agent.
                    </p>
                </div>
            </div>

            {msg && (
                <div className={`mb-4 rounded-lg px-4 py-2 text-sm border ${msg.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {msg.text}
                </div>
            )}

            {/* Create department */}
            <CreateChannelForm kind="department" pending={pending} onSubmit={(fd) => run(createChannelAction, fd)} />

            <div className="mt-6 space-y-6">
                {departments.length === 0 && (
                    <p className="text-slate-400 text-sm text-center py-8">No departments yet. Create your first one above.</p>
                )}
                {departments.map((dept) => (
                    <div key={dept.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <ChannelHeader ch={dept} pending={pending} run={run} />
                        <div className="p-6 pt-0 space-y-6">
                            <ChannelPanel ch={dept} {...props} pending={pending} run={run} />

                            {/* Groups under this department */}
                            <div className="pl-4 border-l-2 border-slate-100 space-y-4">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Groups / Topics</div>
                                {(groupsByParent[dept.id] || []).map((g) => (
                                    <div key={g.id} className="bg-slate-50 rounded-lg border border-slate-200">
                                        <ChannelHeader ch={g} pending={pending} run={run} compact />
                                        <div className="p-4 pt-0">
                                            <ChannelPanel ch={g} {...props} pending={pending} run={run} />
                                        </div>
                                    </div>
                                ))}
                                <CreateChannelForm
                                    kind="group" parentId={dept.id} pending={pending}
                                    onSubmit={(fd) => run(createChannelAction, fd)}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Channel header (name/description/mode + edit + delete) ──
function ChannelHeader({ ch, pending, run, compact }: {
    ch: Channel; pending: boolean; compact?: boolean;
    run: (a: any, fd: FormData) => void;
}) {
    const [editing, setEditing] = useState(false);
    if (editing) {
        return (
            <form
                className="p-4 flex flex-wrap items-end gap-3"
                action={(fd) => { fd.set("channelId", ch.id); run(updateChannelAction, fd); setEditing(false); }}
            >
                <Field label="Name"><input name="name" defaultValue={ch.name} required className={inputCls} /></Field>
                <Field label="Description"><input name="description" defaultValue={ch.description || ""} className={inputCls} /></Field>
                <Field label="Members">
                    <select name="mode" defaultValue={ch.mode} className={inputCls}>
                        <option value="single_human">Single person</option>
                        <option value="multi_human">Multiple people</option>
                    </select>
                </Field>
                <button disabled={pending} className={btnPrimary}>Save</button>
                <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancel</button>
            </form>
        );
    }
    return (
        <div className={`flex items-start justify-between ${compact ? "p-4" : "p-6"}`}>
            <div>
                <h3 className={`font-semibold text-slate-900 flex items-center gap-2 ${compact ? "text-base" : "text-lg"}`}>
                    {ch.name}
                    <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {ch.mode === "multi_human" ? "Team" : "Private"}
                    </span>
                </h3>
                {ch.description && <p className="text-sm text-slate-500 mt-0.5">{ch.description}</p>}
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => setEditing(true)} className={btnGhost}>Edit</button>
                <button
                    disabled={pending}
                    onClick={() => {
                        if (!confirm(`Delete "${ch.name}"? This removes its members and any groups under it.`)) return;
                        const fd = new FormData(); fd.set("channelId", ch.id); run(deleteChannelAction, fd);
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                    title="Delete"
                ><TrashIcon className="h-4 w-4" /></button>
            </div>
        </div>
    );
}

// ── Agents + members management for one channel ──
function ChannelPanel({ ch, allAgents, allUsers, channelAgents, channelMembers, channelMemberAgents, pending, run }: Props & {
    ch: Channel; pending: boolean; run: (a: any, fd: FormData) => void;
}) {
    const agentsHere = channelAgents.filter((a) => a.channelId === ch.id);
    const membersHere = channelMembers.filter((m) => m.channelId === ch.id);
    const agentName = (id: string) => allAgents.find((a) => a.id === id)?.name || "Unknown";
    const availableAgents = allAgents.filter((a) => !agentsHere.some((x) => x.agentProfileId === a.id));
    const availableUsers = allUsers.filter((u) => !membersHere.some((x) => x.userId === u.id));

    return (
        <div className="grid md:grid-cols-2 gap-6">
            {/* Agents */}
            <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    <CpuChipIcon className="h-4 w-4" /> Agents
                </div>
                <div className="space-y-1.5">
                    {agentsHere.length === 0 && <p className="text-sm text-slate-400">No agents yet.</p>}
                    {agentsHere.map((a) => (
                        <div key={a.agentProfileId} className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-1.5 text-sm">
                            <span className="flex items-center gap-1.5 text-slate-700">
                                {a.role === "lead" && <StarIcon className="h-4 w-4 text-amber-500" title="Lead — answers & routes" />}
                                {agentName(a.agentProfileId)}
                                {a.role === "lead"
                                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Lead</span>
                                    : <span className="text-[10px] text-slate-400">L{a.level}</span>}
                            </span>
                            <button
                                disabled={pending}
                                onClick={() => { const fd = new FormData(); fd.set("channelId", ch.id); fd.set("agentProfileId", a.agentProfileId); run(removeChannelAgentAction, fd); }}
                                className="text-slate-400 hover:text-red-600"
                            ><TrashIcon className="h-4 w-4" /></button>
                        </div>
                    ))}
                </div>
                {availableAgents.length > 0 && (
                    <form className="mt-2 flex items-end gap-2 flex-wrap"
                        action={(fd) => { fd.set("channelId", ch.id); run(addChannelAgentAction, fd); }}>
                        <select name="agentProfileId" required className={inputSm}>
                            {availableAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <select name="role" defaultValue="member" className={inputSm}>
                            <option value="member">Member</option>
                            <option value="lead">Lead</option>
                        </select>
                        <input name="level" type="number" min={0} defaultValue={0} title="Seniority" className={`${inputSm} w-16`} />
                        <button disabled={pending} className={btnAddSm}><PlusIcon className="h-4 w-4" /></button>
                    </form>
                )}
            </div>

            {/* Members */}
            <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    <UserGroupIcon className="h-4 w-4" /> People
                </div>
                <div className="space-y-1.5">
                    {membersHere.length === 0 && <p className="text-sm text-slate-400">No people yet.</p>}
                    {membersHere.map((m) => (
                        <MemberRow
                            key={m.userId} ch={ch} m={m} allUsers={allUsers}
                            agentsHere={agentsHere} agentName={agentName}
                            assigned={channelMemberAgents.filter((x) => x.channelId === ch.id && x.userId === m.userId)}
                            pending={pending} run={run}
                        />
                    ))}
                </div>
                {availableUsers.length > 0 && (
                    <form className="mt-2 flex items-end gap-2 flex-wrap"
                        action={(fd) => { fd.set("channelId", ch.id); run(addChannelMemberAction, fd); }}>
                        <select name="userId" required className={inputSm}>
                            {availableUsers.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                        </select>
                        <select name="access" defaultValue="talk" className={inputSm}>
                            <option value="talk">Can talk</option>
                            <option value="observe">Read-only</option>
                        </select>
                        <button disabled={pending} className={btnAddSm}><PlusIcon className="h-4 w-4" /></button>
                    </form>
                )}
            </div>
        </div>
    );
}

function MemberRow({ ch, m, allUsers, agentsHere, agentName, assigned, pending, run }: {
    ch: Channel; m: MemberLink; allUsers: UserRow[];
    agentsHere: AgentLink[]; agentName: (id: string) => string;
    assigned: MemberAgentLink[]; pending: boolean; run: (a: any, fd: FormData) => void;
}) {
    const [open, setOpen] = useState(false);
    const u = allUsers.find((x) => x.id === m.userId);
    const assignedIds = new Set(assigned.map((a) => a.agentProfileId));
    return (
        <div className="bg-slate-50 rounded-md px-3 py-1.5 text-sm">
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-700">
                    {m.access === "observe"
                        ? <EyeIcon className="h-4 w-4 text-slate-400" title="Read-only" />
                        : <ChatBubbleLeftRightIcon className="h-4 w-4 text-indigo-500" title="Can talk" />}
                    {u?.name || u?.email || "Unknown"}
                    {m.role === "operator" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">Operator</span>}
                    {m.access === "observe" && <span className="text-[10px] text-slate-400">read-only</span>}
                </span>
                <div className="flex items-center gap-2">
                    <button onClick={() => setOpen((v) => !v)} className="text-xs text-indigo-600 hover:underline">
                        {assignedIds.size ? `${assignedIds.size} agent${assignedIds.size > 1 ? "s" : ""}` : "all agents"}
                    </button>
                    <button
                        disabled={pending}
                        onClick={() => { const fd = new FormData(); fd.set("channelId", ch.id); fd.set("userId", m.userId); run(removeChannelMemberAction, fd); }}
                        className="text-slate-400 hover:text-red-600"
                    ><TrashIcon className="h-4 w-4" /></button>
                </div>
            </div>
            {open && (
                <form
                    className="mt-2 pt-2 border-t border-slate-200"
                    action={(fd) => {
                        const ids = agentsHere
                            .filter((a) => fd.get(`a_${a.agentProfileId}`) === "on")
                            .map((a) => a.agentProfileId);
                        const out = new FormData();
                        out.set("channelId", ch.id); out.set("userId", m.userId); out.set("agentIds", ids.join(","));
                        run(setMemberAgentsAction, out); setOpen(false);
                    }}
                >
                    <p className="text-xs text-slate-500 mb-1">Which agents can this person talk to? (none checked = all)</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {agentsHere.map((a) => (
                            <label key={a.agentProfileId} className="flex items-center gap-1 text-xs text-slate-600">
                                <input type="checkbox" name={`a_${a.agentProfileId}`} defaultChecked={assignedIds.has(a.agentProfileId)} />
                                {agentName(a.agentProfileId)}
                            </label>
                        ))}
                        {agentsHere.length === 0 && <span className="text-xs text-slate-400">Add agents to this channel first.</span>}
                    </div>
                    <button disabled={pending} className={btnPrimarySm}>Save access</button>
                </form>
            )}
        </div>
    );
}

// ── Create form (department or group) ──
function CreateChannelForm({ kind, parentId, pending, onSubmit }: {
    kind: "department" | "group"; parentId?: string; pending: boolean;
    onSubmit: (fd: FormData) => void;
}) {
    const [show, setShow] = useState(false);
    if (!show) {
        return (
            <button onClick={() => setShow(true)} className={kind === "department" ? btnPrimary : btnGhost + " text-xs"}>
                <PlusIcon className="h-4 w-4 inline -mt-0.5" /> New {kind}
            </button>
        );
    }
    return (
        <form
            className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3"
            action={(fd) => { fd.set("kind", kind); if (parentId) fd.set("parentId", parentId); onSubmit(fd); setShow(false); }}
        >
            <Field label="Name"><input name="name" required placeholder={kind === "department" ? "Sales" : "EU Team"} className={inputCls} /></Field>
            <Field label="Description"><input name="description" placeholder="Optional" className={inputCls} /></Field>
            <Field label="Members">
                <select name="mode" defaultValue="single_human" className={inputCls}>
                    <option value="single_human">Single person</option>
                    <option value="multi_human">Multiple people</option>
                </select>
            </Field>
            <button disabled={pending} className={btnPrimary}>Create</button>
            <button type="button" onClick={() => setShow(false)} className={btnGhost}>Cancel</button>
        </form>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">{label}</span>
            {children}
        </label>
    );
}

const inputCls = "border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const inputSm = "border border-slate-300 rounded-md px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const btnPrimary = "bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-1.5 disabled:opacity-50";
const btnPrimarySm = "bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md px-3 py-1 disabled:opacity-50";
const btnGhost = "text-slate-500 hover:text-slate-800 text-sm font-medium rounded-lg px-3 py-1.5";
const btnAddSm = "bg-indigo-600 hover:bg-indigo-700 text-white rounded-md p-1.5 disabled:opacity-50";
