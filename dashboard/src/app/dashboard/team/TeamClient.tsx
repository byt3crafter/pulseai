"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    UserGroupIcon,
    PlusIcon,
    TrashIcon,
    EnvelopeIcon,
    ClipboardDocumentIcon,
    InformationCircleIcon,
    ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { PageHeader, Card, CardHeader, EmptyState } from "../../../components/dashboard/ui";
import AgentAvatar from "../../../components/dashboard/AgentAvatar";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { TENANT_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, type TenantRole } from "../../../utils/permissions";
import {
    createMemberAction,
    resendInviteAction,
    updateMemberRoleAction,
    removeMemberAction,
    setMemberDepartmentsAction,
} from "./actions";

type Department = { channelId: string; path: string; access: string };
type Member = {
    id: string;
    name: string | null;
    email: string;
    accessRole: string;
    twoFactorEnabled: boolean;
    lastLoginAt: string | null;
    status: "active" | "invited";
    departments: Department[];
};
type ChannelOption = { id: string; path: string; kind: "department" | "group" };
type DeptValue = "none" | "talk" | "observe";

interface Props {
    members: Member[];
    channelOptions: ChannelOption[];
    currentUserId: string;
    canManage: boolean;
}

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

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // Clipboard API can be unavailable (permissions/non-HTTPS) — silently ignore, the value is still on-screen.
    }
}

