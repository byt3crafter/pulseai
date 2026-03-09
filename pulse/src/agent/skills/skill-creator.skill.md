---
name: skill-creator
description: Create and manage custom skills for this agent. Use when asked to add new capabilities or knowledge to the agent.
---

# Custom Skill Creation

## When to Use
- User asks you to "learn how to" do something new
- User wants to add domain-specific knowledge
- User asks you to remember a complex workflow or process
- Building specialized capabilities for this agent

## How Custom Skills Work
Custom skills are structured knowledge documents injected into your system prompt. They teach you HOW to do things — when to act, what tools to use, and what patterns to follow.

Unlike memories (which store facts), skills encode procedures and expertise.

## Creating a Skill

A good skill has:
1. **Name** — Short, descriptive identifier (kebab-case)
2. **Description** — When this skill should activate (trigger phrase)
3. **Body** — The actual instructions in markdown

### Structure Template
```markdown
# [Skill Name]

## When to Use
- Trigger conditions...

## How to Do It
- Step-by-step process...

## Tools to Use
- Which tools and how...

## Examples
- Concrete examples...

## Common Mistakes
- What to avoid...
```

### Good Skill Example
Name: "invoice-generation"
Description: "Generate invoices for clients using ERPNext data"
Body:
```markdown
# Invoice Generation
## When to Use
- User asks to create/generate an invoice
- User mentions billing a client

## Process
1. Look up the client in ERPNext using erpnext_list
2. Get their billing details
3. Create a Sales Invoice via erpnext_create
4. Confirm the invoice number with the user

## Important
- Always verify client exists before creating
- Use the company's default payment terms
- Set the posting date to today unless specified otherwise
```

### Bad Skill Example
Name: "do stuff"
Description: "for stuff"
Body: "Do the thing with the tools"

## Managing Skills
Skills are managed through the dashboard Skills tab. To suggest a new skill, describe its purpose and the user can add it through the UI.
