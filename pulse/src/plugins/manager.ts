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
import { db } from "../storage/db.js";
import { installedPlugins } from "../storage/schema.js";
import { eq } from "drizzle-orm";
import { computeManifestHash, summarizeCapabilities, CapabilitySummary } from "./manifest-hash.js";
import { isPluginEnabledForTenant } from "./tenant-access.js";
import { resolve } from "path";

// Bundled plugins ship inside the deployed codebase (pulse/plugins or
// dist/plugins). A capability change to one of these arrives via a code deploy
// the operator already trusts, so it is auto-re-approved rather than silently
// deactivated. Genuinely new plugins, and any future non-bundled ones, still
// require explicit approval.
const BUNDLED_ROOTS = [resolve(process.cwd(), "plugins"), resolve(process.cwd(), "dist", "plugins")];
function isBundledPlugin(sourcePath: string): boolean {
    return !!sourcePath && BUNDLED_ROOTS.some((root) => sourcePath.startsWith(root));
}

export class PluginManager {
    private loadedPlugins: Map<string, LoadedPlugin> = new Map();
    private pluginTools: Array<{ pluginName: string; tool: Tool }> = [];
    private activePlugins: Set<string> = new Set();

    /**
     * Initialize: discover and load all plugins.
     */
    async init(): Promise<void> {
        const discovered = await discoverPlugins();

        for (const d of discovered) {
            if (!d.sourcePath) continue;

            const loaded = await loadPluginFromPath(d.sourcePath);
            if (!loaded) continue;
            this.loadedPlugins.set(loaded.manifest.name, loaded);

            const manifestHash = computeManifestHash(loaded.manifest);
            const summary = summarizeCapabilities(loaded.manifest);

            const [existing] = await db
                .select()
                .from(installedPlugins)
                .where(eq(installedPlugins.name, loaded.manifest.name))
                .limit(1);

            // Grandfather a pre-existing plugin (installed before approvals existed)
            // so nothing breaks. Truly new plugins stay unapproved until an admin
            // approves them; a changed capability set (hash drift) also needs re-approval.
            let approvedHash = (existing as any)?.approvedHash ?? null;
            let grandfathered = false;
            if (existing && !approvedHash) {
                // Pre-approval-era plugin — grandfather so nothing breaks.
                approvedHash = manifestHash;
                grandfathered = true;
            } else if (
                existing && approvedHash && approvedHash !== manifestHash
                && existing.enabled !== false && isBundledPlugin(loaded.sourcePath)
            ) {
                // A bundled vendor plugin's capabilities changed via a code deploy
                // the operator controls — auto re-approve so vendor updates don't
                // silently deactivate the plugin (and all its existing tools).
                approvedHash = manifestHash;
                grandfathered = true;
                logger.info({ name: loaded.manifest.name }, "Bundled plugin capability change auto-approved");
            }

            const enabled = existing ? existing.enabled !== false : true;
            const approved = approvedHash === manifestHash;
            const active = enabled && approved;

            await this.upsertPluginToDB(loaded, manifestHash, summary, grandfathered ? manifestHash : undefined);

            if (active) {
                this.registerPlugin(loaded.manifest);
                this.activePlugins.add(loaded.manifest.name);
            } else {
                const reason = !enabled
                    ? "disabled"
                    : !existing
                    ? "pending admin approval"
                    : "capabilities changed — needs re-approval";
                logger.warn(
                    { name: loaded.manifest.name, reason },
                    "Plugin loaded but NOT activated (capabilities withheld)"
                );
            }
        }

        logger.info(
            { loadedCount: this.loadedPlugins.size, activeCount: this.activePlugins.size },
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
            this.pluginTools.push(...manifest.tools.map((tool) => ({ pluginName: manifest.name, tool })));
            logger.debug(
                { pluginName: manifest.name, toolCount: manifest.tools.length },
                "Plugin tools registered"
            );
        }

        logger.info({ name: manifest.name, version: manifest.version }, "Plugin registered");
    }

    /**
     * Sync a loaded plugin's metadata to the installed_plugins DB table.
     * Upserts on name — refreshes metadata but never overwrites `enabled`.
     */
    private async upsertPluginToDB(
        loaded: LoadedPlugin,
        manifestHash: string,
        summary: CapabilitySummary,
        approvedHashToSet?: string,
    ): Promise<void> {
        const { manifest, sourcePath } = loaded;
        const config = {
            description: manifest.description || "",
            author: manifest.author || "",
            toolCount: manifest.tools?.length || 0,
            hookNames: manifest.hooks ? Object.keys(manifest.hooks) : [],
            routeCount: manifest.routes?.length || 0,
            credentialSchema: manifest.credentialSchema || [],
            capabilities: summary,
        };

        const updateSet: any = {
            version: manifest.version,
            sourcePath,
            config,
            manifestHash,
            declaredPermissions: summary.permissions,
        };
        if (approvedHashToSet) updateSet.approvedHash = approvedHashToSet;

        try {
            await db
                .insert(installedPlugins)
                .values({
                    name: manifest.name,
                    version: manifest.version,
                    source: "local",
                    sourcePath,
                    config,
                    enabled: true,
                    manifestHash,
                    declaredPermissions: summary.permissions,
                    ...(approvedHashToSet ? { approvedHash: approvedHashToSet } : {}),
                })
                .onConflictDoUpdate({
                    target: installedPlugins.name,
                    set: updateSet,
                });

            logger.info({ name: manifest.name }, "Plugin synced to DB");
        } catch (err) {
            logger.error({ err, name: manifest.name }, "Failed to sync plugin to DB");
        }
    }

    /**
     * Get all tools provided by plugins.
     */
    getPluginTools(): Tool[] {
        return this.pluginTools.map((entry) => entry.tool);
    }

    /**
     * Get plugin tools enabled for a tenant. Platform plugin activation is checked
     * at load time; tenant overrides are checked per request.
     */
    async getPluginToolsForTenant(tenantId: string): Promise<Tool[]> {
        const tools: Tool[] = [];
        const enabledCache = new Map<string, boolean>();

        for (const entry of this.pluginTools) {
            let enabled = enabledCache.get(entry.pluginName);
            if (enabled === undefined) {
                enabled = await isPluginEnabledForTenant(entry.pluginName, tenantId);
                enabledCache.set(entry.pluginName, enabled);
            }
            if (enabled) tools.push(entry.tool);
        }

        return tools;
    }

    /**
     * Get all plugin routes for Fastify registration.
     */
    getPluginRoutes(): Array<{ method: string; path: string; handler: Function; pluginName: string }> {
        const routes: Array<{ method: string; path: string; handler: Function; pluginName: string }> = [];

        for (const [name, loaded] of this.loadedPlugins) {
            if (!this.activePlugins.has(name)) continue; // only approved+enabled plugins expose routes
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
        this.activePlugins.clear();
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
