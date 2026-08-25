"use client";

/**
 * The office floor itself: one SVG, no state, no effects.
 *
 * This component is deliberately dumb — it renders exactly what it is handed.
 * All liveness lives in FloorClient; all geometry lives in layout-floor.ts.
 * Keeping it pure is what lets the whole floor animate from CSS with no
 * per-frame JavaScript.
 */

import { memo } from "react";
import styles from "./floor.module.css";
import {
    VIEW_W, SPRITE_SCALE, HUMAN_SCALE, DESK_W, DESK_H,
    type FloorLayout, type DeskBox,
} from "./layout-floor";
import { SPRITE_W, SEAT_H, STAND_H } from "./pixel-avatar";
import type { FloorAgent, FloorHuman, DeskState, Handoff } from "./types";

const SPR_W = SPRITE_W * SPRITE_SCALE; // 54
const SPR_H = SEAT_H * SPRITE_SCALE;   // 84

/** Desk surface sits just below the resting hands, so a raised hand clears it. */
const DESK_TOP = 74;

export interface FloorSvgProps {
    layout: FloorLayout;
    agents: Map<string, FloorAgent>;
    humans: FloorHuman[];
    states: Map<string, DeskState>;
    captions: Map<string, string | null>;
    /** Handoffs currently in flight, already de-duplicated by the client. */
    flights: Handoff[];
    onSelectAgent?: (agentId: string) => void;
    selectedAgentId?: string | null;
}

