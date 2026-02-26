# Pastel Partner / Sage 50 API Reference

## Authentication
- API Key or Basic Auth
- Use env vars: `PASTEL_API_KEY`, `PASTEL_USERNAME`, `PASTEL_PASSWORD`, `PASTEL_URL`

## Core Endpoints (REST)
- **List**: `GET {url}/api/v1/{resource}?page=1&pageSize=100`
- **Get**: `GET {url}/api/v1/{resource}/{id}`
- **Create**: `POST {url}/api/v1/{resource}` body: JSON
- **Update**: `PUT {url}/api/v1/{resource}/{id}` body: JSON
- **Delete**: `DELETE {url}/api/v1/{resource}/{id}`

## Common Resources
- `customers` - Customer accounts
- `suppliers` - Supplier accounts
- `inventory` - Inventory items
- `invoices` - Sales invoices
- `purchases` - Purchase invoices
- `payments` - Payment entries
- `journals` - Journal entries
- `accounts` - Chart of accounts
- `cashbook` - Cash book entries

## Python Pattern
```python
import requests, os

url = os.environ["PASTEL_URL"]
headers = {"Authorization": f"Bearer {os.environ['PASTEL_API_KEY']}"}

# If using Basic Auth:
# from requests.auth import HTTPBasicAuth
# auth = HTTPBasicAuth(os.environ["PASTEL_USERNAME"], os.environ["PASTEL_PASSWORD"])
# r = requests.get(f"{url}/api/v1/invoices", auth=auth)

# List outstanding invoices
r = requests.get(f"{url}/api/v1/invoices", headers=headers, params={
    "status": "outstanding",
    "pageSize": 100
})
invoices = r.json()["data"]

# Create invoice
invoice = {
    "customerCode": "C001",
    "date": "2024-01-15",
    "lines": [
        {"itemCode": "ITEM001", "quantity": 5, "unitPrice": 100.00}
    ]
}
r = requests.post(f"{url}/api/v1/invoices", headers=headers, json=invoice)
```

## Reports
```python
# Aged debtors
r = requests.get(f"{url}/api/v1/reports/aged-debtors", headers=headers)

# Trial balance
r = requests.get(f"{url}/api/v1/reports/trial-balance", headers=headers, params={
    "fromDate": "2024-01-01", "toDate": "2024-12-31"
})
```

## Notes
- Date format: `YYYY-MM-DD`
- Currency amounts are in cents for some endpoints
- Pagination: `page` (1-based) + `pageSize` (default 20, max 100)
