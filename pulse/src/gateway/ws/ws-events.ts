/**
 * WebSocket Event Types — typed events emitted to connected clients.
 */

export interface WsEvent {
    type: string;
    timestamp: number;
    [key: string]: any;
}

export function agentMessageEvent(tenantId: string, agentId: string, conversationId: string, content: string): WsEvent {
    return {
        type: "agent.message",
        timestamp: Date.now(),
        tenantId,
        agentId,
        conversationId,
        content,
    };
}

export function agentStreamingEvent(tenantId: string, agentId: string, delta: string): WsEvent {
    return {
        type: "agent.streaming",
        timestamp: Date.now(),
        tenantId,
        agentId,
        delta,
    };
}

export function conversationUpdateEvent(tenantId: string, conversationId: string, status: string): WsEvent {
    return {
        type: "conversation.update",
        timestamp: Date.now(),
        tenantId,
        conversationId,
        status,
    };
}

export function heartbeatStatusEvent(tenantId: string, agentId: string, status: string, content?: string): WsEvent {
    return {
        type: "heartbeat.status",
        timestamp: Date.now(),
        tenantId,
        agentId,
        status,
        content,
    };
}

export function configChangedEvent(applied: string[]): WsEvent {
    return {
        type: "config.changed",
        timestamp: Date.now(),
        applied,
    };
}
