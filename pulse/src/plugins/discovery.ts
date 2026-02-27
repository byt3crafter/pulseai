/**
 * Plugin Discovery — discovers installed plugins from DB and local directories.
 */

import { db } from "../storage/db.js";
import { installedPlugins } from "../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import { readdirSync, existsSync } from "fs";
import { resolve, join } from "path";

export interface DiscoveredPlugin {
    name: string;
    version?: string;
    source: "local" | "builtin";
    sourcePath: string;
    enabled: boolean;
    config: Record<string, any>;
}

/**
 * Discover all plugins from DB (installed_plugins table) and local plugin directory.
 */
export async function discoverPlugins(): Promise<DiscoveredPlugin[]> {
    const discovered: DiscoveredPlugin[] = [];

    try {
        // 1. Load from DB
        const dbPlugins = await db.query.installedPlugins.findMany({
            where: eq(installedPlugins.enabled, true),
        });

        for (const p of dbPlugins) {
            discovered.push({
                name: p.name,
                version: p.version || undefined,
                source: p.source as "local" | "builtin",
                sourcePath: p.sourcePath || "",
                enabled: p.enabled ?? true,
                config: (p.config as Record<string, any>) || {},
            });
        }

        // 2. Scan local plugins directory (source or compiled)
        const sourceDir = resolve(process.cwd(), "plugins");
        const compiledDir = resolve(process.cwd(), "dist", "plugins");
        const pluginsDir = existsSync(sourceDir) ? sourceDir : existsSync(compiledDir) ? compiledDir : null;
        if (pluginsDir) {
            const entries = readdirSync(pluginsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const indexPath = join(pluginsDir, entry.name, "index.ts");
                    const jsPath = join(pluginsDir, entry.name, "index.js");
                    const filePath = existsSync(indexPath) ? indexPath : existsSync(jsPath) ? jsPath : null;

                    if (filePath) {
                        // Check if already in DB
                        const existing = discovered.find((d) => d.name === entry.name);
                        if (!existing) {
                            discovered.push({
                                name: entry.name,
                                source: "local",
                                sourcePath: filePath,
                                enabled: true,
                                config: {},
                            });
                        }
                    }
                }
            }
        }
    } catch (err) {
        logger.error({ err }, "Plugin discovery failed");
    }

    logger.info({ pluginCount: discovered.length }, "Plugins discovered");
    return discovered;
}
