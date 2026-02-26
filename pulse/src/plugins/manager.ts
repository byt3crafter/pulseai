/**
 * Plugin Manager — lifecycle management for plugins.
 * Handles init, start, stop, and registration of tools, hooks, and routes.
 */

import { PluginManifest } from "./sdk/types.js";
import { hookRegistry } from "./hooks.js";
import { discoverPlugins } from "./discovery.js";
import { loadPluginFromPath, LoadedPlugin } from "./loader.js";
import { logger } from "../utils/logger.js";
import { Tool } from "../agent/tools/tool.interface.js";

export class PluginManager {
    private loadedPlugins: Map<string, LoadedPlugin> = new Map();
    private pluginTools: Tool[] = [];

    /**
     * Initialize: discover and load all plugins.
     */
    async init(): Promise<void> {
        const discovered = await discoverPlugins();

        for (const d of discovered) {
            if (!d.enabled || !d.sourcePath) continue;

            const loaded = await loadPluginFromPath(d.sourcePath);
            if (loaded) {
                this.loadedPlugins.set(loaded.manifest.name, loaded);
                this.registerPlugin(loaded.manifest);
            }
        }

        logger.info(
            { loadedCount: this.loadedPlugins.size },
            "Plugin manager initialized"
        );
    }

    /**
     * Register a plugin's hooks, tools, and routes.
     */
    private registerPlugin(manifest: PluginManifest): void {
        // Register hooks
        if (manifest.hooks) {
            for (const [hookName, handler] of Object.entries(manifest.hooks)) {
                if (handler) {
                    hookRegistry.register(hookName, handler, manifest.name);
                }
            }
        }

        // Collect tools
        if (manifest.tools && manifest.tools.length > 0) {
            this.pluginTools.push(...manifest.tools);
            logger.debug(
                { pluginName: manifest.name, toolCount: manifest.tools.length },
                "Plugin tools registered"
            );
        }

        logger.info({ name: manifest.name, version: manifest.version }, "Plugin registered");
    }

    /**
     * Get all tools provided by plugins.
     */
    getPluginTools(): Tool[] {
        return this.pluginTools;
    }

    /**
     * Get all plugin routes for Fastify registration.
     */
    getPluginRoutes(): Array<{ method: string; path: string; handler: Function; pluginName: string }> {
        const routes: Array<{ method: string; path: string; handler: Function; pluginName: string }> = [];

        for (const [name, loaded] of this.loadedPlugins) {
            if (loaded.manifest.routes) {
                for (const route of loaded.manifest.routes) {
                    routes.push({
                        method: route.method,
                        path: `/plugins/${name}${route.path}`,
                        handler: route.handler,
                        pluginName: name,
                    });
                }
            }
        }

        return routes;
    }

    /**
     * Run gateway-start hooks.
     */
    async onGatewayStart(server: any): Promise<void> {
        await hookRegistry.emit("gateway-start", { server });

        // Register plugin routes on the Fastify server
        const routes = this.getPluginRoutes();
        for (const route of routes) {
            const method = route.method.toLowerCase() as "get" | "post" | "put" | "delete" | "patch";
            (server as any)[method](route.path, route.handler);
            logger.debug({ method: route.method, path: route.path, plugin: route.pluginName }, "Plugin route registered");
        }
    }

    /**
     * Run gateway-stop hooks.
     */
    async onGatewayStop(): Promise<void> {
        await hookRegistry.emit("gateway-stop");
    }

    /**
     * Shutdown all plugins.
     */
    async shutdown(): Promise<void> {
        await this.onGatewayStop();
        this.loadedPlugins.clear();
        this.pluginTools.length = 0;
        hookRegistry.clear();
        logger.info("Plugin manager shut down");
    }

    /**
     * Get list of loaded plugins.
     */
    getLoadedPlugins(): Array<{ name: string; version: string; source: string }> {
        return Array.from(this.loadedPlugins.values()).map((p) => ({
            name: p.manifest.name,
            version: p.manifest.version,
            source: p.source,
        }));
    }
}

export const pluginManager = new PluginManager();
