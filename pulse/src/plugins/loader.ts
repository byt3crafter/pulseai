/**
 * Plugin Loader — loads plugins from local directories.
 */

import { PluginManifest } from "./sdk/types.js";
import { logger } from "../utils/logger.js";
import { pathToFileURL } from "url";
import { existsSync } from "fs";
import { resolve } from "path";

export interface LoadedPlugin {
    manifest: PluginManifest;
    source: "local" | "builtin";
    sourcePath: string;
}

/**
 * Load a plugin from a local file path.
 * The file must export a PluginManifest (default export or named `plugin`).
 */
export async function loadPluginFromPath(pluginPath: string): Promise<LoadedPlugin | null> {
    const absPath = resolve(pluginPath);

    if (!existsSync(absPath)) {
        logger.warn({ pluginPath: absPath }, "Plugin path does not exist");
        return null;
    }

    try {
        // Dynamic import supports both .ts (via tsx loader) and .js files
        const mod = await import(pathToFileURL(absPath).href);
        const manifest: PluginManifest = mod.default || mod.plugin;

        if (!manifest || !manifest.name || !manifest.version) {
            logger.warn({ pluginPath: absPath }, "Plugin file missing required manifest fields (name, version)");
            return null;
        }

        logger.info(
            { name: manifest.name, version: manifest.version, pluginPath: absPath },
            "Plugin loaded"
        );

        return {
            manifest,
            source: "local",
            sourcePath: absPath,
        };
    } catch (err) {
        logger.error({ err, pluginPath: absPath }, "Failed to load plugin");
        return null;
    }
}
