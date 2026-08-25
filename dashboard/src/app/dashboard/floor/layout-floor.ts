/**
 * Floor plan geometry — pure, React-free and unit-testable.
 *
 * Turns the tenant's org tree (departments + their agents) into room rectangles
 * and desk coordinates inside a fixed SVG viewBox.
 *
 * Placement is deterministic and derived from stable ids, never from array
 * order or randomness, so desks must never reshuffle between two polls of the
 * same data. Anything that would move a desk belongs here, not in the renderer.
 */

export const VIEW_W = 1000;

/** Nearest-neighbour upscale factor for the 18px-wide sprites. */
export const SPRITE_SCALE = 3;

/** Reserved band across the top for the boss card. */
const HEADER_H = 92;

const ROOM_GAP = 16;
const ROOM_PAD_X = 14;
/** Room label, plus clearance for a caption pill above the first desk row. */
const ROOM_PAD_TOP = 48;
const ROOM_PAD_BOTTOM = 12;

/**
 * One desk cell. Wide enough to seat the 54px figure with a monitor beside it
 * rather than across its face.
 */
export const DESK_W = 96;
export const DESK_H = 108;
const DESK_GAP_X = 8;
/** Extra vertical room between desk rows so captions don't collide. */
const DESK_GAP_Y = 26;

export interface LayoutAgent {
    id: string;
    name: string;
    title: string | null;
    /** Department lead — seated at the head of the room. */
    lead: boolean;
}

export interface LayoutRoomInput {
    id: string;
    name: string;
    agents: LayoutAgent[];
}

export interface DeskBox {
    agentId: string;
    roomId: string;
    /** Top-left of the desk cell. */
    x: number;
    y: number;
    w: number;
    h: number;
    /** Centre of the desk surface — the anchor a work slip flies to. */
    cx: number;
    cy: number;
    lead: boolean;
    /** Stable index used to de-phase the typing animation between desks. */
    seat: number;
}

export interface RoomBox {
    id: string;
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    deskCount: number;
}

export interface HumanBox {
    id: string;
    x: number;
    y: number;
    /** Centre of the figure — where a work slip departs from. */
    cx: number;
    cy: number;
}

export interface FloorLayout {
    rooms: RoomBox[];
    desks: DeskBox[];
    /** The people standing in the management band. */
    humans: HumanBox[];
    /** Where work originates when a human hands it out (the signed-in user). */
    boss: { x: number; y: number };
    /**
     * Total canvas height for the viewBox. Computed from content rather than
     * fixed, so rooms are never stretched into dead space and never clipped.
     */
    viewH: number;
    /** True when the floor could not fit every agent legibly. */
    overflow: boolean;
    /** Agents that did not fit, so the caller can paginate rather than shrink. */
    hiddenAgentIds: string[];
}

/** Max desks we will render before declaring overflow (legibility, not a hard cap). */
export const MAX_DESKS = 24;

/** Standing humans are drawn a little smaller than seated agents. */
export const HUMAN_SCALE = 2;
const HUMAN_SLOT_W = 68;
const HUMAN_X0 = 20;
const HUMAN_Y = 24;

/** Lay the people out left-to-right in the management band. */
function layoutHumans(ids: string[]): HumanBox[] {
    return ids.map((id, i) => {
        const x = HUMAN_X0 + i * HUMAN_SLOT_W;
        return { id, x, y: HUMAN_Y, cx: x + 18, cy: HUMAN_Y + 34 };
    });
}

/**
 * Lay out rooms in a wrapping grid, and desks in a wrapping grid inside each.
 *
 * Rooms are sorted by id (not by name or input order) so renaming a department
 * never moves anyone's desk. Leads sort to seat 0 within their room.
 */
