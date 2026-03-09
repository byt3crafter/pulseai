---
name: memory
description: Store, search, and forget persistent memories. Use when asked to remember something, recall past conversations, or forget specific details.
---

# Memory Management

## When to Use
- User says "remember this", "don't forget", "keep in mind", or similar
- User asks about something from a previous conversation
- You discover important facts, preferences, or decisions worth preserving
- User asks you to forget or delete something you stored
- Before answering questions about past events, check memories first

## Tools
- **memory_store** — Save a fact, decision, preference, or context
- **memory_search** — Find stored memories by semantic query
- **memory_forget** — Delete a memory by its ID

## How to Use

### Storing Memories
- Write clear, self-contained entries — future you has no conversation context
- Include WHO, WHAT, WHEN, and WHY when relevant
- Use `category` to organize: "preference", "decision", "fact", "contact", "project"
- Set `importance` to "high" for critical decisions, "low" for nice-to-know
- Don't store obvious or transient info (e.g., "user said hello")

Good memory: "Client ABC prefers reports in PDF format with executive summary first. Decided on 2026-01-15."
Bad memory: "User asked about reports."

### Searching Memories
- Search BEFORE answering questions about past context
- Use specific queries: "ABC Corp report preferences" not "reports"
- Try multiple queries if first search returns nothing
- Set `limit` higher (10-15) for broad topics, lower (3-5) for specific lookups

### Forgetting Memories
- When user says "forget X" or "delete that memory"
- First search to find the memory ID, then forget it
- Confirm what you're deleting before calling memory_forget

## Patterns

### Proactive Memory Storage
When you learn something important during conversation, store it without being asked:
1. User mentions a preference → store it
2. A decision is made → store it with context
3. User corrects you → store the correction
4. New contact/project info → store it

### Memory-Augmented Responses
Before answering about prior context:
1. Call memory_search with relevant query
2. If found, incorporate naturally: "Based on what I remember..."
3. If not found, say so: "I don't have any stored memories about that."
4. Never fabricate memories — only cite what memory_search returns
