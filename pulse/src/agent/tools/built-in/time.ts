import { Tool } from "../tool.interface.js";

/**
 * Time tool - Returns current date and time
 * Useful for context-aware responses and scheduling
 */
export const timeTool: Tool = {
    name: "get_current_time",
    description: "Get the current date and time. Use this when you need to know what time it is, what day it is, or need current temporal context for your response.",
    parameters: {
        type: "object",
        properties: {
            timezone: {
                type: "string",
                description: "Optional IANA timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo'). Defaults to UTC if not specified.",
            },
        },
    },
    async execute({ args }) {
        const now = new Date();

        let result: string;
        if (args.timezone) {
            try {
                result = now.toLocaleString("en-US", {
                    timeZone: args.timezone,
                    dateStyle: "full",
                    timeStyle: "long",
                });
            } catch (err) {
                // Invalid timezone, fall back to UTC
                result = `Invalid timezone '${args.timezone}'. UTC time: ${now.toISOString()}`;
            }
        } else {
            result = now.toISOString();
        }

        return {
            result: `Current time: ${result}`,
            metadata: {
                timestamp: now.toISOString(),
                timezone: args.timezone || "UTC",
            },
        };
    },
};
