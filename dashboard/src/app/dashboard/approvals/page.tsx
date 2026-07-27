import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader, Card } from "../../../components/dashboard/ui";
import { getPendingApprovals, getApprovalHistory, getStandingAllowances, type ApprovalItem } from "../../../utils/approval-queries";
import { relativeTime } from "../../../components/dashboard/run-ui";
import AllowancesClient from "./AllowancesClient";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
    tool_call: "Tool call",
    user_request: "User request",
    command: "Server command",
};

function StatusBadge({ status }: { status: string }) {
    const cls =
        status === "approved" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
        : status === "denied" ? "bg-red-500/10 text-red-500 border-red-500/30"
        : status === "expired" ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
        : "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>{status}</span>;
}

function ApprovalCard({ item, pending }: { item: ApprovalItem; pending?: boolean }) {
    return (
        <li className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
                {pending ? <StatusBadge status="pending" /> : <StatusBadge status={item.status} />}
                <span className="rounded-full border border-pulse-border bg-pulse-panel-alt px-2 py-0.5 text-[11px] font-medium text-pulse-muted">
                    {KIND_LABEL[item.kind] ?? item.kind}
                </span>
                {item.agentName && <span className="text-xs text-pulse-soft">{item.agentName}</span>}
                <span className="ml-auto text-xs text-pulse-faint">
                    {pending ? `requested ${relativeTime(item.createdAt)}` : item.decidedAt ? `${item.status} ${relativeTime(item.decidedAt)}` : relativeTime(item.createdAt)}
                </span>
            </div>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-pulse-border-subtle bg-pulse-panel-alt px-3 py-2 font-sans text-sm text-pulse-soft">
                {item.summary}
            </pre>
            <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-pulse-muted">
                {item.requesterName && <span>Requested by {item.requesterName}</span>}
                {item.decidedByName && <span>Decided by {item.decidedByName}</span>}
            </div>
        </li>
    );
}

export default async function ApprovalsPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/login");
    const tenantId = (session.user as any).tenantId as string | undefined;

    const [pendingItems, history, allowances] = tenantId
        ? await Promise.all([getPendingApprovals(tenantId), getApprovalHistory(tenantId, 50), getStandingAllowances(tenantId)])
        : [[], [], []];

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            <PageHeader
                title="Approval Center"
                description="Actions your agents paused for a human to sign off — awaiting decisions, the decision history, and standing allowances."
            />

            <Card>
                <div className="flex items-center justify-between border-b border-pulse-border-subtle px-5 py-3">
                    <h2 className="text-sm font-semibold text-pulse-text">Awaiting approval</h2>
                    {pendingItems.length > 0 && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">{pendingItems.length} pending</span>
                    )}
                </div>
                {pendingItems.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-pulse-muted">Nothing waiting. When an agent hits a gated action it appears here.</p>
                ) : (
                    <>
                        <p className="border-b border-pulse-border-subtle bg-pulse-panel-alt/40 px-5 py-2 text-xs text-pulse-muted">
                            Decisions are made from the approver's Telegram card (Allow / Deny / Allow&nbsp;always). This is the live view of what's outstanding.
                        </p>
                        <ul className="divide-y divide-pulse-border-subtle">
                            {pendingItems.map((item) => <ApprovalCard key={item.id} item={item} pending />)}
                        </ul>
                    </>
                )}
            </Card>

            <Card>
                <div className="border-b border-pulse-border-subtle px-5 py-3">
                    <h2 className="text-sm font-semibold text-pulse-text">Standing allowances</h2>
                    <p className="mt-0.5 text-xs text-pulse-muted">"Allow always" grants that skip the approval gate. Revoke to require approval again.</p>
                </div>
                <AllowancesClient allowances={allowances} />
            </Card>

            <Card>
                <div className="border-b border-pulse-border-subtle px-5 py-3">
                    <h2 className="text-sm font-semibold text-pulse-text">History</h2>
                    <p className="mt-0.5 text-xs text-pulse-muted">The last 50 decisions — your approval audit trail.</p>
                </div>
                {history.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-pulse-muted">No decisions yet.</p>
                ) : (
                    <ul className="divide-y divide-pulse-border-subtle">
                        {history.map((item) => <ApprovalCard key={item.id} item={item} />)}
                    </ul>
                )}
            </Card>
        </div>
    );
}
