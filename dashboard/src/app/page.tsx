import Link from "next/link";
import {
  CpuChipIcon,
  ShieldCheckIcon
} from "@heroicons/react/24/outline";

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 font-sans">

      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight mb-4">Welcome to Pulse Gateway</h1>
        <p className="text-lg text-slate-500 max-w-xl">
          Select your destination portal below to continue.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">

        {/* Super Admin Portal Entry */}
        <Link href="/admin" className="group relative bg-white border border-slate-200 rounded-2xl p-8 hover:border-indigo-500 hover:shadow-lg transition-all duration-300">
          <div className="w-14 h-14 bg-indigo-50 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <ShieldCheckIcon className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Super Admin Space</h2>
          <p className="text-slate-500">
            Manage your running SaaS instance. View all registered tenants, adjust Global API configurations, and monitor credit burndown.
          </p>
          <div className="mt-8 text-indigo-600 font-medium flex items-center gap-2">
            Enter Admin Portal <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>

        {/* Client Workspace Entry */}
        <Link href="/dashboard" className="group relative bg-white border border-slate-200 rounded-2xl p-8 hover:border-blue-500 hover:shadow-lg transition-all duration-300">
          <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <CpuChipIcon className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Client Workspace</h2>
          <p className="text-slate-500">
            Log into a specific Tenant instance to view agent analytics, channel integrations, and authorize CLI developer tools.
          </p>
          <div className="mt-8 text-blue-600 font-medium flex items-center gap-2">
            Enter Workspace <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>

      </div>
    </div>
  );
}
