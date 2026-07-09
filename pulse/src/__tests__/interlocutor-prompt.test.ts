/**
 * Interlocutor Identity Tests
 *
 * The agent must know who it's currently talking to. `contactName` (plus an
 * optional @handle and role) is rendered into a "Who you're talking to" section
 * so the agent addresses people by name and never asks "who are you?".
 * Regression guard: the field used to be declared but never rendered.
 */
import { describe, it, expect } from "vitest";
import { buildAgentSystemPrompt, SystemPromptParams } from "../agent/system-prompt-builder.js";

const base: SystemPromptParams = {
    basePrompt: "You are Natalie.",
    enabledTools: [],
    modelId: "claude-opus-4-8",
    channelType: "telegram",
    hasMemoryTools: false,
    delegationActive: false,
};

describe("interlocutor identity in system prompt", () => {
    it("renders the sender's name when contactName is provided", () => {
        const prompt = buildAgentSystemPrompt({ ...base, contactName: "Ludovic" });
        expect(prompt).toContain("Who you're talking to");
        expect(prompt).toContain("**Ludovic**");
    });

    it("includes the @handle and role when provided", () => {
        const prompt = buildAgentSystemPrompt({
            ...base,
            contactName: "Ludovic",
            senderUsername: "byt3crafter",
            senderRole: "Founder",
        });
        expect(prompt).toContain("**Ludovic**");
        expect(prompt).toContain("@byt3crafter");
        expect(prompt).toContain("Founder");
    });

    it("omits the section entirely when no contactName is known", () => {
        const prompt = buildAgentSystemPrompt({ ...base });
        expect(prompt).not.toContain("Who you're talking to");
    });
});