export function layoutFloor(input: LayoutRoomInput[], humanIds: string[] = []): FloorLayout {
    const rooms: RoomBox[] = [];
    const desks: DeskBox[] = [];
    const hiddenAgentIds: string[] = [];
    const humans = layoutHumans(humanIds);
    // Work leaves from the signed-in user (sorted first), or a neutral doorway
    // when there are no humans to draw.
    const boss = humans[0] ? { x: humans[0].cx, y: humans[0].cy } : { x: 44, y: HEADER_H / 2 };

    const ordered = [...input].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // Budget desks across rooms so one huge department can't starve the others.
    let remaining = MAX_DESKS;
    const seated = ordered.map((room) => {
        const agents = [...room.agents].sort((a, b) => {
            if (a.lead !== b.lead) return a.lead ? -1 : 1;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        const take = Math.max(0, Math.min(agents.length, remaining));
        remaining -= take;
        hiddenAgentIds.push(...agents.slice(take).map((a) => a.id));
        return { ...room, agents: agents.slice(0, take) };
    }).filter((r) => r.agents.length > 0);

    if (seated.length === 0) {
        return { rooms: [], desks: [], humans, boss, viewH: HEADER_H + 40, overflow: false, hiddenAgentIds };
    }

    // Room grid. Two columns is the sweet spot at this canvas width: it gives
    // each room enough inner width for four desks per row. Only a tenant with
    // many departments is worth squeezing to three (and fewer desks per row).
    const roomCols = seated.length === 1 ? 1 : seated.length > 6 ? 3 : 2;
    const roomRows = Math.ceil(seated.length / roomCols);
    const roomW = Math.floor((VIEW_W - ROOM_GAP * (roomCols + 1)) / roomCols);

    // Desks per row inside a room, from the room's usable width.
    const innerW = roomW - ROOM_PAD_X * 2;
    const deskCols = Math.max(1, Math.floor((innerW + DESK_GAP_X) / (DESK_W + DESK_GAP_X)));

    const roomHeight = (deskCount: number) => {
        const deskRows = Math.max(1, Math.ceil(deskCount / deskCols));
        return ROOM_PAD_TOP + deskRows * DESK_H + (deskRows - 1) * DESK_GAP_Y + ROOM_PAD_BOTTOM;
    };

    // Rooms on the same grid row share a height (the tallest), so the floor reads
    // as a tidy plan instead of a ragged collage — but rows differ from each other,
    // so a row of small teams is not stretched to match a big one.
    const rowHeights: number[] = [];
    for (let r = 0; r < roomRows; r++) {
        const inRow = seated.slice(r * roomCols, (r + 1) * roomCols);
        rowHeights[r] = Math.max(...inRow.map((room) => roomHeight(room.agents.length)));
    }
    const rowTop = (r: number) =>
        HEADER_H + ROOM_GAP + rowHeights.slice(0, r).reduce((a, h) => a + h + ROOM_GAP, 0);

    let seat = 0;
    seated.forEach((room, ri) => {
        const rc = ri % roomCols;
        const rr = Math.floor(ri / roomCols);
        const rx = ROOM_GAP + rc * (roomW + ROOM_GAP);
        const ry = rowTop(rr);
        const roomH = rowHeights[rr];

        rooms.push({ id: room.id, name: room.name, x: rx, y: ry, w: roomW, h: roomH, deskCount: room.agents.length });

        // Centre each desk row within the room so short rows don't hug the left edge.
        room.agents.forEach((agent, ai) => {
            const dc = ai % deskCols;
            const dr = Math.floor(ai / deskCols);
            const rowCount = Math.min(deskCols, room.agents.length - dr * deskCols);
            const rowW = rowCount * DESK_W + (rowCount - 1) * DESK_GAP_X;
            const x = rx + Math.round((roomW - rowW) / 2) + dc * (DESK_W + DESK_GAP_X);
            const y = ry + ROOM_PAD_TOP + dr * (DESK_H + DESK_GAP_Y);

            desks.push({
                agentId: agent.id,
                roomId: room.id,
                x, y, w: DESK_W, h: DESK_H,
                cx: x + DESK_W / 2,
                cy: y + DESK_H - 18, // the desk surface, not the head
                lead: agent.lead,
                seat: seat++,
            });
        });
    });

    const viewH = rowTop(roomRows - 1) + rowHeights[roomRows - 1] + ROOM_GAP;

    return {
        rooms,
        desks,
        humans,
        boss,
        viewH,
        overflow: hiddenAgentIds.length > 0,
        hiddenAgentIds,
    };
}
