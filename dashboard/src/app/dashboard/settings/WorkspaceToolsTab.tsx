"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, SettingRow, Toggle } from "../../../components/dashboard/ui";
import { TOOL_CATALOG } from "../../../utils/tenant-skills-catalog";
import { saveWorkspaceToolsAction } from "./actions";

/**
 * Workspace Tools — enable/disable the built-in tools an agent in this workspace
 * may use (the tenant_skills gate). New workspaces start with a sensible default
 * set seeded at creation; this screen is how you change it.
 */
export default function WorkspaceToolsTab({ enabledTools }: { enabledTools: string[] }) {
    const [enabled, setEnabled] = useState<Set<string>>(() => new Set(enabledTools));
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    function toggle(name: string) {
        setEnabled((prev) => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });
        setMsg(null);
    }

    function save() {
        setMsg(null);
        startTransition(async () => {
            const res = await saveWorkspaceToolsAction([...enabled]);
            setMsg({ ok: res.success, text: res.message });
        });
    }

    function setGroup(names: string[], on: boolean) {
        setEnabled((prev) => {
            const next = new Set(prev);
            for (const n of names) on ? next.add(n) : next.delete(n);
            return next;
        });
        setMsg(null);
    }

    return (
        <div className="space-y-5">
            <Card>
                <CardHeader
                    title="Workspace Tools"
                    description="Choose which built-in tools your agents in this workspace can use. A tool must be enabled here before any agent can be given it. Each agent's own Tool Policy then decides which of these it actually uses."
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
                {msg && (
                    <div className={`px-5 pt-4 text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>
                )}
                <div className="divide-y divide-pulse-border-subtle">
                    {TOOL_CATALOG.map((group) => {
                        const names = group.tools.map((t) => t.name);
                        const allOn = names.every((n) => enabled.has(n));
                        return (
                            <div key={group.key} className="p-5">
                                <div className="mb-3 flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-pulse-text">{group.title}</h3>
                                        <p className="mt-0.5 text-xs text-pulse-muted">{group.description}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setGroup(names, !allOn)}
                                        className="shrink-0 text-xs font-medium text-pulse-accent hover:text-pulse-accent-hi"
                                    >
                                        {allOn ? "Disable all" : "Enable all"}
                                    </button>
                                </div>
                                <div className="rounded-lg border border-pulse-border-subtle">
                                    {group.tools.map((tool, i) => (
                                        <SettingRow
                                            key={tool.name}
                                            title={tool.label}
                                            description={tool.description}
                                            className={i > 0 ? "border-t border-pulse-border-subtle" : ""}
                                            control={
                                                <Toggle checked={enabled.has(tool.name)} onChange={() => toggle(tool.name)} />
                                            }
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
}
