"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon, UsersIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { PageHeader, Card, CardHeader, EmptyState, SettingRow, Toggle, InfoTip } from "../../../components/dashboard/ui";
import AgentAvatar from "../../../components/dashboard/AgentAvatar";
import {
    updateDefaultPersonAccessAction,
    updatePersonAccessAction,
    updatePersonApproverAction,
    updatePersonApprovalModeAction,
    updatePersonAllowedAgentsAction,
    updatePersonLinkedUserAction,
    revokeApprovalAllowanceAction,
    deletePersonAction,
} from "./actions";

type Access = "talk" | "observe" | "blocked";
type ApprovalMode = "auto" | "requires_approval";

interface PersonRow {
    id: string;
    telegramUserId: string;
    displayName: string | null;
    username: string | null;
    access: Access;
    isApprover: boolean;
    approvalMode: ApprovalMode;
    allowedAgentIds: string[];
    /** Linked workspace member, so their Telegram messages are attributed. */
    userId: string | null;
    lastSeenAt: string | null;
}

interface Member {
    id: string;
    name: string;
}

interface Agent {
    id: string;
    name: string;
}

interface AllowanceRow {
    id: string;
    kind: "user" | "server";
    subject: string;
    label: string | null;
    createdAt: string | null;
}

const ACCESS_OPTIONS: { value: Access; label: string; on: string; off: string }[] = [
    { value: "talk", label: "Talk", on: "bg-green-500/15 text-green-400 border-green-500/40", off: "border-pulse-border text-pulse-muted hover:border-green-400/60" },
    { value: "observe", label: "Observe", on: "bg-amber-500/15 text-amber-400 border-amber-500/40", off: "border-pulse-border text-pulse-muted hover:border-amber-400/60" },
    { value: "blocked", label: "Blocked", on: "bg-red-500/15 text-red-400 border-red-500/40", off: "border-pulse-border text-pulse-muted hover:border-red-400/60" },
];

