/**
 * Config Manager — hot-reloadable configuration system.
 *
 * Loads config from environment variables (secrets/restart-required) and from
 * globalSettings.gatewayConfig in the database (hot fields).
 *
 * Hot fields can be updated at runtime without restarting the server.
 * Polls DB every 30s and emits change events.
 */

import { EventEmitter } from "events";
import { db } from "../storage/db.js";
import { globalSettings } from "../storage/schema.js";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { logger } from "../utils/logger.js";

// Fields that require a full server restart
const RESTART_REQUIRED_KEYS = new Set([
    "PORT", "DATABASE_URL", "REDIS_URL", "ENCRYPTION_KEY", "NODE_ENV",
]);

// Fields that can be hot-reloaded from gatewayConfig
const HOT_FIELD_DEFAULTS: Record<string, any> = {
    openai_api_enabled: false,
    sandbox_defaults: { mode: "off" },
    trusted_proxy: { enabled: false, ips: [], userHeader: "X-Forwarded-User" },
    bonjour_enabled: false,
    cli_backends: { enabled: false },
    heartbeat_poll_interval: 30,
    api_rate_limit_default: 100,
};

export class ConfigManager extends EventEmitter {
    private hotConfig: Record<string, any> = { ...HOT_FIELD_DEFAULTS };
    private pollTimer: NodeJS.Timeout | null = null;
    private log = logger.child({ component: "config-manager" });

    /**
     * Initialize: load hot config from DB.
     */
    async init(): Promise<void> {
        await this.reload();
        // Poll every 30 seconds
        this.pollTimer = setInterval(() => this.reload(), 30_000);
        this.log.info("Config manager initialized with DB polling");
    }

    /**
     * Get a hot config value.
     */
    get(key: string): any {
        return this.hotConfig[key] ?? HOT_FIELD_DEFAULTS[key];
    }

    /**
     * Get all hot config.
     */
    getAll(): Record<string, any> {
        return { ...this.hotConfig };
    }

    /**
     * Check if a key requires restart.
     */
    isRestartRequired(key: string): boolean {
        return RESTART_REQUIRED_KEYS.has(key);
    }

    /**
     * Patch hot config values and persist to DB.
     */
    async patch(updates: Record<string, any>): Promise<{ applied: string[]; restartRequired: string[] }> {
        const applied: string[] = [];
        const restartRequired: string[] = [];

        for (const key of Object.keys(updates)) {
            if (RESTART_REQUIRED_KEYS.has(key)) {
                restartRequired.push(key);
                continue;
            }
            this.hotConfig[key] = updates[key];
            applied.push(key);
        }

        // Persist to DB
        if (applied.length > 0) {
            try {
                await db.execute(
                    sql`UPDATE global_settings SET gateway_config = gateway_config || ${JSON.stringify(this.hotConfig)}::jsonb, updated_at = now() WHERE id = 'root'`
                );
                this.emit("config:changed", { applied, config: this.hotConfig });
                this.log.info({ applied }, "Hot config updated");
            } catch (err) {
                this.log.error({ err }, "Failed to persist config update");
            }
        }

        if (restartRequired.length > 0) {
            this.log.warn({ restartRequired }, "Some config changes require server restart");
        }

        return { applied, restartRequired };
    }

    /**
     * Force reload from DB.
     */
    async reload(): Promise<void> {
        try {
            const settings = await db.query.globalSettings.findFirst({
                where: eq(globalSettings.id, "root"),
            });

            if (settings?.gatewayConfig && typeof settings.gatewayConfig === "object") {
                const prevConfig = { ...this.hotConfig };
                this.hotConfig = { ...HOT_FIELD_DEFAULTS, ...(settings.gatewayConfig as Record<string, any>) };

                // Check for changes
                const changed = Object.keys(this.hotConfig).filter(
                    k => JSON.stringify(this.hotConfig[k]) !== JSON.stringify(prevConfig[k])
                );

                if (changed.length > 0) {
                    this.emit("config:changed", { applied: changed, config: this.hotConfig });
                    this.log.debug({ changed }, "Hot config reloaded with changes");
                }
            }
        } catch (err) {
            this.log.error({ err }, "Failed to reload config from DB");
        }
    }

    /**
     * Stop polling.
     */
    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.log.info("Config manager stopped");
    }
}

export const configManager = new ConfigManager();
