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

            {/* grounds the figure — without it a sprite floats above the floor */}
            <ellipse
                className={styles.contact}
                cx={sx + SPR_W / 2} cy={desk.y + SPR_H - 6} rx={20} ry={5}
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

            {/* light from the screen falling on whoever is sitting at it */}
            <ellipse
                className={styles.rimLight}
                cx={desk.x + 24} cy={desk.y + DESK_TOP - 14} rx={34} ry={26}
                fill="url(#floorScreenLight)"
            />

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
                <rect
                    className={styles.bloom}
                    x={desk.x} y={desk.y + DESK_TOP - 25} width={32} height={24} rx={6}
                    fill="var(--pulse-accent)" filter="url(#floorBloom)"
                />
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
            <defs>
                {/* One blur, reused by every screen — cheaper than a filter per desk. */}
                <filter id="floorBloom" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="5" />
                </filter>
                {/* Light has to FALL OFF. A flat-filled ellipse reads as a purple
                    blob painted over the sprite, not as a lit room. */}
                <radialGradient id="floorAmbient" cx="50%" cy="-5%" r="115%">
                    <stop offset="0%" stopColor="var(--floor-amb-near)" />
                    <stop offset="52%" stopColor="var(--floor-amb-mid)" />
                    <stop offset="100%" stopColor="var(--floor-amb-far)" />
                </radialGradient>
                <radialGradient id="floorVignette" cx="50%" cy="42%" r="118%">
                    <stop offset="var(--floor-vig-stop)" stopColor="var(--floor-vig-edge)" stopOpacity="0" />
                    <stop offset="100%" stopColor="var(--floor-vig-edge)" />
                </radialGradient>
                <radialGradient id="floorScreenLight">
                    <stop offset="0%" stopColor="var(--pulse-accent)" stopOpacity="0.85" />
                    <stop offset="45%" stopColor="var(--pulse-accent)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--pulse-accent)" stopOpacity="0" />
                </radialGradient>
            </defs>

            <rect width={VIEW_W} height={layout.viewH} fill="var(--floor-carpet)" />
            {/* Ambient light across the room, brighter at the back. */}
            <rect width={VIEW_W} height={layout.viewH} fill="url(#floorAmbient)" />
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

            {/* the humans' own office */}
            {layout.office && (
                <g>
                    <rect
                        x={layout.office.x} y={layout.office.y}
                        width={layout.office.w} height={layout.office.h} rx={12}
                        fill="var(--pulse-panel)" fillOpacity={0.9}
                        stroke="var(--pulse-border-strong)" strokeWidth={1.5}
                    />
                    <text
                        x={layout.office.x + 14} y={layout.office.y + 18}
                        fontSize={11} fontWeight={700} letterSpacing={1.2}
                        fill="var(--pulse-muted)"
                    >
                        MANAGEMENT
                    </text>
                </g>
            )}

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
                                href={person.sprite.stand}
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

            {/*
              * Work being handed over.
              *
              * A person carries it: someone leaves the management office, walks
              * to the desk that will do the work, hands it over, and walks back.
              * Agent-to-agent delegation is the same beat between two desks.
              */}
            {flights.map((f) => {
                const target = deskById.get(f.toAgentId);
                if (!target) return null;

                const fromDesk = f.from.kind === "agent" ? deskById.get(f.from.agentId) : null;
                const fromUserId = f.from.kind === "boss" ? (f.from.userId ?? null) : null;
                // Whoever asked, when we know; otherwise whoever is nearest the
                // door — we never name a specific person on a guess.
                const humanBox = (fromUserId && layout.humans.find((h) => h.id === fromUserId))
                    || (f.from.kind === "boss" ? layout.humans[0] : undefined);

                const carrier = fromDesk
                    ? agents.get(fromDesk.agentId)?.sprite
                    : humanBox
                        ? humans.find((h) => h.id === humanBox.id)?.sprite
                        : undefined;

                const ox = fromDesk ? fromDesk.cx - 18 : humanBox ? humanBox.cx - 18 : layout.boss.x - 18;
                const oy = fromDesk ? fromDesk.y + 10 : humanBox ? humanBox.y : layout.boss.y;
                // Stop beside the desk, not on top of it.
                const dx = (target.x + 8) - ox;
                const dy = (target.y + 30) - oy;
                const dist = Math.hypot(dx, dy);
                const dur = Math.round(Math.min(6000, Math.max(2600, dist * 9)));

                if (!carrier) return null;

                return (
                    <g key={f.id}>
                        <g
                            className={styles.courier}
                            transform={`translate(${ox} ${oy})`}
                            style={{
                                ["--dx" as string]: `${dx}px`,
                                ["--dy" as string]: `${dy}px`,
                                ["--dur" as string]: `${dur}ms`,
                            }}
                        >
                            <g className={styles.agent}>
                                <image href={carrier.walkA} x={0} y={0} width={SPRITE_W * 2} height={STAND_H * 2} />
                                <image className={styles.strideB} href={carrier.walkB} x={0} y={0} width={SPRITE_W * 2} height={STAND_H * 2} />
                            </g>
                            {/* the slip they are carrying, dropped at the desk */}
                            <g className={styles.carried} style={{ ["--dur" as string]: `${dur}ms` }}>
                                <rect x={SPRITE_W * 2 - 2} y={26} width={15} height={11} rx={2} fill="var(--pulse-accent)" />
                                <rect x={SPRITE_W * 2 + 1} y={29} width={9} height={1.5} rx={0.75} fill="var(--pulse-panel)" opacity={0.85} />
                                <rect x={SPRITE_W * 2 + 1} y={32} width={6} height={1.5} rx={0.75} fill="var(--pulse-panel)" opacity={0.85} />
                            </g>
                        </g>

                        {/* it lands on the desk as they arrive */}
                        <circle
                            className={styles.landing}
                            cx={target.cx} cy={target.cy - 10} r={11}
                            fill="none" stroke="var(--pulse-accent)" strokeWidth={2}
                            style={{ animationDelay: `${Math.round(dur * 0.44)}ms` }}
                        />
                    </g>
                );
            })}

            {/* Vignette sits above everything: it is the frame, not a surface. */}
            <rect
                width={VIEW_W} height={layout.viewH}
                fill="url(#floorVignette)"
                pointerEvents="none"
            />
        </svg>
    );
}

export default memo(FloorSvgImpl);
