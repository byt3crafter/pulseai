import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader, Card } from "../../../components/dashboard/ui";
import { getRuns } from "../../../utils/run-queries";
import TasksTable from "./TasksTable";

export const dynamic = "force-dynamic";

const FILTERS = [
    { id: "", label: "All" },
    { id: "running", label: "Running" },
    { id: "completed", label: "Completed" },
    { id: "failed", label: "Failed" },
    { id: "cancelled", label: "Cancelled" },
];

export default async function TasksPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; page?: string }>;
}) {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/login");
    const tenantId = (session.user as any).tenantId as string | undefined;

    const sp = await searchParams;
    const status = sp.status || "";
    const page = Math.max(0, parseInt(sp.page || "0", 10) || 0);

    const { rows, total, pageSize } = tenantId
        ? await getRuns(tenantId, { status, page })
        : { rows: [], total: 0, pageSize: 25 };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const qs = (s: string, p: number) => {
        const params = new URLSearchParams();
        if (s) params.set("status", s);
        if (p > 0) params.set("page", String(p));
        const q = params.toString();
        return q ? `/dashboard/tasks?${q}` : "/dashboard/tasks";
    };

    return (
        <div className="p-4 sm:p-5 lg:p-6 space-y-5">
            <PageHeader
                title="Task Queue"
                description="Every task your AI workforce has run — live, completed, or failed. Click a row for the tool trace and details."
            />

            <div className="flex flex-wrap items-center gap-1.5">
                {FILTERS.map((f) => {
                    const active = status === f.id;
                    return (
                        <Link
                            key={f.id || "all"}
                            href={qs(f.id, 0)}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                active ? "bg-pulse-tint text-pulse-accent-hi" : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"
                            }`}
                        >
                            {f.label}
                        </Link>
                    );
                })}
            </div>

            <Card>
                {rows.length === 0 ? (
                    <p className="px-5 py-12 text-center text-sm text-pulse-muted">
                        No tasks{status ? ` with status "${status}"` : ""} yet.
                    </p>
                ) : (
                    <TasksTable rows={rows} />
                )}
            </Card>

            {total > pageSize && (
                <div className="flex items-center justify-between text-sm text-pulse-muted">
                    <span>{total.toLocaleString()} tasks · page {page + 1} of {totalPages}</span>
                    <div className="flex gap-2">
                        {page > 0 && <Link href={qs(status, page - 1)} className="rounded-lg border border-pulse-border px-3 py-1.5 hover:bg-pulse-hover">Previous</Link>}
                        {page + 1 < totalPages && <Link href={qs(status, page + 1)} className="rounded-lg border border-pulse-border px-3 py-1.5 hover:bg-pulse-hover">Next</Link>}
                    </div>
                </div>
            )}
        </div>
    );
}
