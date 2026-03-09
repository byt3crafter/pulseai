---
name: delegation
description: Delegate tasks to other specialized agents. Use when a task is better suited for another agent's expertise.
---

# Multi-Agent Delegation

## When to Use
- A task requires expertise outside your specialization
- A complex request has parts better handled by different agents
- User explicitly asks you to involve another agent
- A long-running task can be parallelized across agents

## Tools
- **delegate_to_agent** — Send a task to another agent and get the result
- **list_agents** — Refresh the list of available agents

## How to Use

### Delegating a Task
1. Identify which available agent is best suited (check the delegation context in your prompt)
2. Write a clear, self-contained task description — the target agent does NOT see your conversation
3. Include ALL necessary context: data, IDs, specific requirements
4. Call `delegate_to_agent` with the agent's ID and your task description

### Writing Good Task Descriptions
The target agent starts fresh — include everything it needs:

Good task:
```
Generate a financial summary for Company ABC (ID: abc-123) for January 2026.
Include: revenue, expenses, net profit. Format as a markdown table.
Return the complete summary text.
```

Bad task:
```
Get the report for that company we discussed.
```

### When NOT to Delegate
- Simple tasks you can handle yourself (don't add latency)
- Tasks requiring your current conversation context
- When no available agent has the right specialization
- When the user specifically asked YOU to do it

## Patterns

### Synthesis Pattern
1. Delegate sub-tasks to specialized agents
2. Collect results from each
3. Synthesize into a unified response for the user

### Expertise Routing
Match tasks to agent specializations:
- Financial data → finance/accounting agent
- Customer queries → support agent
- Technical tasks → engineering agent
- Content creation → writing agent