/** Three-way None / Talk / Observe picker used for a single department row. */
function DeptAccessPicker({
    value,
    onChange,
    disabled,
}: {
    value: DeptValue;
    onChange: (next: DeptValue) => void;
    disabled?: boolean;
}) {
    const OPTIONS: { value: DeptValue; label: string; on: string; off: string }[] = [
        { value: "none", label: "None", on: "bg-pulse-hover text-pulse-text-soft border-pulse-border-strong", off: "border-pulse-border text-pulse-faint hover:border-pulse-border-strong" },
        { value: "talk", label: "Talk", on: "bg-green-500/15 text-green-400 border-green-500/40", off: "border-pulse-border text-pulse-muted hover:border-green-400/60" },
        { value: "observe", label: "Observe", on: "bg-amber-500/15 text-amber-400 border-amber-500/40", off: "border-pulse-border text-pulse-muted hover:border-amber-400/60" },
    ];
    return (
        <div className="inline-flex items-center gap-1" role="group">
            {OPTIONS.map((opt) => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(opt.value)}
                        aria-pressed={active}
                        className={`text-[11px] font-medium rounded-full px-2 py-0.5 border transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${active ? opt.on : opt.off}`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

/** Shared department picker list — used inside both the create form and the per-row edit popover. */
function DepartmentPickerList({
    channelOptions,
    values,
    onChange,
    disabled,
}: {
    channelOptions: ChannelOption[];
    values: Record<string, DeptValue>;
    onChange: (channelId: string, next: DeptValue) => void;
    disabled?: boolean;
}) {
    if (channelOptions.length === 0) {
        return (
            <p className="text-xs text-pulse-faint">
                No departments yet — create one on the{" "}
                <a href="/dashboard/departments" className="text-indigo-500 hover:underline">
                    Departments
                </a>{" "}
                page first.
            </p>
        );
    }
    return (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {channelOptions.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                    <span className={`text-xs truncate ${c.kind === "group" ? "text-pulse-muted pl-3" : "text-pulse-text-soft font-medium"}`}>
                        {c.path}
                    </span>
                    <DeptAccessPicker value={values[c.id] || "none"} onChange={(v) => onChange(c.id, v)} disabled={disabled} />
                </div>
            ))}
        </div>
    );
}

function initialDeptValues(departments: Department[]): Record<string, DeptValue> {
    const out: Record<string, DeptValue> = {};
    for (const d of departments) {
        if (d.access === "talk" || d.access === "observe") out[d.channelId] = d.access;
    }
    return out;
}

function appendDeptFields(fd: FormData, channelOptions: ChannelOption[], values: Record<string, DeptValue>) {
    for (const c of channelOptions) {
        fd.set(`dept_${c.id}`, values[c.id] || "none");
    }
}

/** Read-only summary chips for a member's departments, shown in the table cell. */
function DepartmentChips({ departments }: { departments: Department[] }) {
    if (departments.length === 0) return <span className="text-xs text-pulse-faint">— none</span>;
    return (
        <div className="flex flex-wrap gap-1 max-w-xs">
            {departments.map((d) => (
                <span
                    key={d.channelId}
                    title={d.access === "observe" ? "Read-only" : "Can talk"}
                    className={`inline-flex items-center text-[11px] rounded-full px-2 py-0.5 border ${
                        d.access === "observe"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-green-500/10 text-green-400 border-green-500/30"
                    }`}
                >
                    {d.path}
                </span>
            ))}
        </div>
    );
}

/** Popover to edit an existing member's department assignments in place. */
function DepartmentsEditor({
    member,
    channelOptions,
    canManage,
    onSaved,
}: {
    member: Member;
    channelOptions: ChannelOption[];
    canManage: boolean;
    onSaved: (fd: FormData) => void;
}) {
    const [open, setOpen] = useState(false);
    const [values, setValues] = useState<Record<string, DeptValue>>(() => initialDeptValues(member.departments));
    const containerRef = useRef<HTMLDivElement>(null);

    if (!canManage) return <DepartmentChips departments={member.departments} />;

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => {
                    setValues(initialDeptValues(member.departments));
                    setOpen((v) => !v);
                }}
                className="text-left cursor-pointer"
            >
                <DepartmentChips departments={member.departments} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
                    <div className="absolute z-20 mt-2 w-72 rounded-lg border border-pulse-border bg-pulse-panel shadow-lg p-3 left-0">
                        <p className="text-[11px] text-pulse-muted mb-2">Assign {member.name || member.email} to departments.</p>
                        <DepartmentPickerList channelOptions={channelOptions} values={values} onChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))} />
                        <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-pulse-border-subtle">
                            <button type="button" onClick={() => setOpen(false)} className="text-xs text-pulse-muted hover:text-pulse-text px-2 py-1 cursor-pointer">
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const fd = new FormData();
                                    fd.set("userId", member.id);
                                    appendDeptFields(fd, channelOptions, values);
                                    onSaved(fd);
                                    setOpen(false);
                                }}
                                className="text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-3 py-1 cursor-pointer transition-colors motion-reduce:transition-none"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function RoleControl({
    member,
    canManage,
    ownerCount,
    onChange,
    disabled,
}: {
    member: Member;
    canManage: boolean;
    ownerCount: number;
    onChange: (next: string) => void;
    disabled?: boolean;
}) {
    if (!canManage) {
        return (
            <span className="inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 border bg-pulse-panel-alt text-pulse-text-soft border-pulse-border-subtle">
                {ROLE_LABELS[member.accessRole] ?? member.accessRole}
            </span>
        );
    }

    const lockedAsLastOwner = member.accessRole === "owner" && ownerCount <= 1;

    return (
        <select
            value={member.accessRole}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || lockedAsLastOwner}
            title={lockedAsLastOwner ? "Assign another owner before changing this one's role." : undefined}
            aria-label={`Role for ${member.email}`}
            className="border border-pulse-border rounded-lg px-2.5 py-1.5 text-xs bg-pulse-panel text-pulse-text focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
            {TENANT_ROLES.map((role) => (
                <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                </option>
            ))}
        </select>
    );
}

