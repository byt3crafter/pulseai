"use client";

import { useId, useState } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

/**
 * Small, accessible info tooltip. Opens on hover AND keyboard focus, closes on
 * blur/mouse-leave or Escape. The trigger is `aria-describedby`-linked to the
 * tooltip text so screen readers announce it as a description of the field.
 */
export default function Tooltip({ text, label = "More info" }: { text: string; label?: string }) {
    const id = useId();
    const [open, setOpen] = useState(false);

    return (
        <span className="relative inline-flex">
            <button
                type="button"
                aria-describedby={open ? id : undefined}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") setOpen(false);
                }}
                className="inline-flex text-slate-400 hover:text-indigo-600 focus:text-indigo-600 outline-none rounded-full focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
                <InformationCircleIcon className="w-4 h-4" aria-hidden="true" />
                <span className="sr-only">{label}</span>
            </button>
            {open && (
                <span
                    id={id}
                    role="tooltip"
                    className="absolute z-30 left-0 top-full mt-2 w-60 max-w-[70vw] rounded-lg bg-slate-900 text-white text-xs leading-snug px-3 py-2 shadow-lg"
                >
                    {text}
                </span>
            )}
        </span>
    );
}
