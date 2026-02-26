/**
 * LAN Discovery via Bonjour/mDNS — advertise Pulse AI on the local network.
 * Uses bonjour-service package to publish _pulse-ai._tcp service.
 */

import { logger } from "../utils/logger.js";

let bonjourInstance: any = null;
let publishedService: any = null;

export async function startDiscovery(port: number, displayName?: string): Promise<void> {
    try {
        const { Bonjour } = await import("bonjour-service");
        bonjourInstance = new Bonjour();

        publishedService = bonjourInstance.publish({
            name: displayName || "Pulse AI Gateway",
            type: "pulse-ai",
            protocol: "tcp",
            port,
            txt: {
                role: "gateway",
                displayName: displayName || "Pulse AI",
                version: "1.0.0",
            },
        });

        logger.info({ port, displayName }, "Bonjour discovery service published");
    } catch (err) {
        logger.warn({ err }, "Failed to start Bonjour discovery (bonjour-service may not be installed)");
    }
}

export function stopDiscovery(): void {
    if (publishedService) {
        try {
            publishedService.stop?.();
        } catch {}
        publishedService = null;
    }
    if (bonjourInstance) {
        try {
            bonjourInstance.destroy?.();
        } catch {}
        bonjourInstance = null;
    }
    logger.info("Bonjour discovery service stopped");
}
