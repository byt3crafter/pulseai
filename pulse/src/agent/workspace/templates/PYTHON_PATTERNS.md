# Python Patterns for API Integration

## HTTP Request Template
```python
import requests, os, json

url = os.environ["API_URL"]
headers = {"Authorization": f"Bearer {os.environ['API_KEY']}"}

r = requests.get(f"{url}/endpoint", headers=headers, params={"key": "value"})
r.raise_for_status()
data = r.json()
```

## Error Handling
```python
try:
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    data = r.json()
except requests.exceptions.HTTPError as e:
    print(f"HTTP Error {e.response.status_code}: {e.response.text[:500]}")
except requests.exceptions.ConnectionError:
    print(f"Connection failed to {url}")
except requests.exceptions.Timeout:
    print("Request timed out")
```

## Pagination Loop
```python
all_records = []
page = 1
while True:
    r = requests.get(f"{url}/items", headers=headers, params={"page": page, "limit": 100})
    batch = r.json().get("data", [])
    if not batch:
        break
    all_records.extend(batch)
    page += 1
print(f"Fetched {len(all_records)} records")
```

## Data Processing with Pandas
```python
import pandas as pd

df = pd.DataFrame(records)
# Filter
overdue = df[df["outstanding_amount"] > 0]
# Group and aggregate
summary = df.groupby("customer")["amount"].agg(["sum", "count", "mean"])
# Sort
top_10 = df.nlargest(10, "amount")
# Format output
print(df.to_string(index=False))
# Or as markdown table
print(df.to_markdown(index=False))
```

## CSV/Excel Export
```python
import pandas as pd

df = pd.DataFrame(data)
# CSV
df.to_csv("/workspace/output.csv", index=False)
# Excel
df.to_excel("/workspace/output.xlsx", index=False, sheet_name="Report")
```

## Date Handling
```python
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

today = datetime.now()
last_month = today - relativedelta(months=1)
start_of_month = today.replace(day=1)
date_str = today.strftime("%Y-%m-%d")
```

## JSON Pretty Print
```python
import json
print(json.dumps(data, indent=2, default=str))
```

## Retry Pattern
```python
import time

def api_call_with_retry(url, headers, max_retries=3):
    for attempt in range(max_retries):
        try:
            r = requests.get(url, headers=headers, timeout=30)
            r.raise_for_status()
            return r.json()
        except (requests.exceptions.RequestException) as e:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise
```

## Environment Variable Access
```python
import os
# All vault credentials are available as env vars
api_key = os.environ["ERPNEXT_API_KEY"]  # Required - will raise KeyError if missing
api_url = os.environ.get("ERPNEXT_URL", "https://default.example.com")  # Optional with default
```
