---
name: python
description: Execute Python code in a sandboxed environment. Use for data analysis, calculations, file processing, or any computational task.
---

# Python Sandbox Execution

## When to Use
- User asks for data analysis, calculations, or number crunching
- You need to process, transform, or generate structured data
- User asks you to run Python code
- Tasks requiring libraries (pandas, matplotlib, requests, etc.)
- Complex math or statistical operations

## Tools
- **python_execute** — Run Python code in a sandboxed Docker container

## How to Use

### Basic Execution
```python
# Simple calculation
result = 42 * 3.14
print(result)
```

The sandbox captures stdout — always `print()` your results.

### Using Packages
Specify needed packages in the `packages` parameter:
- `["pandas", "matplotlib"]` — for data analysis
- `["requests"]` — for HTTP calls
- `["numpy", "scipy"]` — for scientific computing

Packages are installed via pip before execution.

### Timeouts
Default timeout is reasonable for most tasks. Set a higher `timeout` (in seconds) for:
- Large data processing
- Network requests
- Complex computations

## Best Practices

### Always Print Results
The sandbox returns stdout. If you don't print, you get nothing:
```python
# BAD — no output
data = [1, 2, 3]
sum(data)

# GOOD — output captured
data = [1, 2, 3]
print(f"Sum: {sum(data)}")
```

### Error Handling
Wrap risky operations in try/except and print errors:
```python
try:
    result = risky_operation()
    print(result)
except Exception as e:
    print(f"Error: {e}")
```

### Data Formatting
Format output for readability — the user sees what you print:
```python
import json
data = {"revenue": 50000, "expenses": 30000}
print(json.dumps(data, indent=2))
```

### Credentials
API credentials from the vault are injected as environment variables. Access them via:
```python
import os
api_key = os.environ.get("CREDENTIAL_NAME")
```
