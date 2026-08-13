"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, SettingRow, Toggle } from "../../../components/dashboard/ui";
import { saveWebSearchConfigAction, checkWebSearchHealthAction, type WebSearchSettings } from "./actions";

/**
 * Web Search setup — pick a backend and configure it. Self-hosted SearXNG +
 * Firecrawl (free/private, via docker-compose.search.yml) is the default; Tavily
 * and Brave are optional paid fallbacks. Nothing is hardcoded — every URL/key is
 * set here. Turning it on also enables the web_search / web_fetch tools.
 */
export default function WebSearchTab({ config }: { config: WebSearchSettings }) {
    const router = useRouter();
    const [enabled, setEnabled] = useState(config.enabled);
    const [searchProvider, setSearchProvider] = useState(config.searchProvider);
    const [fetchProvider, setFetchProvider] = useState(config.fetchProvider);
    const [searxngUrl, setSearxngUrl] = useState(config.searxngUrl);
    const [firecrawlUrl, setFirecrawlUrl] = useState(config.firecrawlUrl);
    const [ratePerMin, setRatePerMin] = useState(String(config.ratePerMin));
    const [maxResults, setMaxResults] = useState(String(config.maxResults));
    const [firecrawlApiKey, setFirecrawlApiKey] = useState("");
    const [tavilyApiKey, setTavilyApiKey] = useState("");
    const [braveApiKey, setBraveApiKey] = useState("");

    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [health, setHealth] = useState<{ searxng: boolean; firecrawl: boolean } | null>(null);
    const [checking, setChecking] = useState(false);

    function save() {
        setMsg(null);
        startTransition(async () => {
            const res = await saveWebSearchConfigAction({
                enabled,
                searchProvider,
                fetchProvider,
                searxngUrl,
                firecrawlUrl,
                ratePerMin: Number(ratePerMin) || 30,
                maxResults: Number(maxResults) || 5,
                firecrawlApiKey,
                tavilyApiKey,
                braveApiKey,
            });
            setMsg({ ok: res.success, text: res.message });
            if (res.success) {
                setFirecrawlApiKey("");
                setTavilyApiKey("");
                setBraveApiKey("");
                router.refresh();
            }
        });
    }

    async function testConnection() {
        setChecking(true);
        setHealth(null);
        try {
            const res = await checkWebSearchHealthAction({ searxngUrl, firecrawlUrl });
            setHealth({ searxng: res.searxng, firecrawl: res.firecrawl });
        } finally {
            setChecking(false);
        }
    }

    const keyField = (
        value: string,
        set: (v: string) => void,
        hasStored: boolean,
        placeholder: string,
    ) => (
        <div className="flex flex-col items-end gap-1.5">
            <input
                type="password"
                value={value === "__clear__" ? "" : value}
                onChange={(e) => set(e.target.value)}
                placeholder={hasStored ? "•••••••••• (saved)" : placeholder}
                autoComplete="off"
                className="w-64 rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {hasStored && (
                <button type="button" onClick={() => set("__clear__")} className="text-xs font-medium text-red-500 hover:text-red-400">
                    {value === "__clear__" ? "Will remove on save" : "Remove key"}
                </button>
            )}
        </div>
    );

    const inputCls = "w-72 rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500";
    const selectCls = "w-72 rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500";

    return (
        <div className="space-y-5">
            <Card>
                <CardHeader
                    title="Web Search"
                    description="Let your agents search the live web and read pages. Self-hosted by default — free and private."
                    action={
                        <button
                            type="button"
                            onClick={save}
                            disabled={pending}
                            className="rounded-lg bg-pulse-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pulse-accent-hi disabled:opacity-60"
                        >
                            {pending ? "Saving…" : "Save changes"}
                        </button>
                    }
                />
                {msg && <div className={`px-4 pt-4 text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>}

                <div className="divide-y divide-pulse-border-subtle">
                    <SettingRow
                        title="Enable web search"
                        description="Adds the web_search and web_fetch tools to your agents. Off = agents can't browse the web."
                        control={<Toggle checked={enabled} onChange={setEnabled} label="Enable web search" />}
                    />

                    <SettingRow
                        title="Search backend"
                        description="Where searches run. SearXNG is self-hosted (free, private). Tavily/Brave are paid APIs needing a key below."
                        control={
                            <select value={searchProvider} onChange={(e) => setSearchProvider(e.target.value as any)} className={selectCls}>
                                <option value="searxng">SearXNG (self-hosted — free)</option>
                                <option value="tavily">Tavily (paid API)</option>
                                <option value="brave">Brave Search (paid API)</option>
                            </select>
                        }
                    />

                    <SettingRow
                        title="Page-reading backend"
                        description="How web_fetch reads a page. Firecrawl returns clean markdown; Basic is a lightweight built-in fetcher."
                        control={
                            <select value={fetchProvider} onChange={(e) => setFetchProvider(e.target.value as any)} className={selectCls}>
                                <option value="firecrawl">Firecrawl (clean markdown)</option>
                                <option value="basic">Basic fetcher (built-in)</option>
                            </select>
                        }
                    />

                    <SettingRow
                        title="SearXNG URL"
                        description="The self-hosted SearXNG service. Default matches docker-compose.search.yml."
                        control={<input type="text" value={searxngUrl} onChange={(e) => setSearxngUrl(e.target.value)} placeholder="http://searxng:8080" className={inputCls} />}
                    />

                    <SettingRow
                        title="Firecrawl URL"
                        description="Self-hosted Firecrawl. Leave blank to use Firecrawl cloud (needs the API key below)."
                        control={<input type="text" value={firecrawlUrl} onChange={(e) => setFirecrawlUrl(e.target.value)} placeholder="http://firecrawl-api:3002" className={inputCls} />}
                    />

                    <SettingRow
                        title="Test connection"
                        description="Ping the SearXNG and Firecrawl services from the server to confirm they're reachable."
                        control={
                            <div className="flex flex-col items-end gap-2">
                                <button type="button" onClick={testConnection} disabled={checking} className="rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-xs font-medium text-pulse-text hover:bg-pulse-hover disabled:opacity-60">
                                    {checking ? "Checking…" : "Test connection"}
                                </button>
                                {health && (
                                    <div className="flex flex-col items-end gap-1 text-xs">
                                        <span className={health.searxng ? "text-emerald-500" : "text-red-500"}>● SearXNG {health.searxng ? "reachable" : "unreachable"}</span>
                                        <span className={health.firecrawl ? "text-emerald-500" : "text-red-500"}>● Firecrawl {health.firecrawl ? "reachable" : "unreachable"}</span>
                                    </div>
                                )}
                            </div>
                        }
                    />

                    <SettingRow
                        title="Firecrawl API key"
                        description="Optional. Needed for Firecrawl cloud, or if your self-hosted instance requires auth."
                        control={keyField(firecrawlApiKey, setFirecrawlApiKey, config.hasFirecrawlKey, "fc-…")}
                    />
                    <SettingRow
                        title="Tavily API key"
                        description="Only if you pick Tavily as the search backend. Free key at tavily.com."
                        control={keyField(tavilyApiKey, setTavilyApiKey, config.hasTavilyKey, "tvly-…")}
                    />
                    <SettingRow
                        title="Brave API key"
                        description="Only if you pick Brave as the search backend."
                        control={keyField(braveApiKey, setBraveApiKey, config.hasBraveKey, "BSA…")}
                    />

                    <SettingRow
                        title="Rate limit"
                        description="Max searches + page-reads per minute for this workspace (protects the backend)."
                        control={<input type="number" min={1} max={600} value={ratePerMin} onChange={(e) => setRatePerMin(e.target.value)} className="w-28 rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500" />}
                    />
                    <SettingRow
                        title="Results per search"
                        description="How many results web_search returns (1–15)."
                        control={<input type="number" min={1} max={15} value={maxResults} onChange={(e) => setMaxResults(e.target.value)} className="w-28 rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500" />}
                    />
                </div>
            </Card>

            <Card>
                <div className="p-5 text-sm text-pulse-muted space-y-2">
                    <p className="font-medium text-pulse-text">Self-hosting the free stack</p>
                    <p>
                        SearXNG (search) and Firecrawl (page reading) run on your own server — no per-query cost, and queries never leave the box.
                        Bring them up with <code className="rounded bg-pulse-panel-alt px-1.5 py-0.5 text-xs">scripts/enable-search.sh</code>, then keep the default URLs above.
                    </p>
                    <p>If a search backend is temporarily blocked by an upstream engine, add a Tavily or Brave key as a paid fallback.</p>
                </div>
            </Card>
        </div>
    );
}
