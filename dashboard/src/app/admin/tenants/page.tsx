import { db } from "../../../storage/db";
import { tenants, tenantBalances, pairingCodes } from "../../../storage/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  MagnifyingGlassIcon
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import CreateTenantModal from "./CreateTenantModal";
import TenantActionsMenu from "./TenantActionsMenu";

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
    <div className="p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#EDEDED] tracking-tight">Tenant Management</h1>
          <p className="text-sm text-[#8A8A90] mt-1">View and manage all client workspaces on the Pulse Gateway.</p>
        </div>

        <CreateTenantModal />
      </div>

      <div className="bg-[#0C0C0E] rounded-xl border border-[#242429]">
        {/* Toolbar */}
        <div className="p-4 border-b border-[#242429] flex justify-between items-center bg-[#101012]">
          <div className="relative w-full max-w-md">
            <MagnifyingGlassIcon className="w-5 h-5 text-[#5A5A61] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or slug..."
              className="w-full pl-10 pr-4 py-2 bg-[#101012] border border-[#242429] text-[#EDEDED] placeholder:text-[#5A5A61] rounded-lg text-sm focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#101012] text-[#5A5A61] text-xs uppercase tracking-wider border-b border-[#242429]">
                <th className="px-6 py-4 font-medium">Tenant Name</th>
                <th className="px-6 py-4 font-medium">Slug</th>
                <th className="px-6 py-4 font-medium">Credit Balance</th>
                <th className="px-6 py-4 font-medium">Features</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1C1F]">
              {allTenants.map((tenant) => {
                const cfg = (tenant.config as Record<string, any>) || {};
                const pendingCount = pendingMap.get(tenant.id) || 0;

                return (
                  <tr key={tenant.id} className="hover:bg-[#101012] transition-colors">
                    <td className="px-6 py-4">
                      <Link href={`/admin/tenants/${tenant.id}`} className="block">
                        <div className="font-medium text-[#8B5CF6] hover:text-[#A78BFA]">{tenant.name}</div>
                        <div className="text-xs text-[#8A8A90] font-sans mt-0.5">{tenant.id}</div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#B5B5BA]">
                      <span className="bg-[#141417] text-[#8A8A90] border border-[#242429] px-2 py-1 rounded-md text-xs font-sans">
                        {tenant.slug}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`text-sm font-semibold ${parseFloat(tenant.balance || "0") < 0 ? 'text-[#F0503C]' : 'text-[#EDEDED]'}`}>
                        ${parseFloat(tenant.balance || "0").toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {cfg.enable_third_party_cli && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#141417] text-[#8A8A90] border border-[#242429]">
                            OAuth
                          </span>
                        )}
                        {cfg.telegram_group_policy && cfg.telegram_group_policy !== "disabled" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#141417] text-[#8A8A90] border border-[#242429]">
                            Groups
                          </span>
                        )}
                        {cfg.telegram_dm_policy === "pairing" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/40">
                            Pairing
                          </span>
                        )}
                        {pendingCount > 0 && (
                          <Link href={`/admin/tenants/${tenant.id}/approvals`}>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F0503C]/10 text-[#F0503C] border border-[#F0503C]/40 cursor-pointer">
                              {pendingCount} pending
                            </span>
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${tenant.status === 'active' ? 'bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40' : 'bg-[#F0503C]/10 text-[#F0503C] border border-[#F0503C]/40'}
                      `}>
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <TenantActionsMenu tenantId={tenant.id} currentStatus={tenant.status as string} />
                    </td>
                  </tr>
                );
              })}
              {allTenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-[#8A8A90]">
                    No tenants found. Play the seed script to create one!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
