"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeftIcon,
    ChevronDownIcon,
    ExclamationTriangleIcon,
    PlusIcon,
    TrashIcon,
} from "@heroicons/react/24/outline";
import { saveCustomToolAction } from "./actions";
import Tooltip from "../agents/Tooltip";

type Param = { name: string; type: string; description: string; required: boolean };
type Agent = { id: string; name: string };
export type ToolData = {
    id: string;
    name: string;
    description: string;
    method: string;
    urlTemplate: string;
    bodyTemplate: string;
    timeoutMs: number;
    enabled: boolean;
    headers: Record<string, string>;
    params: Param[];
    allowedAgentIds: string[];
};

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export default function ToolEditor({ agents, tool }: { agents: Agent[]; tool?: ToolData }) {
    const router = useRouter();
    const isEdit = !!tool;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [params, setParams] = useState<Param[]>(tool?.params ?? []);
    const [headers, setHeaders] = useState<{ key: string; value: string }[]>(
        tool ? Object.entries(tool.headers).map(([key, value]) => ({ key, value })) : []
    );
    const [allowed, setAllowed] = useState<string[]>(tool?.allowedAgentIds ?? []);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const fd = new FormData(e.currentTarget);
        if (tool) fd.set("toolId", tool.id);
        fd.set("paramsJson", JSON.stringify(params.filter((p) => p.name.trim())));
        const h: Record<string, string> = {};
        headers.forEach((row) => { if (row.key.trim()) h[row.key.trim()] = row.value; });
        fd.set("headersJson", JSON.stringify(h));
        fd.set("allowedAgentIdsJson", JSON.stringify(allowed));

        const result = await saveCustomToolAction(fd);
        if (!result.success) {
            setError(result.message || "Could not save the tool — please try again.");
            setLoading(false);
        } else {
            router.push("/dashboard/tools");
            router.refresh();
        }
    };

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-3xl mx-auto">
            <Link href="/dashboard/tools" className="inline-flex items-center gap-1.5 text-sm text-pulse-muted hover:text-pulse-text transition-colors motion-reduce:transition-none mb-4">
                <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" /> Custom Tools
            </Link>
            <h1 className="text-2xl font-bold text-pulse-text">{isEdit ? "Edit tool" : "New tool"}</h1>
            <p className="text-sm text-pulse-muted mt-1">
                Connect your own API or software as an action your agents can call. Define the request once — the AI fills in the parameters.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                {error && (
                    <div role="alert" className="p-3 text-sm text-red-400 bg-red-500/10 rounded-lg border border-red-500/30 flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Basics */}
                <section className="space-y-5">
                    <h2 className="text-base font-semibold text-pulse-text">Basics</h2>

                    <div className="grid sm:grid-cols-[2fr_1fr] gap-4">
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <label htmlFor="tool-name" className="block text-sm font-medium text-pulse-text-soft">Tool name <span className="text-red-400">*</span></label>
                                <Tooltip text="The identifier the AI uses to call this tool — letters, numbers, and underscores only." />
                            </div>
                            <input id="tool-name" name="name" type="text" required defaultValue={tool?.name} placeholder="get_order_status"
                                className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-pulse-panel text-pulse-text placeholder:text-pulse-faint" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <label htmlFor="tool-method" className="block text-sm font-medium text-pulse-text-soft">Method</label>
                                <Tooltip text="The HTTP method used when the AI calls this tool." />
                            </div>
                            <select id="tool-method" name="method" defaultValue={tool?.method || "GET"}
                                className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-pulse-panel text-pulse-text">
                                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <label htmlFor="tool-description" className="block text-sm font-medium text-pulse-text-soft">Description <span className="text-red-400">*</span></label>
                            <Tooltip text="Tells the AI when to use this tool — be specific about what it does and when it applies." />
                        </div>
                        <input id="tool-description" name="description" type="text" required defaultValue={tool?.description} placeholder="Look up the status of a customer order by its ID"
                            className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-pulse-panel text-pulse-text placeholder:text-pulse-faint" />
                    </div>

                    <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <label htmlFor="tool-url" className="block text-sm font-medium text-pulse-text-soft">URL <span className="text-red-400">*</span></label>
                            <Tooltip text="The endpoint to call. Wrap parameter names in curly braces — e.g. {orderId} — and the AI fills them in." />
                        </div>
                        <input id="tool-url" name="urlTemplate" type="text" required defaultValue={tool?.urlTemplate} placeholder="https://api.yourcompany.com/orders/{orderId}"
                            className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-pulse-panel text-pulse-text placeholder:text-pulse-faint" />
                    </div>
                </section>

                {/* Parameters */}
                <section className="space-y-3">
                    <div className="flex items-center gap-1.5">
                        <h2 className="text-base font-semibold text-pulse-text">Parameters</h2>
                        <Tooltip text="Define what values the AI can — or must — provide when it calls this tool." />
                    </div>
                    <p className="text-sm text-pulse-muted">What the AI provides when it calls this tool.</p>

                    <div className="space-y-3">
                        {params.map((p, i) => (
                            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_1fr_auto_auto] gap-2 sm:items-center rounded-lg border border-pulse-border-subtle p-3 bg-pulse-panel-alt">
                                <input aria-label="Parameter name" value={p.name} onChange={(e) => setParams(params.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="orderId"
                                    className="px-3 py-2 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-pulse-panel text-pulse-text placeholder:text-pulse-faint" />
                                <select aria-label="Parameter type" value={p.type} onChange={(e) => setParams(params.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                                    className="px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-pulse-panel text-pulse-text">
                                    <option value="string">string</option>
                                    <option value="number">number</option>
                                    <option value="boolean">boolean</option>
                                </select>
                                <input aria-label="Parameter description" value={p.description} onChange={(e) => setParams(params.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Description"
                                    className="px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-pulse-panel text-pulse-text placeholder:text-pulse-faint" />
                                <label className="flex items-center gap-1.5 text-xs text-pulse-muted whitespace-nowrap px-1">
                                    <input type="checkbox" checked={p.required} onChange={(e) => setParams(params.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))}
                                        className="h-4 w-4 rounded border-pulse-border text-indigo-600 focus:ring-indigo-600 focus:ring-offset-2 focus:ring-offset-pulse-panel-alt cursor-pointer" />
                                    Required
                                </label>
                                <button type="button" onClick={() => setParams(params.filter((_, j) => j !== i))} aria-label="Remove parameter"
                                    className="p-1.5 rounded-md text-pulse-faint hover:text-red-400 hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 justify-self-end">
                                    <TrashIcon className="w-4 h-4" aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                        {params.length === 0 && <p className="text-sm text-pulse-faint italic">No parameters — the tool is called with no input.</p>}
                    </div>
                    <button type="button" onClick={() => setParams([...params, { name: "", type: "string", description: "", required: false }])}
                        className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-400 font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md">
                        <PlusIcon className="w-4 h-4" aria-hidden="true" /> Add parameter
                    </button>
                </section>

                {/* Headers / Auth */}
                <section className="space-y-3">
                    <div className="flex items-center gap-1.5">
                        <h2 className="text-base font-semibold text-pulse-text">Headers &amp; authentication</h2>
                        <Tooltip text="Sent with every request — for API keys or bearer tokens. Values are encrypted at rest." />
                    </div>
                    <p className="text-sm text-pulse-muted">Values are stored encrypted and never shown in plaintext elsewhere.</p>

                    <div className="space-y-3">
                        {headers.map((h, i) => (
                            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 sm:items-center rounded-lg border border-pulse-border-subtle p-3 bg-pulse-panel-alt">
                                <input aria-label="Header name" value={h.key} onChange={(e) => setHeaders(headers.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} placeholder="Authorization"
                                    className="px-3 py-2 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-pulse-panel text-pulse-text placeholder:text-pulse-faint" />
                                <input aria-label="Header value" value={h.value} onChange={(e) => setHeaders(headers.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="Bearer sk-…" type="password"
                                    className="px-3 py-2 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-pulse-panel text-pulse-text placeholder:text-pulse-faint" />
                                <button type="button" onClick={() => setHeaders(headers.filter((_, j) => j !== i))} aria-label="Remove header"
                                    className="p-1.5 rounded-md text-pulse-faint hover:text-red-400 hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 justify-self-end">
                                    <TrashIcon className="w-4 h-4" aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                        {headers.length === 0 && <p className="text-sm text-pulse-faint italic">No headers configured.</p>}
                    </div>
                    <button type="button" onClick={() => setHeaders([...headers, { key: "", value: "" }])}
                        className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-400 font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md">
                        <PlusIcon className="w-4 h-4" aria-hidden="true" /> Add header
                    </button>
                </section>

                {/* Agent scope */}
                <section className="space-y-3">
                    <div className="flex items-center gap-1.5">
                        <h2 className="text-base font-semibold text-pulse-text">Agent access</h2>
                        <Tooltip text="Restrict which agents may call this tool. Leave everything unselected to make it available to all agents." />
                    </div>
                    <p className="text-sm text-pulse-muted">
                        {allowed.length === 0 ? "Available to all agents." : `Scoped to ${allowed.length} agent${allowed.length > 1 ? "s" : ""}.`}
                    </p>

                    {agents.length === 0 ? (
                        <p className="text-sm text-pulse-faint italic">No agents yet — this tool will be available to any agent you create.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {agents.map((a) => {
                                const on = allowed.includes(a.id);
                                return (
                                    <button key={a.id} type="button" onClick={() => setAllowed(on ? allowed.filter((x) => x !== a.id) : [...allowed, a.id])}
                                        aria-pressed={on}
                                        className={`text-sm rounded-full px-3.5 py-1.5 border transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel ${on ? "bg-indigo-600 border-indigo-600 text-white" : "bg-pulse-panel border-pulse-border text-pulse-muted hover:border-indigo-400"}`}>
                                        {a.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Advanced */}
                <details className="group rounded-lg border border-pulse-border-subtle open:bg-pulse-panel-alt">
                    <summary className="cursor-pointer select-none list-none flex items-center justify-between p-4 text-sm font-medium text-pulse-text-soft outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg">
                        <span>Advanced — request body &amp; timeout</span>
                        <ChevronDownIcon className="w-4 h-4 text-pulse-faint transition-transform motion-reduce:transition-none group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="px-4 pb-4 space-y-4">
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <label htmlFor="tool-body" className="block text-sm font-medium text-pulse-text-soft">Body template</label>
                                <Tooltip text="For POST/PUT/PATCH requests. Use {param} placeholders — leave blank to send parameters as a JSON body automatically." />
                            </div>
                            <textarea id="tool-body" name="bodyTemplate" rows={3} defaultValue={tool?.bodyTemplate} placeholder='{"id": "{orderId}"}'
                                className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow resize-y bg-pulse-panel text-pulse-text placeholder:text-pulse-faint" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <label htmlFor="tool-timeout" className="block text-sm font-medium text-pulse-text-soft">Timeout (ms)</label>
                                <Tooltip text="How long to wait for the external API to respond before giving up." />
                            </div>
                            <input id="tool-timeout" name="timeoutMs" type="number" min={1000} max={30000} defaultValue={tool?.timeoutMs || 15000}
                                className="w-40 px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-pulse-panel text-pulse-text" />
                        </div>
                    </div>
                </details>

                {/* Actions */}
                <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end border-t border-pulse-border-subtle pt-5">
                    <Link href="/dashboard/tools" className="px-4 py-2 text-sm font-medium text-pulse-text-soft bg-pulse-panel border border-pulse-border rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none text-center cursor-pointer">Cancel</Link>
                    <button type="submit" disabled={loading}
                        className="inline-flex items-center justify-center gap-1.5 px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors motion-reduce:transition-none">
                        {loading && <svg className="animate-spin motion-reduce:animate-none h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>}
                        {loading ? "Saving…" : isEdit ? "Save changes" : "Create tool"}
                    </button>
                </div>
            </form>
        </div>
    );
}
