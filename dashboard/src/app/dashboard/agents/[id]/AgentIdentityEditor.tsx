"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { updateAgentIdentityAction } from "./actions";
import AgentAvatar from "../../../../components/dashboard/AgentAvatar";

const MAX_AVATAR_BYTES = 500 * 1024;
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];

/**
 * Compact "Profile" card at the top of the agent's Config tab — full name,
 * role/title subtitle, and a profile picture. Mirrors the client-side
 * file→base64 upload pattern in SignatureEditor.tsx (size cap + preview +
 * remove), persisted via updateAgentIdentityAction.
 */
const REASONING_EFFORT_OPTIONS: { value: string; label: string }[] = [
    { value: "default", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra-high" },
];

export default function AgentIdentityEditor({
    agentId,
    initialName,
    initialTitle,
    initialAvatar,
    initialReasoningEffort,
}: {
    agentId: string;
    initialName: string;
    initialTitle: string | null;
    initialAvatar: string | null;
    initialReasoningEffort: string | null;
}) {
    const [name, setName] = useState(initialName);
    const [title, setTitle] = useState(initialTitle ?? "");
    const [avatar, setAvatar] = useState<string | null>(initialAvatar);
    const [avatarDirty, setAvatarDirty] = useState(false);
    const [avatarError, setAvatarError] = useState<string | null>(null);
    const [reasoningEffort, setReasoningEffort] = useState(initialReasoningEffort ?? "default");
    const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });
    const [isPending, startTransition] = useTransition();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const isDirty = name !== initialName
        || title !== (initialTitle ?? "")
        || avatarDirty
        || reasoningEffort !== (initialReasoningEffort ?? "default");

    /**
     * Downscale + re-encode an image to a small avatar entirely in the browser,
     * so users can upload a photo of any size and it just works (no manual
     * shrinking). Fits within a 512px box, exports JPEG at decreasing quality
     * until it's comfortably under the size cap.
     */
    async function compressToAvatar(file: File): Promise<string> {
        const dataUrl: string = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = () => reject(new Error("read failed"));
            r.readAsDataURL(file);
        });
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error("decode failed"));
            i.src = dataUrl;
        });
        const MAX_DIM = 512;
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return dataUrl; // fall back to original if canvas unavailable
        ctx.drawImage(img, 0, 0, w, h);
        // Estimated bytes of a data URL ≈ length * 0.75 (base64 overhead).
        for (const q of [0.85, 0.7, 0.55, 0.4]) {
            const out = canvas.toDataURL("image/jpeg", q);
            if (out.length * 0.75 <= MAX_AVATAR_BYTES) return out;
        }
        return canvas.toDataURL("image/jpeg", 0.4);
    }

    async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        setAvatarError(null);
        if (!ALLOWED_MIME.includes(file.type)) {
            setAvatarError("Avatar must be a PNG, JPEG, or WEBP image.");
            return;
        }

        try {
            const compressed = await compressToAvatar(file);
            if (compressed.length * 0.75 > MAX_AVATAR_BYTES) {
                setAvatarError("Couldn't compress this image below 500KB — try a simpler picture.");
                return;
            }
            setAvatar(compressed);
            setAvatarDirty(true);
        } catch {
            setAvatarError("Failed to process the selected image.");
        }
    }

    function handleRemoveAvatar() {
        setAvatar(null);
        setAvatarDirty(true);
        setAvatarError(null);
    }

    function handleSave() {
        if (!name.trim()) {
            setStatus({ type: "error", message: "Name is required." });
            return;
        }
        setStatus({ type: "saving", message: "" });
        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("name", name.trim());
        fd.set("title", title.trim());
        fd.set("reasoningEffort", reasoningEffort);
        if (avatarDirty) {
            if (avatar) {
                fd.set("avatar", avatar);
            } else {
                fd.set("removeAvatar", "true");
            }
        }

        startTransition(async () => {
            const result = await updateAgentIdentityAction(fd);
            setStatus({ type: result.success ? "success" : "error", message: result.message ?? "" });
            if (result.success) {
                setAvatarDirty(false);
                router.refresh();
            }
        });
    }

    return (
        <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-pulse-border-subtle">
                <h2 className="text-sm font-semibold text-pulse-text">Profile</h2>
                <p className="text-xs text-pulse-faint mt-0.5">How this agent is represented across the dashboard.</p>
            </div>
            <div className="px-6 py-5 space-y-5">
                {/* Avatar */}
                <div>
                    <label className="block text-xs font-medium text-pulse-text-soft mb-1.5">Profile picture</label>
                    <div className="flex items-center gap-3">
                        <AgentAvatar name={name || initialName} avatar={avatar} size="lg" />
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={handlePickFile}
                        />
                        <div className="flex flex-col gap-1.5">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-pulse-border-subtle rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none text-pulse-muted cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                <ArrowUpTrayIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                {avatar ? "Replace" : "Upload"}
                            </button>
                            {avatar && (
                                <button
                                    type="button"
                                    onClick={handleRemoveAvatar}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-pulse-border-subtle rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none text-red-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                >
                                    <TrashIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                    Remove
                                </button>
                            )}
                        </div>
                    </div>
                    {avatarError && <p className="text-xs text-red-400 mt-1.5">{avatarError}</p>}
                    <p className="text-xs text-pulse-faint mt-1.5">PNG, JPEG, or WEBP, up to 500KB. Without one, initials are shown instead.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-pulse-text-soft mb-1">Full name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Natalie Harrington"
                            maxLength={255}
                            className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-pulse-text-soft mb-1">Role / title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Chief Financial Officer"
                            maxLength={160}
                            className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-pulse-text-soft mb-1">Thinking</label>
                    <select
                        value={reasoningEffort}
                        onChange={(e) => setReasoningEffort(e.target.value)}
                        className="w-full max-w-xs px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text"
                    >
                        {REASONING_EFFORT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <p className="text-xs text-pulse-faint mt-1.5">
                        How hard this agent thinks before answering. Higher = better reasoning, slower + more tokens.
                        Applies to models that support reasoning effort (e.g. Codex/GPT-5.5).
                    </p>
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        {status.type !== "idle" && (
                            <p className={`text-sm ${status.type === "success" ? "text-green-400" : status.type === "error" ? "text-red-400" : "text-pulse-muted"}`}>
                                {status.type === "saving" ? "Saving..." : status.message}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || isPending}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                        Save Profile
                    </button>
                </div>
            </div>
        </div>
    );
}
