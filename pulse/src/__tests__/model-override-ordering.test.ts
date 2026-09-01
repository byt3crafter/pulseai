import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The per-message model override must be applied BEFORE the system prompt is
 * built, so the prompt's "you are model X" identity line names the model that
 * is actually called. When the override was applied after the prompt build, a
 * turn picked to run on GLM still carried a prompt saying "you are GPT-5.5", and
 * the model faithfully reported GPT-5.5. This asserts the ordering at the source
 * because the runtime is not unit-testable end to end.
 */
const src = readFileSync(join(process.cwd(), "src", "agent", "runtime.ts"), "utf8");

describe("model override is resolved before the prompt is built", () => {
    it("the override is applied ahead of buildAgentSystemPrompt", () => {
        const firstOverride = src.indexOf("options.modelOverride.trim()");
        const promptBuild = src.indexOf("buildAgentSystemPrompt({");
        expect(firstOverride).toBeGreaterThan(-1);
        expect(promptBuild).toBeGreaterThan(-1);
        expect(firstOverride).toBeLessThan(promptBuild);
    });

    it("the prompt is built with activeModelId (the resolved/overridden model)", () => {
        // The identity line uses params.modelId, fed from activeModelId here.
        expect(src).toMatch(/buildAgentSystemPrompt\(\{[\s\S]{0,400}modelId: activeModelId/);
    });
});