function formatRelativeTime(iso: string | null): string {
    if (!iso) return "Never";
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.round(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return date.toLocaleDateString();
}

function AccessSegmented({
    value,
    onChange,
    disabled,
}: {
    value: Access;
    onChange: (next: Access) => void;
    disabled?: boolean;
}) {
    return (
        <div className="inline-flex items-center gap-1" role="group" aria-label="Access level">
            {ACCESS_OPTIONS.map((opt) => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(opt.value)}
                        aria-pressed={active}
                        className={`text-xs font-medium rounded-full px-2.5 py-1 border transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${active ? opt.on : opt.off}`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Compact legend for the People table — folds in what used to be a raw
 * paragraph dumped at the page bottom. Colored dots mirror the Access pill
 * colors (green/amber/red); "Requires approval" gets an InfoTip since it
 * needs a full sentence to explain the approver hand-off.
 */
function AccessLegend() {
    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-2.5 border-b border-pulse-border-subtle bg-pulse-panel-alt/60 text-xs text-pulse-muted">
            <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true" />
                <span className="font-medium text-pulse-text-soft">Talk</span> responds
            </span>
            <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                <span className="font-medium text-pulse-text-soft">Observe</span> watches only
            </span>
            <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true" />
                <span className="font-medium text-pulse-text-soft">Blocked</span> ignored
            </span>
            <span className="inline-flex items-center gap-1">
                <span className="font-medium text-pulse-text-soft">Requires approval</span> holds messages for an approver
                <InfoTip text={'Held until a designated "Approver" taps Allow/Deny on a Telegram DM card. Toggle a person as an Approver in the table below so they receive those cards.'} />
            </span>
        </div>
    );
}

function AllowedAgentsPicker({
    agents,
    allowed,
    onChange,
    disabled,
}: {
    agents: Agent[];
    allowed: string[];
    onChange: (next: string[]) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                disabled={disabled || agents.length === 0}
                onClick={() => setOpen((o) => !o)}
                className="text-xs px-2.5 py-1 rounded-full border border-pulse-border text-pulse-muted hover:border-pulse-border-strong hover:text-pulse-text-soft transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {agents.length === 0 ? "No agents" : allowed.length === 0 ? "All agents" : `${allowed.length} agent${allowed.length > 1 ? "s" : ""}`}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
                    <div className="absolute z-20 mt-1.5 w-56 max-h-64 overflow-y-auto rounded-lg border border-pulse-border bg-pulse-panel shadow-lg p-2 right-0">
                        <p className="px-1.5 py-1 text-[10px] uppercase tracking-wide text-pulse-faint">Empty = all agents</p>
                        {agents.map((a) => {
                            const checked = allowed.includes(a.id);
                            return (
                                <label
                                    key={a.id}
                                    className="flex items-center gap-2 px-1.5 py-1.5 rounded-md text-sm text-pulse-text-soft hover:bg-pulse-hover cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                            onChange(checked ? allowed.filter((id) => id !== a.id) : [...allowed, a.id])
                                        }
                                        className="rounded border-pulse-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <span className="truncate">{a.name}</span>
                                </label>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

export default function PeopleClient({
    people,
    agents,
    members,
    defaultAccess,
    allowances,
}: {
    people: PersonRow[];
    agents: Agent[];
    members: Member[];
    defaultAccess: Access;
    allowances: AllowanceRow[];
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [defaultAccessValue, setDefaultAccessValue] = useState<Access>(defaultAccess);

    function setBusy(id: string, busy: boolean) {
        setBusyRows((prev) => ({ ...prev, [id]: busy }));
    }

    function runAction(id: string, action: (fd: FormData) => Promise<{ success: boolean; message: string }>, fd: FormData) {
        setBusy(id, true);
        startTransition(async () => {
            const res = await action(fd);
            setBusy(id, false);
            if (!res.success) setMessage({ type: "error", text: res.message });
            router.refresh();
        });
    }

    function handleDefaultAccessChange(next: Access) {
        setDefaultAccessValue(next);
        const fd = new FormData();
        fd.set("defaultAccess", next);
        startTransition(async () => {
            const res = await updateDefaultPersonAccessAction(fd);
            if (!res.success) setMessage({ type: "error", text: res.message });
        });
    }

    function handleAccessChange(person: PersonRow, next: Access) {
        const fd = new FormData();
        fd.set("personId", person.id);
        fd.set("access", next);
        runAction(person.id, updatePersonAccessAction, fd);
    }

    function handleApproverToggle(person: PersonRow, next: boolean) {
        const fd = new FormData();
        fd.set("personId", person.id);
        fd.set("isApprover", String(next));
        runAction(person.id, updatePersonApproverAction, fd);
    }

    function handleApprovalModeChange(person: PersonRow, next: ApprovalMode) {
        const fd = new FormData();
        fd.set("personId", person.id);
        fd.set("approvalMode", next);
        runAction(person.id, updatePersonApprovalModeAction, fd);
    }

    function handleAllowedAgentsChange(person: PersonRow, next: string[]) {
        const fd = new FormData();
        fd.set("personId", person.id);
        fd.set("allowedAgentIdsJson", JSON.stringify(next));
        runAction(person.id, updatePersonAllowedAgentsAction, fd);
    }

    function handleLinkedUserChange(person: PersonRow, next: string) {
        const fd = new FormData();
        fd.set("personId", person.id);
        fd.set("userId", next);
        runAction(person.id, updatePersonLinkedUserAction, fd);
    }

    function handleDelete(person: PersonRow) {
        const label = person.displayName || person.username || person.telegramUserId;
        if (!confirm(`Remove "${label}" from People? They'll be treated as brand-new (default access) if they message again.`)) return;
        const fd = new FormData();
        fd.set("personId", person.id);
        runAction(person.id, deletePersonAction, fd);
    }

    function handleRevokeAllowance(allowance: AllowanceRow) {
        const label = allowance.label || allowance.subject;
        if (!confirm(`Revoke the standing "Allow always" approval for "${label}"? Future requests will need approval again.`)) return;
        const fd = new FormData();
        fd.set("allowanceId", allowance.id);
        runAction(allowance.id, revokeApprovalAllowanceAction, fd);
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-[1060px] mx-auto">
            <PageHeader
                title="People"
                description="Account-wide access control for people messaging your agents on Telegram — applies to every group and DM, not per-channel."
            />

            {message && (
                <div
                    role="status"
                    className={`mb-4 px-4 py-3 rounded-lg text-sm border ${message.type === "success"
                        ? "bg-green-500/10 text-green-500 border-green-500/30"
                        : "bg-red-500/10 text-red-500 border-red-500/30"
                        }`}
                >
                    {message.text}
                </div>
            )}

            <div className="space-y-6">
                <Card>
                    <SettingRow
                        title="Default access for new people"
                        description="Applied automatically the first time someone messages your agents on Telegram."
                        control={<AccessSegmented value={defaultAccessValue} onChange={handleDefaultAccessChange} />}
                    />
                </Card>

                <Card>
                    <CardHeader
                        title="People"
                        description="Everyone who has messaged your agents on Telegram, across every group and DM."
                    />

                    {people.length === 0 ? (
                        <EmptyState
                            icon={UsersIcon}
                            title="No one has messaged your agents yet"
                            description={
                                <>
                                    People appear here automatically when they message an agent on Telegram — new people start as{" "}
                                    <span className="font-medium text-amber-500">Observe</span> by default.
                                </>
                            }
                        />
                    ) : (
                        <>
                            <AccessLegend />
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="text-xs uppercase tracking-wide text-pulse-faint border-b border-pulse-border-subtle">
                                            <th scope="col" className="px-4 py-3 text-left font-medium">Person</th>
                                            <th scope="col" className="px-4 py-3 text-left font-medium">Access</th>
                                            <th scope="col" className="px-4 py-3 text-left font-medium">
                                                <span className="inline-flex items-center gap-1">
                                                    Approver
                                                    <InfoTip text="Approvers receive Allow/Deny cards on Telegram whenever a person's message requires approval." />
                                                </span>
                                            </th>
                                            <th scope="col" className="px-4 py-3 text-left font-medium">
                                                <span className="inline-flex items-center gap-1">
                                                    Approval mode
                                                    <InfoTip text="Auto responds normally per their access level. Requires approval holds their messages until an Approver taps Allow." />
                                                </span>
                                            </th>
                                            <th scope="col" className="px-4 py-3 text-left font-medium">Allowed agents</th>
                                            <th scope="col" className="px-4 py-3 text-left font-medium">Member</th>
                                            <th scope="col" className="px-4 py-3 text-left font-medium">Last seen</th>
                                            <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {people.map((person) => {
                                            const busy = !!busyRows[person.id];
                                            const label = person.displayName || person.username || `Telegram user`;
                                            return (
                                                <tr key={person.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                                    {/* Person */}
                                                    <td className="px-4 py-3 align-top">
                                                        <div className="flex items-center gap-3">
                                                            <AgentAvatar name={label} avatar={null} size="sm" />
                                                            <div className="min-w-0">
                                                                <p className="font-medium text-pulse-text truncate">{label}</p>
                                                                {person.username && (
                                                                    <p className="text-xs text-pulse-muted truncate">@{person.username}</p>
                                                                )}
                                                                <p className="text-[11px] font-mono text-pulse-faint">{person.telegramUserId}</p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Access */}
                                                    <td className="px-4 py-3 align-top">
                                                        <AccessSegmented
                                                            value={person.access}
                                                            onChange={(next) => handleAccessChange(person, next)}
                                                            disabled={busy}
                                                        />
                                                    </td>

                                                    {/* Approver */}
                                                    <td className="px-4 py-3 align-top">
                                                        <Toggle
                                                            checked={person.isApprover}
                                                            onChange={(next) => handleApproverToggle(person, next)}
                                                            label={`${person.isApprover ? "Remove" : "Mark"} ${label} as approver`}
                                                            disabled={busy}
                                                        />
                                                    </td>

                                                    {/* Approval mode */}
                                                    <td className="px-4 py-3 align-top">
                                                        <select
                                                            value={person.approvalMode}
                                                            onChange={(e) => handleApprovalModeChange(person, e.target.value as ApprovalMode)}
                                                            disabled={busy}
                                                            aria-label={`Approval mode for ${label}`}
                                                            className="px-2.5 py-1.5 border border-pulse-border rounded-lg text-xs bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <option value="auto">Auto</option>
                                                            <option value="requires_approval">Requires approval</option>
                                                        </select>
                                                    </td>

                                                    {/* Allowed agents */}
                                                    <td className="px-4 py-3 align-top">
                                                        <AllowedAgentsPicker
                                                            agents={agents}
                                                            allowed={person.allowedAgentIds}
                                                            onChange={(next) => handleAllowedAgentsChange(person, next)}
                                                            disabled={busy}
                                                        />
                                                    </td>

                                                    {/* Linked workspace member */}
                                                    <td className="px-4 py-3 align-top">
                                                        <select
                                                            value={person.userId ?? ""}
                                                            onChange={(e) => handleLinkedUserChange(person, e.target.value)}
                                                            disabled={busy}
                                                            aria-label={`Linked workspace member for ${label}`}
                                                            title="Link this Telegram account to a workspace member so their requests are attributed to them"
                                                            className="px-2.5 py-1.5 border border-pulse-border rounded-lg text-xs bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <option value="">Not linked</option>
                                                            {members.map((m) => (
                                                                <option key={m.id} value={m.id}>{m.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>

                                                    {/* Last seen */}
                                                    <td className="px-4 py-3 align-top text-pulse-muted text-xs whitespace-nowrap">
                                                        {formatRelativeTime(person.lastSeenAt)}
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="px-4 py-3 align-top text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(person)}
                                                            disabled={busy}
                                                            aria-label={`Delete ${label}`}
                                                            className="p-1.5 rounded-lg text-pulse-faint hover:text-red-500 hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <TrashIcon className="w-4 h-4" aria-hidden="true" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </Card>

                {allowances.length === 0 ? (
                    <div className="flex items-center gap-2 px-1 text-xs text-pulse-muted">
                        <ShieldCheckIcon className="w-4 h-4 text-pulse-faint flex-shrink-0" aria-hidden="true" />
                        No standing approvals — every gated request is asked each time.
                    </div>
                ) : (
                    <Card>
                        <CardHeader
                            title="Standing approvals"
                            description={'People or servers a Telegram approver has tapped "Allow always" for — every future gated request is auto-approved with no prompt until revoked here.'}
                        />
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-xs uppercase tracking-wide text-pulse-faint border-b border-pulse-border-subtle">
                                        <th scope="col" className="px-4 py-3 text-left font-medium">Type</th>
                                        <th scope="col" className="px-4 py-3 text-left font-medium">Granted to</th>
                                        <th scope="col" className="px-4 py-3 text-left font-medium">Granted</th>
                                        <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allowances.map((allowance) => {
                                        const busy = !!busyRows[allowance.id];
                                        const label = allowance.label || allowance.subject;
                                        return (
                                            <tr key={allowance.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                                <td className="px-4 py-3 align-top">
                                                    <span
                                                        className={`inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 border ${
                                                            allowance.kind === "user"
                                                                ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                                                                : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                                                        }`}
                                                    >
                                                        {allowance.kind === "user" ? "Person" : "Server"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <p className="font-medium text-pulse-text truncate">{label}</p>
                                                    <p className="text-[11px] font-mono text-pulse-faint">{allowance.subject}</p>
                                                </td>
                                                <td className="px-4 py-3 align-top text-pulse-muted text-xs whitespace-nowrap">
                                                    {formatRelativeTime(allowance.createdAt)}
                                                </td>
                                                <td className="px-4 py-3 align-top text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRevokeAllowance(allowance)}
                                                        disabled={busy}
                                                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-pulse-border text-pulse-muted hover:border-red-400/60 hover:text-red-500 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Revoke
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
}
