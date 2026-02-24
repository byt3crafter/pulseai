import Link from "next/link";
import {
    HomeIcon,
    KeyIcon,
    ChatBubbleBottomCenterTextIcon,
    CreditCardIcon,
    CpuChipIcon
} from "@heroicons/react/24/outline";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen bg-slate-50 flex-col md:flex-row w-full font-sans">

            {/* Sidebar for Customer Tenant */}
            <aside className="w-full md:w-64 bg-white text-slate-800 md:h-screen flex-shrink-0 flex flex-col border-r border-slate-200 shadow-sm">
                <div className="p-6 border-b border-slate-100 flex items-center gap-2">
                    <CpuChipIcon className="w-6 h-6 text-blue-600" />
                    <span className="text-xl font-bold tracking-tight text-slate-900">Pulse <span className="font-medium text-slate-500">Workspace</span></span>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium hover:bg-slate-50 text-slate-700 transition-colors">
                        <HomeIcon className="w-5 h-5" />
                        Workspace Overview
                    </Link>
                    <Link href="/dashboard/channels" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium hover:bg-slate-50 text-slate-700 transition-colors">
                        <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />
                        Integrations & Channels
                    </Link>
                    <Link href="/dashboard/settings" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium bg-blue-50 text-blue-700">
                        <KeyIcon className="w-5 h-5" />
                        Developer Tools & API
                    </Link>
                    <Link href="/dashboard/billing" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium hover:bg-slate-50 text-slate-700 transition-colors">
                        <CreditCardIcon className="w-5 h-5" />
                        Billing & Credits
                    </Link>
                </nav>

                <div className="p-4 border-t border-slate-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                        T
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-900">Tenant Workspace</span>
                        <span className="text-xs text-slate-500">Pro Plan</span>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto bg-slate-50 relative">
                {children}
            </main>
        </div>
    );
}
