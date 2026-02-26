/**
 * Hook Registry — manages plugin hooks with priority ordering.
 */

import { logger } from "../utils/logger.js";

interface HookEntry {
    priority: number;
    handler: Function;
    pluginName: string;
}

export class HookRegistry {
    private hooks: Map<string, HookEntry[]> = new Map();

    register(hookName: string, handler: Function, pluginName: string, priority: number = 0): void {
        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }

        const entries = this.hooks.get(hookName)!;
        entries.push({ priority, handler, pluginName });
        // Sort: higher priority runs first
        entries.sort((a, b) => b.priority - a.priority);

        logger.debug({ hookName, pluginName, priority }, "Hook registered");
    }

    /**
     * Run all handlers for a hook in priority order.
     * If a handler returns a non-null value, it overrides the context.
     * Errors are caught and logged — they don't break the pipeline.
     */
    async run<T>(hookName: string, context: T): Promise<T> {
        const entries = this.hooks.get(hookName);
        if (!entries || entries.length === 0) return context;

        let currentContext = context;

        for (const entry of entries) {
            try {
                const result = await entry.handler(currentContext);
                if (result !== null && result !== undefined) {
                    currentContext = result;
                }
            } catch (err) {
                logger.error(
                    { err, hookName, pluginName: entry.pluginName },
                    "Plugin hook error (non-fatal)"
                );
            }
        }

        return currentContext;
    }

    /**
     * Run all handlers for a void hook (no return value expected).
     */
    async emit(hookName: string, context?: any): Promise<void> {
        const entries = this.hooks.get(hookName);
        if (!entries || entries.length === 0) return;

        for (const entry of entries) {
            try {
                await entry.handler(context);
            } catch (err) {
                logger.error(
                    { err, hookName, pluginName: entry.pluginName },
                    "Plugin hook error (non-fatal)"
                );
            }
        }
    }

    getRegisteredHooks(): string[] {
        return Array.from(this.hooks.keys());
    }

    getHookCount(hookName: string): number {
        return this.hooks.get(hookName)?.length || 0;
    }

    clear(): void {
        this.hooks.clear();
    }
}

export const hookRegistry = new HookRegistry();
