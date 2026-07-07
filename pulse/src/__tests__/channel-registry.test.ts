import { beforeEach, describe, expect, it } from "vitest";
import {
    clearChannelAdapterRegistryForTests,
    getChannelAdapterFactory,
    listRegisteredChannelTypes,
    registerChannelAdapter,
} from "../channels/registry.js";

describe("channel adapter registry", () => {
    beforeEach(() => {
        clearChannelAdapterRegistryForTests();
    });

    it("registers and retrieves an adapter factory by channel type", () => {
        const factory = () => ({ channelType: "test" }) as any;

        registerChannelAdapter("test", factory);

        expect(getChannelAdapterFactory("test")).toBe(factory);
        expect(listRegisteredChannelTypes()).toEqual(["test"]);
    });

    it("normalizes channel types to lowercase", () => {
        const factory = () => ({ channelType: "slack" }) as any;

        registerChannelAdapter("Slack", factory);

        expect(getChannelAdapterFactory("slack")).toBe(factory);
        expect(getChannelAdapterFactory("SLACK")).toBe(factory);
        expect(listRegisteredChannelTypes()).toEqual(["slack"]);
    });

    it("rejects duplicate registrations", () => {
        const factory = () => ({ channelType: "test" }) as any;

        registerChannelAdapter("test", factory);

        expect(() => registerChannelAdapter("test", factory)).toThrow(/already registered/i);
    });
});
