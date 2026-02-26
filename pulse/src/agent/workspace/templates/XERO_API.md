# Xero Accounting API Reference

## Authentication
- OAuth 2.0 Bearer token
- Use env vars: `XERO_ACCESS_TOKEN`, `XERO_TENANT_ID`, `XERO_URL`
- Base URL: `https://api.xero.com/api.xro/2.0`

## Required Headers
```
Authorization: Bearer {access_token}
Xero-Tenant-Id: {tenant_id}
Content-Type: application/json
Accept: application/json
```

## Core Endpoints
- **List**: `GET {url}/{resource}?page=1&where={filter}`
- **Get**: `GET {url}/{resource}/{id}`
- **Create**: `POST {url}/{resource}` body: JSON
- **Update**: `POST {url}/{resource}/{id}` body: JSON
- **Delete**: `DELETE {url}/{resource}/{id}` (limited support)

## Common Resources
Invoices, Contacts, Accounts, Payments, CreditNotes, BankTransactions,
PurchaseOrders, Quotes, Items, ManualJournals, Employees, TaxRates,
TrackingCategories, Currencies, Organisations

## Where Filters
URL-encoded: `Status=="AUTHORISED"`, `Type=="ACCREC"`, `AmountDue>0`
Operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `StartsWith`, `EndsWith`, `Contains`

## Python Pattern
```python
import requests, os

url = os.environ.get("XERO_URL", "https://api.xero.com/api.xro/2.0")
headers = {
    "Authorization": f"Bearer {os.environ['XERO_ACCESS_TOKEN']}",
    "Xero-Tenant-Id": os.environ["XERO_TENANT_ID"],
    "Accept": "application/json",
    "Content-Type": "application/json"
}

# List unpaid invoices
r = requests.get(f"{url}/Invoices", headers=headers, params={
    "where": 'Status=="AUTHORISED" AND AmountDue>0',
    "page": 1
})
invoices = r.json()["Invoices"]

# Create an invoice
invoice = {
    "Type": "ACCREC",
    "Contact": {"ContactID": "..."},
    "LineItems": [{
        "Description": "Consulting Services",
        "Quantity": 10,
        "UnitAmount": 150.00,
        "AccountCode": "200"
    }],
    "Date": "2024-01-15",
    "DueDate": "2024-02-15"
}
r = requests.post(f"{url}/Invoices", headers=headers, json=invoice)
```

## Reports
```python
# Profit and Loss
r = requests.get(f"{url}/Reports/ProfitAndLoss", headers=headers, params={
    "fromDate": "2024-01-01", "toDate": "2024-12-31"
})

# Balance Sheet
r = requests.get(f"{url}/Reports/BalanceSheet", headers=headers, params={
    "date": "2024-12-31"
})

# Aged Receivables
r = requests.get(f"{url}/Reports/AgedReceivablesByContact", headers=headers)
```

## Pagination
- Max 100 records per page
- Use `page` parameter (1-based)
- Check response for presence of records to determine if more pages exist
