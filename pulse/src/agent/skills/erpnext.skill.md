---
name: erpnext
description: Read and post ERPNext / Frappe documents (invoices, journal entries, payments, customers, items, reports) through the erpnext_* tools. Use for any accounting, sales, purchasing or stock question against ERPNext.
requires: erpnext_list, erpnext_get, erpnext_create, erpnext_update, erpnext_method, erpnext_report
---

# ERPNext

## Tools
- **erpnext_list** — list/search documents with filters and fields
- **erpnext_get** — one full document, including child tables
- **erpnext_create** — new document (saved as **Draft**)
- **erpnext_update** — change fields on a **draft** document
- **erpnext_method** — `frappe.client.submit` / `cancel` / `amend`, balances, counts
- **erpnext_report** — run a saved report (General Ledger, Trial Balance, Accounts Receivable…)
- **erpnext_delete** — delete a draft (submitted documents are cancelled, never deleted)

## Facts that are not guessable — read before querying
- **Draft / Submitted / Cancelled is `docstatus` 0 / 1 / 2 on every doctype.** Filter with
  `[["docstatus","=","0"]]`. Journal Entry, Payment Entry, Stock Entry have **no `status` column**;
  querying it fails with "Field not permitted in query". Only some doctypes (Sales Invoice, Sales
  Order, Purchase Invoice…) have a `status` with workflow values like Unpaid, Paid, Overdue, To Deliver.
- **Field names are snake_case internal names, not labels.** Posting date is `posting_date`,
  the JE total is `total_debit`, the party is `customer` / `supplier`, the remark is `user_remark`
  (Journal Entry) or `remarks` (Payment Entry). If a field is rejected, the error lists the
  valid fields — use one of those, do not retry the same name.
- **Amounts on Journal Entry rows go in `debit_in_account_currency` /
  `credit_in_account_currency`.** Plain `debit` / `credit` are read-only and recomputed.
  One row is either debit or credit, never both, never both zero.
- **Child tables travel inside the parent.** Journal Entry rows are `accounts: [...]`, invoice
  lines are `items: [...]`. There is no separate create/list for "Journal Entry Account" — 403.
- **Account names carry the company suffix**, e.g. `Utility Expenses - MC`. When unsure, list
  `Account` with `[["account_name","like","%Utility%"]]` and use the returned `name` exactly.
- **Dates are `YYYY-MM-DD`.** `posting_date` must fall in an open fiscal year / period.
- **A Journal Entry must balance** (total debit = total credit) to be submitted. ERPNext will
  accept an unbalanced *draft* over the API — never leave one behind.
- Companies with `multi_currency` off reject a foreign-currency row: convert first and post in
  company currency, quoting the original amount and rate in `user_remark`.

## Reading
1. Start narrow: `erpnext_list` with `fields` you need and `limit_page_length` ≤ 50.
2. Open one record with `erpnext_get` when child rows matter (invoice lines, JE accounts).
3. For totals and balances prefer `erpnext_report` or `erpnext_method`
   (`erpnext.accounts.utils.get_balance_on`) over summing rows yourself.
4. Sort explicitly: `order_by: "posting_date desc"`.

## Posting
1. Look up the exact account / party / item names first (never invent a suffix).
2. `erpnext_create` — it lands as a **draft**. Report the returned `name` (e.g. `ACC-JV-2026-00021`).
3. Verify with `erpnext_get` that the totals are what you intended.
4. **Submit only when the user has asked for it** (`frappe.client.submit`). Draft is reversible;
   submitted is a ledger posting.
5. Fixing a mistake: draft → `erpnext_update` or `erpnext_delete`; submitted → `frappe.client.cancel`
   then `frappe.client.amend` (or a fresh entry). Cancelling a submitted document is consequential —
   confirm with the user first.

## When a call fails
- Read the message. `Field not permitted` → wrong field name, pick from the list returned.
  `Both Debit and Credit values cannot be zero` → amounts went in the wrong field.
  `403` → the API user lacks permission for that doctype or you hit a child table directly.
  `417` with a `_server_messages` text → a validation rule; the text says which.
- Change something before retrying. Never re-send an identical failed request.
- Tell the user exactly what was and was not posted, with document names. Do not claim a
  posting succeeded unless the tool returned the document.
