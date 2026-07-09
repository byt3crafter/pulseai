import { describe, expect, it } from "vitest";
import { resolveTenantPluginEnabled } from "../plugins/tenant-access.js";

describe("plugin tenant access", () => {
    it("enables a globally enabled plugin when the tenant has no override", () => {
        expect(resolveTenantPluginEnabled(
            { exists: true, globallyEnabled: true },
            undefined,
        )).toBe(true);
    });

    it("disables a plugin when the platform disabled it", () => {
        expect(resolveTenantPluginEnabled(
            { exists: true, globallyEnabled: false },
            { enabled: true },
        )).toBe(false);
    });

    it("disables a plugin when the tenant disabled it", () => {
        expect(resolveTenantPluginEnabled(
            { exists: true, globallyEnabled: true },
            { enabled: false },
        )).toBe(false);
    });

    it("does not expose missing plugins", () => {
        expect(resolveTenantPluginEnabled(
            { exists: false, globallyEnabled: false },
            { enabled: true },
        )).toBe(false);
    });
});
