---
name: formatting
description: Format data and responses appropriately for different channels. Use for tables, reports, and structured output.
---

# Data Formatting

## Channel-Aware Formatting

### Telegram
- Use Markdown: **bold**, _italic_, `code`, ```code blocks```
- 4096 character limit per message — split long responses
- Tables don't render well — use monospace code blocks instead:
```
Name       | Revenue  | Status
-----------|----------|--------
Company A  | $50,000  | Active
Company B  | $30,000  | Pending
```
- Use emoji sparingly for visual cues: checkmarks, warnings, etc.

### Web Chat
- Full Markdown support including tables, headers, lists
- No practical message length limit
- Rich formatting available

### API
- Raw JSON responses — no formatting needed
- Structure data as clean JSON objects

## Patterns

### Tables
For tabular data, prefer monospace code blocks (works everywhere):
```
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| data     | data     | data     |
```

### Long Reports
Split into sections with headers:
```
## Summary
Key findings...

## Details
Detailed breakdown...

## Recommendations
Action items...
```

### Numbers
- Currency: $1,234.56 (with commas and 2 decimals)
- Percentages: 45.2% (1 decimal)
- Large numbers: 1.2M, 3.5K (abbreviated)

### Lists
Use bullet points for unordered items, numbered lists for sequences or rankings.

### Dates
Use human-readable formats: "Monday, January 15th" not "2026-01-15" (unless in technical context).
