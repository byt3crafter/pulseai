"use client";

import { useMemo } from "react";

/**
 * Renders an agent-authored chart from a ```chart fenced block. The agent emits
 * a small JSON spec and this draws it as inline SVG (no chart library, fully
 * themeable). Supported: pie, donut, bar, line, area — single series
 * (labels + data). Falls back to showing the raw JSON if it can't parse.
 *
 * Spec:
 *   { "type": "pie|donut|bar|line|area", "title"?: string,
 *     "labels": string[], "data": number[], "unit"?: string }
 */
type ChartType = "pie" | "donut" | "bar" | "line" | "area";
interface Spec {
    type?: ChartType;
    title?: string;
    labels?: string[];
    data?: number[];
    unit?: string;
}

// Categorical palette — distinct hues that read on the dark ground (data viz
// legitimately needs multiple colors even though the UI is one-accent).
const PALETTE = ["#8E96F2", "#38BDF8", "#34D399", "#FBBF24", "#F472B6", "#A78BFA", "#F87171", "#2DD4BF", "#FB923C", "#A3E635"];

function fmt(n: number, unit?: string): string {
    const s = Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(n);
    return unit ? `${unit} ${s}` : s;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arc(cx: number, cy: number, r: number, inner: number, start: number, end: number): string {
    const large = end - start > 180 ? 1 : 0;
    const [x1, y1] = polar(cx, cy, r, start);
    const [x2, y2] = polar(cx, cy, r, end);
    if (inner <= 0) {
        return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    }
    const [ix1, iy1] = polar(cx, cy, inner, end);
    const [ix2, iy2] = polar(cx, cy, inner, start);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`;
}

export default function ChartBlock({ code }: { code: string }) {
    const spec = useMemo<Spec | null>(() => {
        try {
            const s = JSON.parse(code);
            return s && typeof s === "object" ? s : null;
        } catch {
            return null;
        }
    }, [code]);

    if (!spec || !Array.isArray(spec.data) || spec.data.length === 0) {
        return <pre className="overflow-x-auto rounded-lg bg-pulse-code p-3 text-xs text-pulse-muted">{code}</pre>;
    }

    const type: ChartType = spec.type || "bar";
    const labels = spec.labels || spec.data.map((_, i) => `#${i + 1}`);
    const data = spec.data.map((n) => (Number.isFinite(n) ? n : 0));
    const unit = spec.unit;

    return (
        <figure className="my-3 rounded-xl border border-pulse-border-subtle bg-pulse-panel p-4">
            {spec.title && <figcaption className="mb-3 text-sm font-semibold text-pulse-text">{spec.title}</figcaption>}
            {(type === "pie" || type === "donut") ? (
                <PieChart type={type} labels={labels} data={data} unit={unit} />
            ) : (
                <XYChart type={type} labels={labels} data={data} unit={unit} />
            )}
        </figure>
    );
}

function PieChart({ type, labels, data, unit }: { type: ChartType; labels: string[]; data: number[]; unit?: string }) {
    const total = data.reduce((a, b) => a + b, 0) || 1;
    const cx = 90, cy = 90, r = 82, inner = type === "donut" ? 46 : 0;
    let angle = 0;
    const slices = data.map((v, i) => {
        const start = angle;
        const frac = v / total;
        const end = angle + frac * 360;
        angle = end;
        return { path: arc(cx, cy, r, inner, start, Math.min(end, 359.999)), color: PALETTE[i % PALETTE.length], v, pct: frac * 100, label: labels[i] };
    });
    return (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" role="img" aria-label="Pie chart">
                {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="var(--pulse-panel)" strokeWidth={1.5} />)}
            </svg>
            <ul className="flex w-full min-w-0 flex-col gap-1.5">
                {slices.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-[13px]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                        <span className="min-w-0 flex-1 truncate text-pulse-text-soft">{s.label}</span>
                        <span className="shrink-0 tabular-nums text-pulse-muted">{fmt(s.v, unit)}</span>
                        <span className="w-12 shrink-0 text-right tabular-nums text-pulse-faint">{s.pct.toFixed(1)}%</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function XYChart({ type, labels, data, unit }: { type: ChartType; labels: string[]; data: number[]; unit?: string }) {
    const W = 520, H = 220, padL = 44, padR = 12, padT = 12, padB = 34;
    const max = Math.max(...data, 0);
    const min = Math.min(...data, 0);
    const span = max - min || 1;
    const iw = W - padL - padR, ih = H - padT - padB;
    const x = (i: number) => padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const y = (v: number) => padT + ih - ((v - min) / span) * ih;
    const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * span);

    return (
        <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label={`${type} chart`}>
                {/* gridlines + y labels */}
                {gridVals.map((gv, i) => {
                    const gy = y(gv);
                    return (
                        <g key={i}>
                            <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="var(--pulse-border-subtle)" strokeWidth={1} />
                            <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize={9} fill="var(--pulse-faint)" className="tabular-nums">{fmt(Math.round(gv), unit)}</text>
                        </g>
                    );
                })}
                {type === "bar" ? (
                    data.map((v, i) => {
                        const bw = Math.max(6, (iw / data.length) * 0.6);
                        const bx = padL + (i + 0.5) * (iw / data.length) - bw / 2;
                        const by = y(Math.max(v, 0));
                        const bh = Math.abs(y(v) - y(0));
                        return <rect key={i} x={bx} y={by} width={bw} height={Math.max(1, bh)} rx={2} fill={PALETTE[i % PALETTE.length]} />;
                    })
                ) : (
                    <>
                        {type === "area" && (
                            <path d={`M ${x(0)} ${y(min)} ${data.map((v, i) => `L ${x(i)} ${y(v)}`).join(" ")} L ${x(data.length - 1)} ${y(min)} Z`} fill="var(--pulse-accent)" fillOpacity={0.14} />
                        )}
                        <polyline points={data.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--pulse-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                        {data.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill="var(--pulse-accent-hi)" />)}
                    </>
                )}
                {/* x labels */}
                {labels.map((l, i) => (
                    <text key={i} x={type === "bar" ? padL + (i + 0.5) * (iw / data.length) : x(i)} y={H - 12} textAnchor="middle" fontSize={9} fill="var(--pulse-faint)">
                        {l.length > 10 ? l.slice(0, 9) + "…" : l}
                    </text>
                ))}
            </svg>
        </div>
    );
}
