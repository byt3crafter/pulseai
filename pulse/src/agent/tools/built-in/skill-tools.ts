/**
 * `skill_read` — fetch one skill's instructions on demand.
 *
 * The counterpart to the catalogue in the system prompt. The catalogue carries
 * a name and one line of description per skill (~1.7k tokens for 52 skills);
 * the bodies are ~31x that, so they load only once the agent has decided a
 * skill applies.
 *
 * Registered only for agents that actually have skills — an agent with none
 * must cost exactly what it costs today.
 *
 * See docs/SKILLS_PLAN.md.
 */

import { Tool } from "../tool.interface.js";
import { readAgentSkill } from "../../../skills/skill-service.js";

export const skillReadTool: Tool = {
    name: "skill_read",
    description:
        "Read the full instructions for one of your skills, by name, before doing the task it covers. " +
        "Use the exact name shown in your Skills list. Read the skill BEFORE acting, not after.",
    parameters: {
        type: "object",
        properties: {
            name: {
                type: "string",
                description:
                    "The skill name exactly as it appears in your Skills list, e.g. 'legal/nda-review'.",
            },
        },
        required: ["name"],
    },
    execute: async ({ tenantId, args }) => {
        const name = String((args as any)?.name ?? "").trim();
        if (!name) return { result: JSON.stringify({ error: "No skill name given." }) };

        const agentId = (args as any)._agentId;
        if (!tenantId || !agentId) {
            return { result: JSON.stringify({ error: "Skills are not available in this context." }) };
        }

        /*
         * Re-resolved through the full gating chain rather than fetched by
         * name. The agent supplies this argument, so trusting it would let an
         * agent that had once seen a name read any skill in the deployment,
         * including another workspace's authored one.
         */
        const skill = await readAgentSkill(tenantId, agentId, name);
        if (!skill) {
            return {
                result: JSON.stringify({
                    error: `No skill named '${name}' is available to you. Use a name exactly as listed under Skills.`,
                }),
            };
        }

        return {
            result: JSON.stringify({ skill: skill.qualifiedName, instructions: skill.body }),
            metadata: { skill: skill.qualifiedName },
        };
    },
};
