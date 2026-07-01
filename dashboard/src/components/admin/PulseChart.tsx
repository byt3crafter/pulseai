"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SeriesPoint } from "../../app/admin/overview-data";

interface PulseChartProps {
    series: SeriesPoint[];
}

interface Point {
    x: number;
    y: number;
}

const WIDTH = 760;
const HEIGHT = 260;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 28;
const PAD_BOTTOM = 28;
const GRID_LINES = 4;

function formatDay(day: string): string {
    const parts = day.split("-").map((n) => Number(n));
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) return day;
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return `${months[m - 1]} ${d}`;
}

function formatMoney(n: number): string {
    return `$${n.toFixed(2)}`;
}

// Catmull-Rom to cubic-bezier smoothing — gives a gentle curve through every point.
function smoothPath(points: Point[]): string {
    if (points.length === 0) return "";
    if (points.length < 3) {
        return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    }
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
    }
    return d;
}

function scale(values: number[], height: number, padTop: number, padBottom: number) {
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const innerH = height - padTop - padBottom;
    return (v: number) => padTop + innerH - ((v - min) / span) * innerH;
}

export default function PulseChart({ series }: PulseChartProps) {
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
    const svgRef = useRef<SVGSVGElement>(null);
    const [revealed, setRevealed] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setRevealed(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const hasActivity = series.length > 0 && series.some((p) => p.messages > 0 || p.revenue > 0);

    const { areaPath, linePath, revenuePath, points, peak, low, latest } = useMemo(() => {
        if (!hasActivity) {
            return {
                areaPath: "",
                linePath: "",
                revenuePath: "",
                points: [] as Point[],
                peak: 0,
                low: 0,
                latest: 0,
            };
        }
        const n = series.length;
        const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
        const stepX = n > 1 ? innerW / (n - 1) : 0;
        const xAt = (i: number) => PAD_LEFT + stepX * i;

        const messagesVals = series.map((p) => p.messages);
        const revenueVals = series.map((p) => p.revenue);
        const yMessages = scale(messagesVals, HEIGHT, PAD_TOP, PAD_BOTTOM);
        const yRevenue = scale(revenueVals, HEIGHT, PAD_TOP, PAD_BOTTOM);

        const pts: Point[] = series.map((p, i) => ({ x: xAt(i), y: yMessages(p.messages) }));
        const revPts: Point[] = series.map((p, i) => ({ x: xAt(i), y: yRevenue(p.revenue) }));

        const baselineY = HEIGHT - PAD_BOTTOM;
        const smoothed = smoothPath(pts);
        const area = `${smoothed} L ${pts[pts.length - 1].x} ${baselineY} L ${pts[0].x} ${baselineY} Z`;

        return {
            areaPath: area,
            linePath: smoothed,
            revenuePath: smoothPath(revPts),
            points: pts,
            peak: Math.max(...messagesVals),
            low: Math.min(...messagesVals),
            latest: messagesVals[messagesVals.length - 1] ?? 0,
        };
    }, [series, hasActivity]);

    if (!hasActivity) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-2">
                <p className="text-[13px] uppercase tracking-[0.1em] text-[#5A5A61]">No activity &middot; last 14 days</p>
                <p className="text-[11px] text-[#5A5A61]">New messages and revenue will appear here as they come in.</p>
            </div>
        );
    }

    const updateActiveFromClientX = (clientX: number) => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const relX = ((clientX - rect.left) / rect.width) * WIDTH;
        const n = series.length;
        const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
        const stepX = n > 1 ? innerW / (n - 1) : 1;
        const idx = Math.round((relX - PAD_LEFT) / stepX);
        setActiveIndex(Math.min(Math.max(idx, 0), n - 1));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            setActiveIndex((prev) => Math.max((prev ?? 0) - 1, 0));
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setActiveIndex((prev) => Math.min((prev ?? -1) + 1, series.length - 1));
        } else if (e.key === "Escape") {
            setActiveIndex(null);
        }
    };

    const active = activeIndex !== null ? series[activeIndex] : null;
    const activePoint = activeIndex !== null ? points[activeIndex] : null;
    const tooltipLeftPct = activePoint ? (activePoint.x / WIDTH) * 100 : 0;
    const tooltipAlignRight = tooltipLeftPct > 65;

    const gridYs = Array.from({ length: GRID_LINES + 1 }, (_, i) => PAD_TOP + ((HEIGHT - PAD_TOP - PAD_BOTTOM) / GRID_LINES) * i);

    return (
        <div className="relative">
            <div className="flex items-center gap-5 mb-2 text-[11px] uppercase tracking-[0.08em]">
                <span className="inline-flex items-center gap-1.5 text-[#8A8A90]">
                    <span className="w-2 h-2 rounded-full bg-[#F5A524]" aria-hidden="true" />
                    Messages
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#5A5A61]">
                    <span className="w-2.5 h-0 border-t border-dashed border-[#5A5A61]" aria-hidden="true" />
                    Revenue
                </span>
                <span className="ml-auto flex items-center gap-4 text-[#5A5A61] tabular-nums">
                    <span>Peak <strong className="text-[#EDEDED] font-semibold">{peak.toLocaleString()}</strong></span>
                    <span>Low <strong className="text-[#EDEDED] font-semibold">{low.toLocaleString()}</strong></span>
                    <span>Latest <strong className="text-[#F5A524] font-semibold">{latest.toLocaleString()}</strong></span>
                </span>
            </div>

            <div
                className="relative outline-none focus-visible:ring-1 focus-visible:ring-[#F5A524] rounded"
                tabIndex={0}
                role="img"
                aria-label={`Messages and revenue over the last ${series.length} days. Latest day: ${latest.toLocaleString()} messages.`}
                onKeyDown={handleKeyDown}
                onPointerMove={(e) => updateActiveFromClientX(e.clientX)}
                onPointerLeave={() => setActiveIndex(null)}
            >
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    preserveAspectRatio="none"
                    width="100%"
                    height={220}
                    className="block"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id={`${uid}-area`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F5A524" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="#F5A524" stopOpacity="0" />
                        </linearGradient>
                        <clipPath id={`${uid}-reveal`}>
                            <rect
                                x="0"
                                y="0"
                                height={HEIGHT}
                                width={revealed ? WIDTH : 0}
                                className="motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-out"
                            />
                        </clipPath>
                    </defs>

                    {gridYs.map((y, i) => (
                        <line key={i} x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_RIGHT} y2={y} stroke="#1C1C1F" strokeWidth={1} />
                    ))}

                    <g clipPath={`url(#${uid}-reveal)`}>
                        <path d={areaPath} fill={`url(#${uid}-area)`} stroke="none" />
                        <path d={revenuePath} fill="none" stroke="#5A5A61" strokeWidth={1.25} strokeDasharray="4 4" opacity={0.8} />
                        <path d={linePath} fill="none" stroke="#F5A524" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </g>

                    {activePoint && (
                        <g>
                            <line
                                x1={activePoint.x}
                                y1={PAD_TOP}
                                x2={activePoint.x}
                                y2={HEIGHT - PAD_BOTTOM}
                                stroke="#F5A524"
                                strokeWidth={1}
                                strokeDasharray="3 3"
                                opacity={0.6}
                            />
                            <circle cx={activePoint.x} cy={activePoint.y} r={3.5} fill="#F5A524" stroke="#0A0A0B" strokeWidth={2} />
                        </g>
                    )}
                </svg>

                <div className="flex justify-between text-[10px] uppercase tracking-[0.06em] text-[#5A5A61] mt-1 px-0.5">
                    <span>{formatDay(series[0].day)}</span>
                    <span>{formatDay(series[series.length - 1].day)}</span>
                </div>

                {active && activePoint && (
                    <div
                        className="pointer-events-none absolute z-10 -translate-y-full rounded border border-[#33333B] bg-[#0C0C0E] px-3 py-2 shadow-2xl text-[11px] whitespace-nowrap font-mono"
                        style={{
                            top: `${(activePoint.y / HEIGHT) * 220 - 10}px`,
                            left: tooltipAlignRight ? undefined : `${tooltipLeftPct}%`,
                            right: tooltipAlignRight ? `${100 - tooltipLeftPct}%` : undefined,
                            transform: tooltipAlignRight ? "translate(10px, -100%)" : "translate(-10px, -100%)",
                        }}
                        role="status"
                    >
                        <p className="font-semibold text-[#EDEDED] uppercase tracking-[0.06em]">{formatDay(active.day)}</p>
                        <p className="text-[#8A8A90] mt-0.5 tabular-nums">
                            {active.messages.toLocaleString()} msgs &middot; {formatMoney(active.revenue)}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
