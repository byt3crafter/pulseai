import type { ChannelAdapter } from "./channel.interface.js";

export type ChannelAdapterFactory = () => ChannelAdapter;

const factories = new Map<string, ChannelAdapterFactory>();

function normalizeType(type: string): string {
    const normalized = type.trim().toLowerCase();
    if (!normalized) {
        throw new Error("Channel type is required");
    }
    return normalized;
}

export function registerChannelAdapter(type: string, factory: ChannelAdapterFactory): void {
    const key = normalizeType(type);
    if (factories.has(key)) {
        throw new Error(`Channel adapter already registered: ${key}`);
    }
    factories.set(key, factory);
}

export function getChannelAdapterFactory(type: string): ChannelAdapterFactory | undefined {
    return factories.get(normalizeType(type));
}

export function listRegisteredChannelTypes(): string[] {
    return Array.from(factories.keys()).sort();
}

export function clearChannelAdapterRegistryForTests(): void {
    factories.clear();
}
