# General REST API Patterns

## HTTP Methods
- **GET** — Read/list resources (idempotent, no body)
- **POST** — Create resources (body: JSON)
- **PUT** — Full update (body: complete resource)
- **PATCH** — Partial update (body: changed fields only)
- **DELETE** — Remove resource

## Common Authentication Methods
```python
# API Key in header
headers = {"Authorization": f"Bearer {api_key}"}
headers = {"X-API-Key": api_key}
headers = {"Authorization": f"token {api_key}:{api_secret}"}

# Basic Auth
from requests.auth import HTTPBasicAuth
auth = HTTPBasicAuth(username, password)
r = requests.get(url, auth=auth)

# OAuth 2.0
headers = {"Authorization": f"Bearer {access_token}"}
```

## Response Status Codes
- **200** OK — Success
- **201** Created — Resource created
- **204** No Content — Success, no body
- **400** Bad Request — Invalid input
- **401** Unauthorized — Bad/missing credentials
- **403** Forbidden — Insufficient permissions
- **404** Not Found — Resource doesn't exist
- **429** Too Many Requests — Rate limited (check Retry-After header)
- **500** Internal Server Error — Server issue

## Pagination Patterns
```python
# Offset-based: ?offset=0&limit=100
# Page-based: ?page=1&per_page=100
# Cursor-based: ?cursor=abc123&limit=100 (check response for next_cursor)
```

## Rate Limiting
```python
import time

r = requests.get(url, headers=headers)
if r.status_code == 429:
    retry_after = int(r.headers.get("Retry-After", 60))
    time.sleep(retry_after)
    r = requests.get(url, headers=headers)
```

## Common Query Parameters
- `fields` or `select` — Specify return fields
- `filter` or `where` — Filter conditions
- `sort` or `order_by` — Sort order
- `limit` or `per_page` — Page size
- `offset` or `page` — Pagination position
- `search` or `q` — Full-text search

## Webhook Payloads
```python
# Receiving webhooks: validate signature
import hmac, hashlib

def verify_webhook(payload, signature, secret):
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

## Batch Operations
```python
# If API supports batch
batch = [{"method": "POST", "url": "/items", "body": item} for item in items]
r = requests.post(f"{url}/batch", headers=headers, json={"requests": batch})
```