function Desk({
    desk, agent, state, caption, onSelect, selected,
}: {
    desk: DeskBox;
    agent: FloorAgent;
    state: DeskState;
    caption: string | null;
    onSelect?: (id: string) => void;
    selected: boolean;
}) {
    // The figure sits to the right of its cell, leaving the left third clear for
    // the monitor — otherwise the two overlap and the screen reads as floating.
    const sx = desk.x + DESK_W - SPR_W - 6;
    const working = state === "working";
    // De-phase the animations so a room full of agents doesn't move in lockstep.
    const delay = `${(desk.seat * 137) % 900}ms`;

    return (
        <g
            className={styles.desk}
            data-state={state}
            style={{ ["--seat-delay" as string]: delay, cursor: onSelect ? "pointer" : undefined }}
            onClick={onSelect ? () => onSelect(agent.id) : undefined}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(agent.id); } } : undefined}
            aria-label={`${agent.name} — ${state}`}
        >
            {selected && (
                <rect
                    x={desk.x - 4} y={desk.y - 4} width={DESK_W + 8} height={DESK_H + 8} rx={10}
                    fill="none" stroke="var(--pulse-accent)" strokeWidth={2} opacity={0.9}
                />
            )}

            {/* chair back, behind the person */}
            <rect
                x={sx + SPR_W / 2 - 17} y={desk.y + 26} width={34} height={50} rx={8}
                fill="var(--pulse-panel-alt)" stroke="var(--pulse-border)" strokeWidth={1}
            />

            {/* the person — one image when still, two alternating when typing */}
            <g className={styles.agent}>
                {working ? (
                    <>
                        <image href={agent.sprite.typeA} x={sx} y={desk.y} width={SPR_W} height={SPR_H} />
                        <image className={styles.frameB} href={agent.sprite.typeB} x={sx} y={desk.y} width={SPR_W} height={SPR_H} />
                    </>
                ) : (
                    <image href={agent.sprite.idle} x={sx} y={desk.y} width={SPR_W} height={SPR_H} />
                )}
            </g>

            {/* screen glow, pooling on the desk under the monitor */}
            <ellipse
                className={styles.glow}
                cx={desk.x + 16} cy={desk.y + DESK_TOP + 4} rx={17} ry={7}
                fill="var(--pulse-accent)"
            />

            {/* desk slab, painted over the legs/hands so the figure reads as seated */}
            <rect
                x={desk.x} y={desk.y + DESK_TOP} width={DESK_W} height={7} rx={2}
                fill="var(--floor-desk-top)"
            />
            <rect
                x={desk.x} y={desk.y + DESK_TOP + 6} width={DESK_W} height={13} rx={2}
                fill="var(--floor-desk)"
            />
            <rect
                x={desk.x} y={desk.y + DESK_TOP + 17} width={DESK_W} height={4} rx={1.5}
                fill="var(--floor-desk-edge)"
            />

            {/* monitor, standing on the desk beside the person rather than over them */}
            <g>
                <rect x={desk.x + 13} y={desk.y + DESK_TOP - 5} width={5} height={5} fill="var(--pulse-border-strong)" />
                <rect
                    x={desk.x + 3} y={desk.y + DESK_TOP - 22} width={26} height={18} rx={2.5}
                    fill="var(--pulse-panel-alt)" stroke="var(--pulse-border-strong)" strokeWidth={1.25}
                />
                <rect className={styles.screen} x={desk.x + 5} y={desk.y + DESK_TOP - 20} width={22} height={14} rx={1} />
            </g>

            {/* status marks */}
            {state === "done" && (
                <g className={styles.doneMark} transform={`translate(${desk.x + DESK_W - 14} ${desk.y + 12})`}>
                    <circle r={9} fill="#16a34a" />
                    <path d="M -4 0 L -1 3 L 4 -3" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </g>
            )}
            {state === "failed" && (
                <g transform={`translate(${desk.x + DESK_W - 14} ${desk.y + 12})`}>
                    <circle className={styles.failRing} r={9} fill="none" stroke="#f59e0b" strokeWidth={2} />
                    <circle r={5} fill="#b45309" />
                </g>
            )}
            {state === "needs-you" && (
                <g className={styles.needsYou} transform={`translate(${desk.x + DESK_W - 14} ${desk.y + 12})`}>
                    <circle r={8} fill="#dc2626" />
                    <rect x={-1} y={-4} width={2} height={5} fill="#fff" rx={1} />
                    <rect x={-1} y={2} width={2} height={2} fill="#fff" rx={1} />
                </g>
            )}
            {state === "stalled" && (
                <g transform={`translate(${desk.x + DESK_W - 14} ${desk.y + 12})`}>
                    <circle r={8} fill="#f59e0b" opacity={0.85} />
                    <text textAnchor="middle" y={4} fontSize={11} fontWeight={700} fill="#fff">?</text>
                </g>
            )}

            {/* nameplate */}
            <text
                x={desk.x + DESK_W / 2} y={desk.y + DESK_H - 1}
                textAnchor="middle" fontSize={10.5} fontWeight={600}
                fill="var(--pulse-text-soft)"
            >
                {agent.name.length > 12 ? `${agent.name.slice(0, 11)}…` : agent.name}
            </text>

            {/* live caption — what this agent is doing right now */}
            {caption && (
                <g className={styles.caption} transform={`translate(${desk.x + DESK_W / 2} ${desk.y - 4})`}>
                    <rect
                        x={-Math.min(70, caption.length * 3.4 + 10)} y={-16}
                        width={Math.min(140, caption.length * 6.8 + 20)} height={18} rx={9}
                        fill="var(--pulse-panel)" stroke="var(--pulse-border)" strokeWidth={1}
                    />
                    <text textAnchor="middle" y={-3} fontSize={10} fill="var(--pulse-text-soft)">
                        {caption.length > 20 ? `${caption.slice(0, 19)}…` : caption}
                    </text>
                </g>
            )}

            {/* thinking dots, when there is no tool caption yet */}
            {state === "thinking" && !caption && (
                <g transform={`translate(${desk.x + DESK_W / 2 - 8} ${desk.y - 8})`}>
                    {[0, 1, 2].map((i) => (
                        <circle key={i} className={styles.dot} cx={i * 8} cy={0} r={2.2} fill="var(--pulse-accent)" />
                    ))}
                </g>
            )}
        </g>
    );
}

