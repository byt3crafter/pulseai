import type { InboundMessage } from "./types.js";
import type { ChannelAdapter, ChannelConnectionConfig } from "./channel.interface.js";
import { getChannelAdapterFactory } from "./registry.js";

interface BootstrapLogger {
    warn(payload: Record<string, unknown>, message: string): void;
}

export interface InitializeChannelAdaptersOptions {
    adapterMap?: Map<string, ChannelAdapter>;
    logger?: BootstrapLogger;
    onInboundMessage: (msg: InboundMessage) => Promise<void>;
}

function normalizeChannelType(type: string): string {
    return type.trim().toLowerCase();
}

export async function initializeChannelAdapters(
    connections: ChannelConnectionConfig[],
    options: InitializeChannelAdaptersOptions,
): Promise<Map<string, ChannelAdapter>> {
    const adapterMap = options.adapterMap ?? new Map<string, ChannelAdapter>();
    const byType = new Map<string, ChannelConnectionConfig[]>();

    for (const connection of connections) {
        const channelType = normalizeChannelType(connection.channelType);
        if (!byType.has(channelType)) {
            byType.set(channelType, []);
        }
        byType.get(channelType)!.push({ ...connection, channelType });
    }

    for (const [channelType, groupedConnections] of byType) {
        const factory = getChannelAdapterFactory(channelType);
        if (!factory) {
            options.logger?.warn(
                { channelType, connectionCount: groupedConnections.length },
                "No channel adapter registered; skipping connections",
            );
            continue;
        }

        const adapter = factory();
        adapter.onMessage(options.onInboundMessage);
        await adapter.initialize(groupedConnections);
        adapterMap.set(channelType, adapter);
    }

    return adapterMap;
}
