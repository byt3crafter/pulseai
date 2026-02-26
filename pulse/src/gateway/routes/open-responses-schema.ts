/**
 * Zod schemas for OpenResponses API request validation.
 */

import { z } from "zod";

export const responseInputItemSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("message"),
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
    }),
    z.object({
        type: z.literal("function_call_output"),
        call_id: z.string(),
        output: z.string(),
    }),
]);

export const responseToolSchema = z.object({
    type: z.literal("function"),
    name: z.string(),
    description: z.string().optional(),
    parameters: z.any().optional(),
});

export const createResponseSchema = z.object({
    model: z.string(),
    instructions: z.string().optional(),
    input: z.union([
        z.string(),
        z.array(responseInputItemSchema),
    ]),
    tools: z.array(responseToolSchema).optional(),
    stream: z.boolean().optional().default(false),
    temperature: z.number().optional(),
    max_output_tokens: z.number().optional(),
});

export type CreateResponseInput = z.infer<typeof createResponseSchema>;