function FloorSvgImpl({
    layout, agents, humans, states, captions, flights, onSelectAgent, selectedAgentId,
}: FloorSvgProps) {
    const deskById = new Map(layout.desks.map((d) => [d.agentId, d]));

    return (
        <svg
            className={styles.floorRoot}
            viewBox={`0 0 ${VIEW_W} ${layout.viewH}`}
            role="img"
            aria-label="Office floor showing your AI agents at work"
        >
            {/* floor */}
            <rect width={VIEW_W} height={layout.viewH} fill="var(--floor-carpet)" />
            <g>
                {Array.from({ length: Math.ceil(VIEW_W / 40) }, (_, i) => (
                    <line key={`v${i}`} x1={i * 40} y1={0} x2={i * 40} y2={layout.viewH} stroke="var(--floor-carpet-line)" strokeWidth={1} />
                ))}
                {Array.from({ length: Math.ceil(layout.viewH / 40) }, (_, i) => (
                    <line key={`h${i}`} x1={0} y1={i * 40} x2={VIEW_W} y2={i * 40} stroke="var(--floor-carpet-line)" strokeWidth={1} />
                ))}
            </g>

            {/* rooms */}
            {layout.rooms.map((room) => (
                <g key={room.id}>
                    <rect
                        x={room.x} y={room.y} width={room.w} height={room.h} rx={12}
                        fill="var(--pulse-panel)" fillOpacity={0.9}
                        stroke="var(--pulse-border-strong)" strokeWidth={1.5}
                    />
                    <text
                        x={room.x + 16} y={room.y + 20}
                        fontSize={11} fontWeight={700} letterSpacing={1.2}
                        fill="var(--pulse-muted)"
                    >
                        {room.name.toUpperCase()}
                    </text>
                </g>
            ))}

            {/* the people who give work — standing, not seated */}
            {layout.humans.map((box) => {
                const person = humans.find((h) => h.id === box.id);
                if (!person) return null;
                return (
                    <g key={box.id}>
                        {person.isMe && (
                            <circle
                                cx={box.cx} cy={box.cy - 6} r={26}
                                fill="var(--pulse-accent)" opacity={0.09}
                            />
                        )}
                        <g className={styles.agent}>
                            <image
                                href={person.sprite}
                                x={box.x} y={box.y}
                                width={SPRITE_W * HUMAN_SCALE} height={STAND_H * HUMAN_SCALE}
                            />
                        </g>
                        <text
                            x={box.cx} y={box.y + STAND_H * HUMAN_SCALE + 11}
                            textAnchor="middle" fontSize={10} fontWeight={600}
                            fill={person.isMe ? "var(--pulse-accent-hi)" : "var(--pulse-text-soft)"}
                        >
                            {person.name.length > 9 ? `${person.name.slice(0, 8)}…` : person.name}
                        </text>
                        {person.isMe && (
                            <text
                                x={box.cx} y={box.y - 3}
                                textAnchor="middle" fontSize={8.5} fontWeight={700} letterSpacing={0.8}
                                fill="var(--pulse-accent-hi)"
                            >
                                YOU
                            </text>
                        )}
                    </g>
                );
            })}

            {/* desks */}
            {layout.desks.map((desk) => {
                const agent = agents.get(desk.agentId);
                if (!agent) return null;
                return (
                    <Desk
                        key={desk.agentId}
                        desk={desk}
                        agent={agent}
                        state={states.get(desk.agentId) ?? "idle"}
                        caption={captions.get(desk.agentId) ?? null}
                        onSelect={onSelectAgent}
                        selected={selectedAgentId === desk.agentId}
                    />
                );
            })}

            {/* work in flight */}
            {flights.map((f) => {
                const target = deskById.get(f.toAgentId);
                if (!target) return null;
                const from = f.from.kind === "agent"
                    ? deskById.get(f.from.agentId)
                    : null;
                const ox = from ? from.cx : layout.boss.x;
                const oy = from ? from.cy - 40 : layout.boss.y;
                const dx = target.cx - ox;
                const dy = target.cy - 12 - oy;
                const dist = Math.hypot(dx, dy);
                const dur = Math.min(1400, Math.max(700, (dist / 620) * 1400));
                const tint = f.from.kind === "agent" ? 0.6 : 1;

                return (
                    <g key={f.id}>
                        {/* the source pulses as the work leaves it */}
                        <circle className={styles.sourcePulse} cx={ox} cy={oy} r={18}
                            fill="none" stroke="var(--pulse-accent)" strokeWidth={2} />
                        {/* the slip */}
                        <g
                            className={styles.slip}
                            transform={`translate(${ox} ${oy})`}
                            style={{
                                ["--dx" as string]: `${dx}px`,
                                ["--dy" as string]: `${dy}px`,
                                ["--dur" as string]: `${dur}ms`,
                            }}
                        >
                            <rect x={-9} y={-6} width={18} height={13} rx={2}
                                fill="var(--pulse-accent)" opacity={tint} />
                            <rect x={-6} y={-3} width={12} height={1.5} rx={0.75} fill="var(--pulse-panel)" opacity={0.8} />
                            <rect x={-6} y={0.5} width={8} height={1.5} rx={0.75} fill="var(--pulse-panel)" opacity={0.8} />
                        </g>
                        {/* it lands */}
                        <circle className={styles.landing} cx={target.cx} cy={target.cy - 12} r={10}
                            fill="none" stroke="var(--pulse-accent)" strokeWidth={2}
                            style={{ animationDelay: `${dur}ms` }} />
                    </g>
                );
            })}
        </svg>
    );
}

export default memo(FloorSvgImpl);
