---
name: scripts
description: Save, load, and manage reusable code scripts. Use when asked to create automations, save code snippets, or reuse previous scripts.
---

# Script Management

## When to Use
- User asks you to save a script or automation for later
- User wants to reuse a previously saved script
- User asks "what scripts do I have?"
- You create useful code that should be persisted for reuse

## Tools
- **script_save** — Save a script to the database
- **script_load** — Load a saved script by filename
- **script_list** — List all saved scripts

## How to Use

### Saving Scripts
Use descriptive filenames and always include a description:
- `filename`: Use kebab-case with extension — "weekly-report.py", "data-cleanup.js"
- `code`: The complete, runnable script
- `description`: What it does, when to use it
- `language`: "python", "javascript", "bash", etc.

### Loading Scripts
Load by exact filename. If user asks vaguely ("that report script"), use `script_list` first to find it.

### Listing Scripts
Show scripts in a clean format: name, description, language.

## Best Practices
- Save scripts that are likely to be reused
- Include comments in the code explaining key parts
- Use meaningful filenames — the user may reference them later
- Update existing scripts with `script_save` using the same filename (overwrites)
- Don't save trivial one-liners unless explicitly asked
