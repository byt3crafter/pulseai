import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelAdapter, ChannelConnectionConfig } from "../channels/channel.interface.js";
import { initializeChannelAdapters } from "../channels/bootstrap.js";
import { clearChannelAdapterRegistryForTests, registerChannelAdapter } from "../channels/registry.js";

function makeAdapter(channelType: string, calls: string[]): ChannelAdapter {
    return {
        channelType,
        async initialize(connections: ChannelConnectionConfig[]) {
            calls.push(`${channelType}:initialize:${connections.map((c) => c.id).join(",")}`);
        },
        async shutdown() {
            calls.push(`${channelType}:shutdown`);
        },
        onMessage() {
            calls.push(`${channelType}:onMessage`);
        },
        async sendMessage() {
            return { channelMessageId: `${channelType}-message` };
        },
        formatResponse(content: string) {
            return content;
        },
    };
}

describe("initializeChannelAdapters", () => {
    beforeEach(() => {
        clearChannelAdapterRegistryForTests();
    });

    it("groups connections by type and initializes registered adapters", async () => {
        const calls: string[] = [];
        const adapterMap = new Map<string, ChannelAdapter>();
        registerChannelAdapter("telegram", () => makeAdapter("telegram", calls));
        registerChannelAdapter("slack", () => makeAdapter("slack", calls));

        const connections: ChannelConnectionConfig[] = [
            { id: "tg-1", tenantId: "tenant-1", channelType: "telegram", channelConfig: {} },
            { id: "sl-1", tenantId: "tenant-1", channelType: "slack", channelConfig: {} },
            { id: "tg-2", tenantId: "tenant-2", channelType: "Telegram", channelConfig: {} },
        ];

        const initialized = await initializeChannelAdapters(connections, {
            adapterMap,
            onInboundMessage: vi.fn(),
        });

        expect(initialized).toBe(adapterMap);
        expect(adapterMap.has("telegram")).toBe(true);
        expect(adapterMap.has("slack")).toBe(true);
        expect(calls).toEqual([
            "telegram:onMessage",
            "telegram:initialize:tg-1,tg-2",
            "slack:onMessage",
            "slack:initialize:sl-1",
        ]);
    });

    it("skips unknown channel types without failing startup", async () => {
        const calls: string[] = [];
        const warn = vi.fn();
        registerChannelAdapter("telegram", () => makeAdapter("telegram", calls));

        const initialized = await initializeChannelAdapters(
            [
                { id: "tg-1", tenantId: "tenant-1", channelType: "telegram", channelConfig: {} },
                { id: "wa-1", tenantId: "tenant-1", channelType: "whatsapp", channelConfig: {} },
            ],
            {
                adapterMap: new Map(),
                logger: { warn },
                onInboundMessage: vi.fn(),
            },
        );

        expect(initialized.has("telegram")).toBe(true);
        expect(initialized.has("whatsapp")).toBe(false);
        expect(warn).toHaveBeenCalledWith(
            { channelType: "whatsapp", connectionCount: 1 },
            "No channel adapter registered; skipping connections",
        );
    });
});