function CreateMemberModal({ channelOptions, onCreated }: { channelOptions: ChannelOption[]; onCreated: () => void }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [deptValues, setDeptValues] = useState<Record<string, DeptValue>>({});
    const [result, setResult] = useState<{ delivered: boolean; email: string; tempPassword?: string; inviteLink: string; name: string } | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    const close = () => {
        setOpen(false);
        setError("");
        setResult(null);
        setDeptValues({});
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        const fd = new FormData(e.currentTarget);
        appendDeptFields(fd, channelOptions, deptValues);
        const name = (fd.get("name") as string) || "";

        const res = await createMemberAction(fd);
        setLoading(false);
        if (res.success) {
            setResult({
                delivered: !!res.delivered,
                email: res.email || (fd.get("email") as string),
                tempPassword: res.tempPassword,
                inviteLink: res.inviteLink || "",
                name,
            });
            onCreated();
        } else {
            setError(res.message);
        }
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 cursor-pointer transition-colors motion-reduce:transition-none"
            >
                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                Add member
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="add-member-title">
            <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
            <div ref={modalRef} className="relative bg-pulse-panel border border-pulse-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
                {result ? (
                    <div>
                        <h2 id="add-member-title" className="text-lg font-semibold text-pulse-text mb-4">
                            {result.name || "Team member"} added
                        </h2>
                        {result.delivered ? (
                            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 space-y-2">
                                <p className="text-sm text-green-400">Invite sent to {result.email}.</p>
                                <p className="text-xs text-pulse-muted">They'll set their own password from the emailed link.</p>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
                                <p className="text-sm text-amber-400">Email isn't configured — share this temporary password with {result.name || "them"} instead.</p>
                                <div className="flex items-center gap-2">
                                    <code className="text-sm bg-pulse-panel px-2.5 py-1.5 rounded border border-amber-500/40 text-pulse-text">
                                        {result.tempPassword}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(result.tempPassword || "")}
                                        className="text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
                                    >
                                        Copy
                                    </button>
                                </div>
                                <p className="text-[11px] text-pulse-muted">They'll be asked to change it on first login.</p>
                            </div>
                        )}
                        {result.inviteLink && (
                            <div className="mt-3 flex items-center gap-2">
                                <input readOnly value={result.inviteLink} className="flex-1 text-xs bg-pulse-panel-alt border border-pulse-border-subtle rounded-lg px-2.5 py-1.5 text-pulse-muted" />
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(result.inviteLink)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-pulse-muted hover:text-pulse-text border border-pulse-border rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors motion-reduce:transition-none"
                                    title="Copy invite link"
                                >
                                    <ClipboardDocumentIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                    Copy link
                                </button>
                            </div>
                        )}
                        <div className="flex justify-end mt-5">
                            <button
                                onClick={close}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 cursor-pointer transition-colors motion-reduce:transition-none"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <h2 id="add-member-title" className="text-lg font-semibold text-pulse-text mb-4">
                            Add team member
                        </h2>
                        {error && (
                            <div role="alert" className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                                {error}
                            </div>
                        )}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="member-name" className="block text-xs font-medium text-pulse-muted mb-1">
                                    Name
                                </label>
                                <input
                                    id="member-name"
                                    name="name"
                                    type="text"
                                    required
                                    className="w-full border border-pulse-border rounded-lg px-3 py-2 text-sm bg-pulse-panel text-pulse-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="member-email" className="block text-xs font-medium text-pulse-muted mb-1">
                                    Email
                                </label>
                                <input
                                    id="member-email"
                                    name="email"
                                    type="email"
                                    required
                                    className="w-full border border-pulse-border rounded-lg px-3 py-2 text-sm bg-pulse-panel text-pulse-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="member-role" className="block text-xs font-medium text-pulse-muted mb-1">
                                    Access role
                                </label>
                                <select
                                    id="member-role"
                                    name="accessRole"
                                    defaultValue="member"
                                    className="w-full border border-pulse-border rounded-lg px-3 py-2 text-sm bg-pulse-panel text-pulse-text focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                >
                                    {TENANT_ROLES.map((r) => (
                                        <option key={r} value={r}>
                                            {ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-pulse-muted mb-1.5">Departments (optional)</p>
                                <DepartmentPickerList
                                    channelOptions={channelOptions}
                                    values={deptValues}
                                    onChange={(id, v) => setDeptValues((prev) => ({ ...prev, [id]: v }))}
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={close} className="text-sm font-medium text-pulse-muted hover:text-pulse-text px-3 py-2 cursor-pointer">
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 cursor-pointer transition-colors motion-reduce:transition-none"
                                >
                                    {loading ? "Adding…" : "Add member"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function TeamClient({ members, channelOptions, currentUserId, canManage }: Props) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string; inviteLink?: string } | null>(null);
    const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

    const ownerCount = members.filter((m) => m.accessRole === "owner").length;

    function setBusy(id: string, busy: boolean) {
        setBusyRows((prev) => ({ ...prev, [id]: busy }));
    }

    function handleRoleChange(member: Member, next: string) {
        setBusy(member.id, true);
        startTransition(async () => {
            const res = await updateMemberRoleAction(member.id, next as TenantRole);
            setBusy(member.id, false);
            if (!res.success) setMessage({ type: "error", text: res.message });
            router.refresh();
        });
    }

    function handleResendInvite(member: Member) {
        setBusy(member.id, true);
        startTransition(async () => {
            const res = await resendInviteAction(member.id);
            setBusy(member.id, false);
            if (res.success) {
                setMessage({ type: "success", text: res.message, inviteLink: res.delivered ? undefined : res.inviteLink });
            } else {
                setMessage({ type: "error", text: res.message });
            }
            router.refresh();
        });
    }

    function handleSaveDepartments(fd: FormData) {
        const userId = fd.get("userId") as string;
        setBusy(userId, true);
        startTransition(async () => {
            const res = await setMemberDepartmentsAction(fd);
            setBusy(userId, false);
            if (!res.success) setMessage({ type: "error", text: res.message });
            router.refresh();
        });
    }

    function handleRemove() {
        if (!removeTarget) return;
        const id = removeTarget.id;
        setRemoveTarget(null);
        setBusy(id, true);
        startTransition(async () => {
            const res = await removeMemberAction(id);
            setBusy(id, false);
            setMessage({ type: res.success ? "success" : "error", text: res.message });
            router.refresh();
        });
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Team"
                description="Invite people to sign in to Pulse and assign them to departments."
                action={canManage ? <CreateMemberModal channelOptions={channelOptions} onCreated={() => router.refresh()} /> : undefined}
            />

            <div className="flex items-start gap-2 text-xs text-pulse-muted mb-4 px-1">
                <InformationCircleIcon className="w-4 h-4 text-pulse-faint flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                    Team members sign in to the Pulse desktop app and dashboard with their email + password. Assign them to
                    departments to control what they see. (Telegram access is managed separately in{" "}
                    <a href="/dashboard/people" className="text-indigo-500 hover:underline">
                        People
                    </a>
                    .)
                </p>
            </div>

            {message && (
                <div
                    role="status"
                    className={`mb-4 px-4 py-3 rounded-lg text-sm border flex items-start justify-between gap-3 ${
                        message.type === "success"
                            ? "bg-green-500/10 text-green-500 border-green-500/30"
                            : "bg-red-500/10 text-red-500 border-red-500/30"
                    }`}
                >
                    <div className="min-w-0">
                        <p>{message.text}</p>
                        {message.inviteLink && (
                            <div className="flex items-center gap-2 mt-2">
                                <input readOnly value={message.inviteLink} className="flex-1 min-w-0 text-xs bg-pulse-panel border border-pulse-border-subtle rounded-lg px-2.5 py-1.5 text-pulse-muted" />
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(message.inviteLink!)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-pulse-muted hover:text-pulse-text border border-pulse-border rounded-lg px-2.5 py-1.5 cursor-pointer whitespace-nowrap transition-colors motion-reduce:transition-none"
                                >
                                    <ClipboardDocumentIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                    Copy link
                                </button>
                            </div>
                        )}
                    </div>
                    <button onClick={() => setMessage(null)} className="text-current opacity-70 hover:opacity-100 cursor-pointer flex-shrink-0" aria-label="Dismiss">
                        &times;
                    </button>
                </div>
            )}

            <Card>
                <CardHeader title="Members" description="Everyone with a Pulse account in your workspace." />
                {members.length === 0 ? (
                    <EmptyState
                        icon={UserGroupIcon}
                        title="No team members yet"
                        description="Add your first team member above — they'll sign in with their own email and password."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-xs uppercase tracking-wide text-pulse-faint border-b border-pulse-border-subtle">
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Member</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Role</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Departments</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Last login</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {members.map((member) => {
                                    const busy = !!busyRows[member.id];
                                    const label = member.name || member.email;
                                    const isSelf = member.id === currentUserId;
                                    const isLastOwner = member.accessRole === "owner" && ownerCount <= 1;
                                    const removeDisabled = !canManage || busy || isSelf || isLastOwner;
                                    const removeTitle = isSelf
                                        ? "You can't remove your own account."
                                        : isLastOwner
                                        ? "You can't remove the last owner."
                                        : "Remove from workspace";

                                    return (
                                        <tr key={member.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex items-center gap-3">
                                                    <AgentAvatar name={label} avatar={null} size="sm" />
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-pulse-text truncate">
                                                            {label}
                                                            {isSelf && <span className="text-pulse-faint font-normal"> (you)</span>}
                                                        </p>
                                                        <p className="text-xs text-pulse-muted truncate">{member.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <RoleControl
                                                    member={member}
                                                    canManage={canManage}
                                                    ownerCount={ownerCount}
                                                    onChange={(next) => handleRoleChange(member, next)}
                                                    disabled={busy}
                                                />
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <DepartmentsEditor member={member} channelOptions={channelOptions} canManage={canManage} onSaved={handleSaveDepartments} />
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {member.status === "invited" ? (
                                                        <span className="inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 border bg-amber-500/10 text-amber-400 border-amber-500/30">
                                                            Invited
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 border bg-green-500/10 text-green-400 border-green-500/30">
                                                            Active
                                                        </span>
                                                    )}
                                                    {member.twoFactorEnabled && (
                                                        <span
                                                            title="Two-factor authentication enabled"
                                                            className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 border bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                                                        >
                                                            <ShieldCheckIcon className="w-3 h-3" aria-hidden="true" />
                                                            2FA
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 align-top text-pulse-muted text-xs whitespace-nowrap">
                                                {formatRelativeTime(member.lastLoginAt)}
                                            </td>
                                            <td className="px-4 py-3 align-top text-right">
                                                {canManage ? (
                                                    <div className="flex items-center justify-end gap-1">
                                                        {member.status === "invited" && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleResendInvite(member)}
                                                                disabled={busy}
                                                                aria-label={`Resend invite to ${member.email}`}
                                                                title="Resend invite"
                                                                className="p-1.5 rounded-lg text-pulse-faint hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                <EnvelopeIcon className="w-4 h-4" aria-hidden="true" />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setRemoveTarget(member)}
                                                            disabled={removeDisabled}
                                                            aria-label={`Remove ${label}`}
                                                            title={removeTitle}
                                                            className="p-1.5 rounded-lg text-pulse-faint hover:text-red-500 hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <TrashIcon className="w-4 h-4" aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-pulse-faint">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <ConfirmDialog
                theme="pulse"
                open={!!removeTarget}
                title="Remove team member"
                message={`This permanently removes ${removeTarget?.name || removeTarget?.email || "this person"} from your workspace, including their department access. This can't be undone.`}
                confirmLabel="Remove"
                variant="danger"
                onConfirm={handleRemove}
                onCancel={() => setRemoveTarget(null)}
            />
        </div>
    );
}
