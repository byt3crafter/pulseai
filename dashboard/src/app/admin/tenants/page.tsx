import { db } from "../../../storage/db";
import { tenants, tenantBalances } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import {
  MagnifyingGlassIcon
} from "@heroicons/react/24/outline";
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
    createdAt: tenants.createdAt,
    balance: tenantBalances.balance
  })
    .from(tenants)
    .leftJoin(tenantBalances, eq(tenants.id, tenantBalances.tenantId));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tenant Management</h1>
          <p className="text-sm text-gray-500 mt-1">View and manage all client workspaces on the Pulse Gateway.</p>
        </div>

        <CreateTenantModal />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
                <th className="px-6 py-4 font-medium">Tenant Name</th>
                <th className="px-6 py-4 font-medium">Slug</th>
                <th className="px-6 py-4 font-medium">Credit Balance</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {allTenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{tenant.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">{tenant.id}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md text-xs font-mono">
                      {tenant.slug}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`text-sm font-semibold ${parseFloat(tenant.balance || "0") < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      ${tenant.balance || "0.00"}
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
              ))}
              {allTenants.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
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
