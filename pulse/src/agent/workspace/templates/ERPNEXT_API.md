# ERPNext API Reference

## Authentication
- Header: `Authorization: token {api_key}:{api_secret}`
- Use env vars: `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET`, `ERPNEXT_URL`

## Core Endpoints
- **List**: `GET {url}/api/resource/{Doctype}?filters=[[field,op,value]]&fields=["f1","f2"]&limit_page_length=100`
- **Get**: `GET {url}/api/resource/{Doctype}/{name}`
- **Create**: `POST {url}/api/resource/{Doctype}` body: `{"field": "value"}`
- **Update**: `PUT {url}/api/resource/{Doctype}/{name}` body: `{"field": "value"}`
- **Delete**: `DELETE {url}/api/resource/{Doctype}/{name}`
- **Method call**: `POST {url}/api/method/{dotted.path}` body: `{args}`
- **Report**: `GET {url}/api/method/frappe.client.get_report_data?report_name=X`

## Filter Operators
`=`, `!=`, `like`, `not like`, `in`, `not in`, `>`, `<`, `>=`, `<=`, `between`, `is`, `is not`

## Common Doctypes
Sales Invoice, Purchase Invoice, Customer, Supplier, Item, Stock Entry,
Journal Entry, Payment Entry, Sales Order, Purchase Order, Employee,
Delivery Note, Purchase Receipt, Material Request, BOM, Work Order,
Quotation, Lead, Opportunity, Account, Cost Center, Project, Task

## Python Pattern
```python
import requests, os

url = os.environ["ERPNEXT_URL"]
headers = {
    "Authorization": f"token {os.environ['ERPNEXT_API_KEY']}:{os.environ['ERPNEXT_API_SECRET']}"
}

# List unpaid invoices
r = requests.get(f"{url}/api/resource/Sales Invoice", headers=headers, params={
    "filters": '[["outstanding_amount",">",0],["docstatus","=",1]]',
    "fields": '["name","customer","grand_total","outstanding_amount","posting_date"]',
    "limit_page_length": 100
})
invoices = r.json()["data"]

# Create a document
r = requests.post(f"{url}/api/resource/Customer", headers=headers, json={
    "customer_name": "New Customer",
    "customer_type": "Company"
})
```

## Pagination
Use `limit_start` (offset) and `limit_page_length` (page size). Default page size is 20.

## File Uploads
```python
files = {"file": open("report.pdf", "rb")}
r = requests.post(f"{url}/api/method/upload_file", headers=headers, files=files, data={
    "doctype": "Sales Invoice", "docname": "INV-001"
})
```
