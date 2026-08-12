"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, SettingRow } from "../../../components/dashboard/ui";
import { accentOverrideCss, isValidAccent } from "../../../utils/accent";
import { saveBrandingSettingsAction, type BrandingConfig } from "./actions";

const MAX_LOGO_BYTES = 200 * 1024;

const ACCENT_PRESETS: { label: string; hex: string }[] = [
    { label: "Indigo", hex: "#6470E6" },
    { label: "Teal", hex: "#0D9488" },
    { label: "Emerald", hex: "#059669" },
    { label: "Blue", hex: "#2563EB" },
    { label: "Violet", hex: "#7C3AED" },
    { label: "Rose", hex: "#E11D48" },
    { label: "Amber", hex: "#D97706" },
    { label: "Slate", hex: "#475569" },
];

/**
 * Appearance — white-label branding (title, logo, accent color) for this
 * workspace, stored in tenants.config.branding. The dashboard layout reads
 * this config and applies it globally; this tab is just the editor + a live
 * preview of the accent color while the user picks one.
 */
export default function AppearanceTab({ config }: { config: BrandingConfig }) {
    const router = useRouter();
    const [title, setTitle] = useState(config.title);
    const [logo, setLogo] = useState(config.logo);
    const [accent, setAccent] = useState(config.accent);
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [logoError, setLogoError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Live preview: inject a <style> overriding the accent CSS variables as
    // soon as the user picks a color, so the whole dashboard (including this
    // Save button) recolors before the setting is actually saved.
    useEffect(() => {
        const css = accentOverrideCss(accent);
        let styleEl = document.getElementById("accent-preview") as HTMLStyleElement | null;
        if (!css) {
            styleEl?.remove();
            return;
        }
        if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = "accent-preview";
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;
        return () => {
            document.getElementById("accent-preview")?.remove();
        };
    }, [accent]);

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        setLogoError(null);
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_LOGO_BYTES) {
            setLogoError("Logo too large — use an image under 200 KB.");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                setLogo(reader.result);
            }
        };
        reader.onerror = () => {
            setLogoError("Could not read that file — try a different image.");
        };
        reader.readAsDataURL(file);
    }

    function removeLogo() {
        setLogo("");
        setLogoError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function save() {
        setMsg(null);
        startTransition(async () => {
            const res = await saveBrandingSettingsAction({ title, logo, accent });
            setMsg({ ok: res.success, text: res.message });
            if (res.success) router.refresh();
        });
    }

    return (
        <div className="space-y-5">
            <Card>
                <CardHeader
                    title="Appearance"
                    description="Your logo, title and accent appear across your whole workspace."
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
                    <div className={`px-4 pt-4 text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>
                )}
                <div className="divide-y divide-pulse-border-subtle">
                    <SettingRow
                        title="Workspace title"
                        description="The name shown in the sidebar and browser tab."
                        control={
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={config.title || "Pulse AI"}
                                maxLength={60}
                                className="w-56 rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        }
                    />
                    <SettingRow
                        title="Logo"
                        description="Recommend a small square image (PNG, JPG, SVG, or WebP), under 200 KB."
                        control={
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex items-center gap-3">
                                    {logo ? (
                                        <img
                                            src={logo}
                                            alt="Workspace logo preview"
                                            className="h-10 w-10 rounded-lg border border-pulse-border object-contain bg-pulse-panel-alt"
                                        />
                                    ) : (
                                        <span className="text-xs text-pulse-muted">Using the default logo</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="cursor-pointer rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-xs font-medium text-pulse-text hover:bg-pulse-hover">
                                        Upload logo
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileSelect}
                                            className="sr-only"
                                        />
                                    </label>
                                    {logo && (
                                        <button
                                            type="button"
                                            onClick={removeLogo}
                                            className="rounded-lg border border-pulse-border px-3 py-1.5 text-xs font-medium text-pulse-muted hover:text-pulse-text hover:bg-pulse-hover"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                                {logoError && <p className="text-xs text-red-500">{logoError}</p>}
                            </div>
                        }
                    />
                    <SettingRow
                        title="Accent color"
                        description="Used for buttons, links, and highlights across your workspace."
                        control={
                            <div className="flex flex-col items-end gap-3">
                                <div className="flex flex-wrap justify-end gap-2">
                                    {ACCENT_PRESETS.map((preset) => (
                                        <button
                                            key={preset.hex}
                                            type="button"
                                            title={preset.label}
                                            aria-label={`Use ${preset.label} accent`}
                                            onClick={() => setAccent(preset.hex)}
                                            className={`h-7 w-7 rounded-full border-2 transition-transform ${accent.toLowerCase() === preset.hex.toLowerCase()
                                                ? "border-pulse-text scale-110"
                                                : "border-transparent hover:scale-105"
                                                }`}
                                            style={{ backgroundColor: preset.hex }}
                                        />
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={isValidAccent(accent) ? accent : "#6470E6"}
                                        onChange={(e) => setAccent(e.target.value)}
                                        aria-label="Custom accent color"
                                        className="h-8 w-8 cursor-pointer rounded border border-pulse-border bg-pulse-panel p-0.5"
                                    />
                                    <span className="text-xs text-pulse-muted">
                                        {accent ? accent.toUpperCase() : "Default"}
                                    </span>
                                    {accent && (
                                        <button
                                            type="button"
                                            onClick={() => setAccent("")}
                                            className="text-xs font-medium text-pulse-accent hover:text-pulse-accent-hi"
                                        >
                                            Reset to default
                                        </button>
                                    )}
                                </div>
                            </div>
                        }
                    />
                </div>
            </Card>
        </div>
    );
}
