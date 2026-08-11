import { Tool } from "../tool.interface.js";
import { getTenantTimezone } from "../tz-util.js";

/**
 * Time tool - Returns current date and time in the WORKSPACE timezone by default
 * (so "10am" and "tomorrow" mean the user's local time, not UTC).
 */
export const timeTool: Tool = {
    name: "get_current_time",
    description: "Get the current date and time in this workspace's local timezone. Use it before scheduling or interpreting relative times like 'tomorrow at 3pm' so you use the right timezone.",
    parameters: {
        type: "object",
        properties: {
            timezone: {
                type: "string",
                description: "Optional IANA timezone override (e.g., 'America/New_York'). Defaults to the workspace timezone.",
            },
        },
    },
    async execute({ tenantId, args }) {
        const now = new Date();
        const tz = (typeof args?.timezone === "string" && args.timezone.trim())
            ? args.timezone.trim()
            : await getTenantTimezone(tenantId);
        let result: string;
        try {
            result = now.toLocaleString("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "long" });
        } catch {
            result = `Invalid timezone '${tz}'. UTC time: ${now.toISOString()}`;
        }
        return {
            result: `Current time (${tz}): ${result}`,
            metadata: { timestamp: now.toISOString(), timezone: tz, isoLocal: now.toISOString() },
        };
    },
};
