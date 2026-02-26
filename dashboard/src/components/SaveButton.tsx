"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";

interface SaveButtonProps {
    label?: string;
    className?: string;
}

export default function SaveButton({ label = "Save", className }: SaveButtonProps) {
    const { pending } = useFormStatus();
    const [saved, setSaved] = useState(false);
    const prevPending = useRef(false);

    useEffect(() => {
        if (prevPending.current && !pending) {
            setSaved(true);
            const timer = setTimeout(() => setSaved(false), 2500);
            return () => clearTimeout(timer);
        }
        prevPending.current = pending;
    }, [pending]);

    const baseClass = className || "px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors";

    return (
        <button
            type="submit"
            disabled={pending}
            className={`${baseClass} disabled:opacity-60 disabled:cursor-not-allowed`}
        >
            {pending ? (
                <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving…
                </span>
            ) : saved ? (
                <span className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Saved!
                </span>
            ) : (
                label
            )}
        </button>
    );
}
