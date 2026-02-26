import { db } from "../../../storage/db";
import { tenants, tenantBalances, pairingCodes } from "../../../storage/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  MagnifyingGlassIcon
} from "@heroicons/react/24/outline";
import Link from "next/link";
import CreateTenantModal from "./CreateTenantModal";
import TenantActionsMenu from "./TenantActionsMenu";

// Next.js App Router Server Component
export default async function TenantManagerPage() {

  // Bypass the database request entirely if we are currently compiling in a Docker image
  const isNextBuild = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

  if (isNextBuild) {
    return <div>Building Component</div>;
  }

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
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tenant Management</h1>
          <p className="text-sm text-gray-500 mt-1">View and manage all client workspaces on the Pulse Gateway.</p>
        </div>

        <CreateTenantModal />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div className="relative w-full max-w-md">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or slug..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
                <th className="px-6 py-4 font-medium">Tenant Name</th>
                <th className="px-6 py-4 font-medium">Slug</th>
                <th className="px-6 py-4 font-medium">Credit Balance</th>
                <th className="px-6 py-4 font-medium">Features</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {allTenants.map((tenant) => {
                const cfg = (tenant.config as Record<string, any>) || {};
                const pendingCount = pendingMap.get(tenant.id) || 0;

                return (
                  <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link href={`/admin/tenants/${tenant.id}`} className="block">
                        <div className="font-medium text-indigo-600 hover:text-indigo-700">{tenant.name}</div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">{tenant.id}</div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md text-xs font-mono">
                        {tenant.slug}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`text-sm font-semibold ${parseFloat(tenant.balance || "0") < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        ${parseFloat(tenant.balance || "0").toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {cfg.enable_third_party_cli && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            OAuth
                          </span>
                        )}
                        {cfg.telegram_group_policy && cfg.telegram_group_policy !== "disabled" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            Groups
                          </span>
                        )}
                        {cfg.telegram_dm_policy === "pairing" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            Pairing
                          </span>
                        )}
                        {pendingCount > 0 && (
                          <Link href={`/admin/tenants/${tenant.id}/approvals`}>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 cursor-pointer">
                              {pendingCount} pending
                            </span>
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${tenant.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
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
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
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
