import { db } from "../../../storage/db";
import { tenants, tenantBalances, pairingCodes } from "../../../storage/schema";
import { eq, sql } from "drizzle-orm";
import {
  MagnifyingGlassIcon
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import CreateTenantModal from "./CreateTenantModal";
import TenantActionsMenu from "./TenantActionsMenu";
import { ui, PageHeader, Panel, Badge } from "../../../components/admin/ui";

export const dynamic = "force-dynamic";

// Next.js App Router Server Component
export default async function TenantManagerPage() {

  // Bypass the database request entirely if we are currently compiling in a Docker image
  const isNextBuild = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

  if (isNextBuild) {
    return <div>Building Component</div>;
  }

  const session = await auth();
  if (!session?.user || (session.user as any).role !== "ADMIN") redirect("/admin/login");

  // Directly fetch tenants via DB on the server
  const allTenants = await db.select({
    id: tenants.id,
    name: tenants.name,
    slug: tenants.slug,
    status: tenants.status,
    config: tenants.config,
    createdAt: tenants.createdAt,
    balance: tenantBalances.balance
  })
    .from(tenants)
    .leftJoin(tenantBalances, eq(tenants.id, tenantBalances.tenantId));

  // Get pending approvals count per tenant
  const pendingCounts = await db
    .select({
      tenantId: pairingCodes.tenantId,
      count: sql<number>`count(*)`,
    })
    .from(pairingCodes)
    .where(eq(pairingCodes.status, "pending"))
    .groupBy(pairingCodes.tenantId);

  const pendingMap = new Map(pendingCounts.map((p) => [p.tenantId, Number(p.count)]));

  return (
    <div className={ui.page}>
      <PageHeader
        title="Tenant Management"
        subtitle="View and manage all client workspaces on the Pulse Gateway."
        action={<CreateTenantModal />}
      />

      <Panel bodyClassName="p-0">
        {/* Toolbar */}
        <div className="p-4 border-b border-[#242429]">
          <div className="relative w-full max-w-md">
            <MagnifyingGlassIcon className="w-4 h-4 text-[#5A5A61] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or slug..."
              className={`${ui.input} pl-9`}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className={ui.table}>
            <thead>
              <tr>
                <th className={ui.th}>Tenant Name</th>
                <th className={ui.th}>Slug</th>
                <th className={ui.thRight}>Credit Balance</th>
                <th className={ui.th}>Features</th>
                <th className={ui.th}>Status</th>
                <th className={ui.thRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allTenants.map((tenant) => {
                const cfg = (tenant.config as Record<string, any>) || {};
                const pendingCount = pendingMap.get(tenant.id) || 0;
                const balance = parseFloat(tenant.balance || "0");

                return (
                  <tr key={tenant.id} className={ui.row}>
                    <td className={ui.td}>
                      <Link href={`/admin/tenants/${tenant.id}`} className="block group">
                        <div className="text-[13px] font-medium text-[#EDEDED] group-hover:text-[#8B5CF6] transition-colors">
                          {tenant.name}
                        </div>
                        <div className="text-[11px] text-[#5A5A61] font-mono mt-0.5">{tenant.id}</div>
                      </Link>
                    </td>
                    <td className={ui.td}>
                      <Badge variant="neutral">
                        <span className="font-mono">{tenant.slug}</span>
                      </Badge>
                    </td>
                    <td className={ui.tdRight}>
                      <span className={balance < 0 ? "text-[#F0503C] font-medium" : "text-[#EDEDED] font-medium"}>
                        ${balance.toFixed(2)}
                      </span>
                    </td>
                    <td className={ui.td}>
                      <div className="flex flex-wrap gap-1">
                        {cfg.enable_third_party_cli && (
                          <Badge variant="neutral">OAuth</Badge>
                        )}
                        {cfg.telegram_group_policy && cfg.telegram_group_policy !== "disabled" && (
                          <Badge variant="neutral">Groups</Badge>
                        )}
                        {cfg.telegram_dm_policy === "pairing" && (
                          <Badge variant="accent">Pairing</Badge>
                        )}
                        {pendingCount > 0 && (
                          <Link href={`/admin/tenants/${tenant.id}/approvals`}>
                            <Badge variant="danger">{pendingCount} pending</Badge>
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className={ui.td}>
                      <Badge variant={tenant.status === "active" ? "success" : "danger"}>
                        <span className="capitalize">{tenant.status}</span>
                      </Badge>
                    </td>
                    <td className={ui.tdRight}>
                      <TenantActionsMenu tenantId={tenant.id} currentStatus={tenant.status as string} />
                    </td>
                  </tr>
                );
              })}
              {allTenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-[#8A8A90]">
                    No tenants found. Play the seed script to create one!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
