# QuickBooks Online API Reference

## Authentication
- OAuth 2.0 Bearer token
- Use env vars: `QUICKBOOKS_ACCESS_TOKEN`, `QUICKBOOKS_REALM_ID`, `QUICKBOOKS_URL`
- Base URL: `https://quickbooks.api.intuit.com` (production) or `https://sandbox-quickbooks.api.intuit.com`

## Core Endpoints
- **Query**: `GET /v3/company/{realmId}/query?query={SQL-like query}`
- **Read**: `GET /v3/company/{realmId}/{entity}/{id}`
- **Create**: `POST /v3/company/{realmId}/{entity}` body: JSON entity
- **Update**: `POST /v3/company/{realmId}/{entity}` body: JSON entity (with Id + SyncToken)
- **Delete**: `POST /v3/company/{realmId}/{entity}?operation=delete` body: `{"Id": "...", "SyncToken": "..."}`

## Query Language
SQL-like syntax: `SELECT * FROM Invoice WHERE Balance > '0' STARTPOSITION 1 MAXRESULTS 100`
- Operators: `=`, `IN`, `<`, `>`, `<=`, `>=`, `LIKE`
- Date format: `'2024-01-01'`
- Pagination: `STARTPOSITION` (1-based) + `MAXRESULTS` (max 1000)

## Common Entities
Invoice, Customer, Vendor, Item, Account, Payment, Bill, Estimate,
SalesReceipt, CreditMemo, JournalEntry, Purchase, PurchaseOrder,
Employee, Department, Class, TaxCode

## Python Pattern
```python
import requests, os

base = os.environ.get("QUICKBOOKS_URL", "https://quickbooks.api.intuit.com")
realm = os.environ["QUICKBOOKS_REALM_ID"]
headers = {
    "Authorization": f"Bearer {os.environ['QUICKBOOKS_ACCESS_TOKEN']}",
    "Accept": "application/json",
    "Content-Type": "application/json"
}

# Query unpaid invoices
query = "SELECT * FROM Invoice WHERE Balance > '0' MAXRESULTS 100"
r = requests.get(f"{base}/v3/company/{realm}/query", headers=headers, params={"query": query})
invoices = r.json().get("QueryResponse", {}).get("Invoice", [])

# Create an invoice
invoice = {
    "Line": [{
        "Amount": 100.00,
        "DetailType": "SalesItemLineDetail",
        "SalesItemLineDetail": {"ItemRef": {"value": "1"}}
    }],
    "CustomerRef": {"value": "1"}
}
r = requests.post(f"{base}/v3/company/{realm}/invoice", headers=headers, json=invoice)
```

## Reports
```python
# Profit and Loss
r = requests.get(f"{base}/v3/company/{realm}/reports/ProfitAndLoss",
    headers=headers, params={"start_date": "2024-01-01", "end_date": "2024-12-31"})

# Balance Sheet
r = requests.get(f"{base}/v3/company/{realm}/reports/BalanceSheet",
    headers=headers, params={"date": "2024-12-31"})
```
