"use client";

import { useState } from "react";
import Link from "next/link";
import { getModelDisplayName, getProviderName } from "../../../utils/models";

interface ModelBreakdown {
    model: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    totalCredits: number;
    count: number;
}

interface UsageRecord {
    id: string;
    conversationId: string | null;
    model: string;
    inputTokens: string | null;
    outputTokens: string | null;
    costUsd: string | null;
    creditsUsed: string | null;
    createdAt: string;
}

interface LedgerTransaction {
    id: string;
    amount: string;
    type: string;
    description: string | null;
    referenceId: string | null;
    createdAt: string;
}

interface Props {
    totalTokens: number;
    totalCost: number;
    totalCredits: number;
    balance: number;
    modelBreakdown: ModelBreakdown[];
    usageRecords: UsageRecord[];
    ledgerTransactions: LedgerTransaction[];
}

const TABS = [
    { id: "overview", label: "Overview" },
    { id: "records", label: "Usage Records" },
    { id: "ledger", label: "Ledger" },
];

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
}

export default function UsageClient({
    totalTokens,
    totalCost,
    totalCredits,
    balance,
    modelBreakdown,
    usageRecords,
    ledgerTransactions,
}: Props) {
    const [activeTab, setActiveTab] = useState("overview");

    const maxTokens = Math.max(
        ...modelBreakdown.map((m) => m.totalInputTokens + m.totalOutputTokens),
        1
    );

    return (
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Usage & Billing
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Monitor token consumption, costs, and credit balance.
                </p>
            </div>

            {/* Tab nav */}
            <div className="border-b border-slate-200 mb-6">
                <nav className="flex gap-0">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === t.id
                                    ? "border-indigo-600 text-indigo-600"
                                    : "border-transparent text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Overview Tab */}
            {activeTab === "overview" && (
                <div className="space-y-6">
                    {/* Stat Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard
                            label="Total Tokens"
                            value={formatNumber(totalTokens)}
                        />
                        <StatCard
                            label="Total Cost"
                            value={`$${totalCost.toFixed(4)}`}
                        />
                        <StatCard
                            label="Credits Used"
                            value={totalCredits.toFixed(2)}
                        />
                        <StatCard
                            label="Balance"
                            value={`$${balance.toFixed(2)}`}
                            highlight={balance < 0}
                        />
                    </div>

                    {/* Model Breakdown Bar Chart */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h2 className="text-sm font-semibold text-slate-900">
                                Usage by Model
                            </h2>
                        </div>
                        <div className="p-6 space-y-4">
                            {modelBreakdown.length === 0 && (
                                <p className="text-sm text-slate-400">
                                    No usage data yet.
                                </p>
                            )}
                            {modelBreakdown.map((m) => {
                                const total =
                                    m.totalInputTokens + m.totalOutputTokens;
                                const pct = (total / maxTokens) * 100;
                                return (
                                    <div key={m.model}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-slate-700">
                                                <span className="text-xs text-slate-400 mr-1">{getProviderName(m.model)}</span>
                                                {getModelDisplayName(m.model)}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                {formatNumber(total)} tokens &middot; $
                                                {m.totalCost.toFixed(4)}
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-3">
                                            <div
                                                className="bg-indigo-500 h-3 rounded-full transition-all"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Usage Records Tab */}
            {activeTab === "records" && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium">Model</th>
                                <th className="px-6 py-4 font-medium">
                                    Input Tokens
                                </th>
                                <th className="px-6 py-4 font-medium">
                                    Output Tokens
                                </th>
                                <th className="px-6 py-4 font-medium">Cost</th>
                                <th className="px-6 py-4 font-medium">Credits</th>
                                <th className="px-6 py-4 font-medium">
                                    Conversation
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {usageRecords.map((r) => (
                                <tr
                                    key={r.id}
                                    className="hover:bg-slate-50 transition-colors"
                                >
                                    <td className="px-6 py-3 text-sm text-slate-600">
                                        {r.createdAt
                                            ? new Date(
                                                  r.createdAt
                                              ).toLocaleDateString()
                                            : "—"}
                                    </td>
                                    <td className="px-6 py-3 text-sm text-slate-700">
                                        <span className="font-medium">{getModelDisplayName(r.model)}</span>
                                        <span className="text-xs text-slate-400 ml-1">({getProviderName(r.model)})</span>
                                    </td>
                                    <td className="px-6 py-3 text-sm text-slate-600">
                                        {formatNumber(
                                            parseFloat(r.inputTokens ?? "0")
                                        )}
                                    </td>
                                    <td className="px-6 py-3 text-sm text-slate-600">
                                        {formatNumber(
                                            parseFloat(r.outputTokens ?? "0")
                                        )}
                                    </td>
                                    <td className="px-6 py-3 text-sm text-slate-700 font-medium">
                                        $
                                        {parseFloat(r.costUsd ?? "0").toFixed(
                                            4
                                        )}
                                    </td>
                                    <td className="px-6 py-3 text-sm text-slate-600">
                                        {parseFloat(
                                            r.creditsUsed ?? "0"
                                        ).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-3 text-sm">
                                        {r.conversationId ? (
                                            <Link
                                                href={`/dashboard/conversations/${r.conversationId}`}
                                                className="text-indigo-600 hover:text-indigo-700 font-mono text-xs"
                                            >
                                                {r.conversationId.slice(0, 8)}...
                                            </Link>
                                        ) : (
                                            <span className="text-slate-400">
                                                —
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {usageRecords.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-6 py-12 text-center text-sm text-slate-400"
                                    >
                                        No usage records yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Ledger Tab */}
            {activeTab === "ledger" && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium">Type</th>
                                <th className="px-6 py-4 font-medium">Amount</th>
                                <th className="px-6 py-4 font-medium">
                                    Description
                                </th>
                                <th className="px-6 py-4 font-medium">
                                    Reference
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {ledgerTransactions.map((t) => {
                                const amt = parseFloat(t.amount);
                                const isPositive = amt >= 0;
                                return (
                                    <tr
                                        key={t.id}
                                        className="hover:bg-slate-50 transition-colors"
                                    >
                                        <td className="px-6 py-3 text-sm text-slate-600">
                                            {t.createdAt
                                                ? new Date(
                                                      t.createdAt
                                                  ).toLocaleDateString()
                                                : "—"}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                                                    t.type === "top_up"
                                                        ? "bg-green-100 text-green-800"
                                                        : "bg-red-100 text-red-800"
                                                }`}
                                            >
                                                {t.type.replace("_", " ")}
                                            </span>
                                        </td>
                                        <td
                                            className={`px-6 py-3 text-sm font-semibold ${
                                                isPositive
                                                    ? "text-green-700"
                                                    : "text-red-600"
                                            }`}
                                        >
                                            {isPositive ? "+" : ""}
                                            {amt.toFixed(4)}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-slate-600">
                                            {t.description || "—"}
                                        </td>
                                        <td className="px-6 py-3 text-xs text-slate-400 font-mono">
                                            {t.referenceId
                                                ? t.referenceId.slice(0, 12) +
                                                  "..."
                                                : "—"}
                                        </td>
                                    </tr>
                                );
                            })}
                            {ledgerTransactions.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-6 py-12 text-center text-sm text-slate-400"
                                    >
                                        No ledger transactions yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function StatCard({
    label,
    value,
    highlight,
}: {
    label: string;
    value: string;
    highlight?: boolean;
}) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {label}
            </p>
            <p
                className={`text-2xl font-bold mt-1 ${
                    highlight ? "text-red-600" : "text-slate-900"
                }`}
            >
                {value}
            </p>
        </div>
    );
}
