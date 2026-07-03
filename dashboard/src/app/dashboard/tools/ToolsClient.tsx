"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WrenchScrewdriverIcon, PlusIcon, TrashIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { saveCustomToolAction, deleteCustomToolAction, toggleCustomToolAction } from "./actions";

type Param = { name: string; type: string; description: string; required: boolean };
type Agent = { id: string; name: string };
type Tool = {
    id: string; name: string; description: string; method: string;
    urlTemplate: string; bodyTemplate: string; timeoutMs: number; enabled: boolean;
    headers: Record<string, string>; params: Param[]; allowedAgentIds: string[];
};

export default function ToolsClient({ tools, agents }: { tools: Tool[]; agents: Agent[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [editing, setEditing] = useState<Tool | null>(null);
    const [creating, setCreating] = useState(false);

    const run = (action: (fd: FormData) => Promise<{ success: boolean; message: string }>, fd: FormData, after?: () => void) => {
        startTransition(async () => {
            const res = await action(fd);
            setMsg({ ok: res.success, text: res.message });
            if (res.success && after) after();
            router.refresh();
        });
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <WrenchScrewdriverIcon className="h-7 w-7 text-indigo-600" /> Custom Tools
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                        Connect your own API or software. Each tool becomes an action your agents can call — define the
                        request once, and the AI fills in the parameters. Secrets (auth headers) are encrypted at rest.
                    </p>
                </div>
                <button onClick={() => { setCreating(true); setEditing(null); }} className={btnPrimary}>
                    <PlusIcon className="h-4 w-4 inline -mt-0.5" /> New tool
                </button>
            </div>

            {msg && (
                <div className={`mb-4 rounded-lg px-4 py-2 text-sm border ${msg.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {msg.text}
                </div>
            )}

            {(creating || editing) && (
                <ToolForm
                    tool={editing}
                    agents={agents}
                    pending={pending}
                    onCancel={() => { setCreating(false); setEditing(null); }}
                    onSubmit={(fd) => run(saveCustomToolAction, fd, () => { setCreating(false); setEditing(null); })}
                />
            )}

            <div className="mt-6 space-y-3">
                {tools.length === 0 && !creating && (
                    <p className="text-slate-400 text-sm text-center py-10">No custom tools yet. Create one to connect your software.</p>
                )}
                {tools.map((t) => (
                    <div key={t.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <code className="text-sm font-semibold text-slate-900">{t.name}</code>
                                <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t.method}</span>
                                {!t.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Disabled</span>}
                            </div>
                            <p className="text-sm text-slate-600 mt-1">{t.description}</p>
                            <p className="text-xs text-slate-400 mt-1 truncate font-mono">{t.urlTemplate}</p>
                            {t.params.length > 0 && (
                                <p className="text-xs text-slate-400 mt-1">params: {t.params.map((p) => p.name).join(", ")}</p>
                            )}
                            <p className="text-xs text-slate-400 mt-1">
                                {t.allowedAgentIds.length > 0 ? `scoped to ${t.allowedAgentIds.length} agent${t.allowedAgentIds.length > 1 ? "s" : ""}` : "available to all agents"}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                onClick={() => { const fd = new FormData(); fd.set("toolId", t.id); fd.set("enabled", String(!t.enabled)); run(toggleCustomToolAction, fd); }}
                                className="text-xs text-slate-500 hover:text-slate-800" disabled={pending}
                            >{t.enabled ? "Disable" : "Enable"}</button>
                            <button onClick={() => { setEditing(t); setCreating(false); }} className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="Edit">
                                <PencilSquareIcon className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => { if (!confirm(`Delete "${t.name}"?`)) return; const fd = new FormData(); fd.set("toolId", t.id); run(deleteCustomToolAction, fd); }}
                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete" disabled={pending}
                            ><TrashIcon className="h-4 w-4" /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ToolForm({ tool, agents, pending, onCancel, onSubmit }: {
    tool: Tool | null; agents: Agent[]; pending: boolean;
    onCancel: () => void; onSubmit: (fd: FormData) => void;
}) {
    const [params, setParams] = useState<Param[]>(tool?.params ?? []);
    const [headers, setHeaders] = useState<{ key: string; value: string }[]>(
        tool ? Object.entries(tool.headers).map(([key, value]) => ({ key, value })) : []
    );
    const [allowed, setAllowed] = useState<string[]>(tool?.allowedAgentIds ?? []);

    const submit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (tool) fd.set("toolId", tool.id);
        fd.set("paramsJson", JSON.stringify(params.filter((p) => p.name.trim())));
        const h: Record<string, string> = {};
        headers.forEach((r) => { if (r.key.trim()) h[r.key.trim()] = r.value; });
        fd.set("headersJson", JSON.stringify(h));
        fd.set("allowedAgentIdsJson", JSON.stringify(allowed));
        onSubmit(fd);
    };

    return (
        <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-semibold text-slate-900">{tool ? "Edit tool" : "New tool"}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Tool name (the AI calls this)">
                    <input name="name" defaultValue={tool?.name} required placeholder="get_order_status" className={input} />
                </Field>
                <Field label="Method">
                    <select name="method" defaultValue={tool?.method || "GET"} className={input}>
                        {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
                    </select>
                </Field>
            </div>
            <Field label="Description (tell the AI when to use it)">
                <input name="description" defaultValue={tool?.description} required placeholder="Look up the status of a customer order by its ID" className={input} />
            </Field>
            <Field label="URL (use {param} for values the AI fills in)">
                <input name="urlTemplate" defaultValue={tool?.urlTemplate} required placeholder="https://api.yourcompany.com/orders/{orderId}" className={`${input} font-mono text-xs`} />
            </Field>

            {/* Parameters */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-500">Parameters (what the AI provides)</span>
                    <button type="button" onClick={() => setParams([...params, { name: "", type: "string", description: "", required: false }])} className="text-xs text-indigo-600 hover:underline">+ Add parameter</button>
                </div>
                <div className="space-y-2">
                    {params.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input value={p.name} onChange={(e) => setParams(params.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="orderId" className={`${inputSm} w-32`} />
                            <select value={p.type} onChange={(e) => setParams(params.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} className={inputSm}>
                                <option value="string">string</option><option value="number">number</option><option value="boolean">boolean</option>
                            </select>
                            <input value={p.description} onChange={(e) => setParams(params.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="description" className={`${inputSm} flex-1`} />
                            <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={p.required} onChange={(e) => setParams(params.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} />req</label>
                            <button type="button" onClick={() => setParams(params.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><TrashIcon className="h-4 w-4" /></button>
                        </div>
                    ))}
                    {params.length === 0 && <p className="text-xs text-slate-400">No parameters — the tool is called with no input.</p>}
                </div>
            </div>

            {/* Headers */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-500">Headers / auth (encrypted)</span>
                    <button type="button" onClick={() => setHeaders([...headers, { key: "", value: "" }])} className="text-xs text-indigo-600 hover:underline">+ Add header</button>
                </div>
                <div className="space-y-2">
                    {headers.map((h, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input value={h.key} onChange={(e) => setHeaders(headers.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} placeholder="Authorization" className={`${inputSm} w-40`} />
                            <input value={h.value} onChange={(e) => setHeaders(headers.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="Bearer sk-…" type="password" className={`${inputSm} flex-1 font-mono`} />
                            <button type="button" onClick={() => setHeaders(headers.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><TrashIcon className="h-4 w-4" /></button>
                        </div>
                    ))}
                    {headers.length === 0 && <p className="text-xs text-slate-400">No headers.</p>}
                </div>
            </div>

            {/* Agent scope */}
            <div>
                <span className="text-xs font-medium text-slate-500 mb-1.5 block">
                    Which agents can use this tool? <span className="text-slate-400">(none selected = all agents)</span>
                </span>
                {agents.length === 0 ? (
                    <p className="text-xs text-slate-400">No agents yet.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {agents.map((a) => {
                            const on = allowed.includes(a.id);
                            return (
                                <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => setAllowed(on ? allowed.filter((x) => x !== a.id) : [...allowed, a.id])}
                                    className={`text-xs rounded-full px-3 py-1 border transition-colors ${on ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-300 text-slate-600 hover:border-indigo-400"}`}
                                >{a.name}</button>
                            );
                        })}
                    </div>
                )}
            </div>

            <details className="text-sm">
                <summary className="cursor-pointer text-slate-500 text-xs">Advanced (request body, timeout)</summary>
                <div className="mt-3 space-y-3">
                    <Field label="Body template (POST/PUT/PATCH — {param} allowed; leave blank to send params as JSON)">
                        <textarea name="bodyTemplate" defaultValue={tool?.bodyTemplate} rows={3} placeholder='{"id": "{orderId}"}' className={`${input} font-mono text-xs`} />
                    </Field>
                    <Field label="Timeout (ms)">
                        <input name="timeoutMs" type="number" defaultValue={tool?.timeoutMs || 15000} min={1000} max={30000} className={`${input} w-32`} />
                    </Field>
                </div>
            </details>

            <div className="flex items-center gap-2 pt-1">
                <button disabled={pending} className={btnPrimary}>{tool ? "Save changes" : "Create tool"}</button>
                <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
            </div>
        </form>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block"><span className="text-xs font-medium text-slate-500 mb-1 block">{label}</span>{children}</label>;
}

const input = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const inputSm = "border border-slate-300 rounded-md px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const btnPrimary = "bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-1.5 disabled:opacity-50";
const btnGhost = "text-slate-500 hover:text-slate-800 text-sm font-medium rounded-lg px-3 py-1.5";
