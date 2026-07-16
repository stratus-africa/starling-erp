
Scope is large, so I'll ship it in phases. This plan covers Phase 1 (this turn) and outlines Phases 2–4 (following turns).

## Phase 1 — Super Admin separation + Sales module end-to-end

### 1. Super Admin console at `/admin`

- New pathless layout `src/routes/_admin/route.tsx`
  - Gates on `has_role('super_admin')`; non-supers redirected to `/`.
  - Own shell: dark slate theme, "Platform Console" branding, distinct sidebar and topbar so it's visually unambiguous you're outside a tenant.
  - Tenant switcher stays here (super admins impersonate from the console).
- Move existing routes:
  - `super-admin.tenants` → `_admin/tenants`
  - `super-admin.users` → `_admin/users`
  - `super-admin.plans` → `_admin/plans`
  - `super-admin.audit` → `_admin/audit`
  - `super-admin.settings` → `_admin/settings`
- Remove the "Super Admin" group from the tenant `AppSidebar` entirely. Tenant users no longer see platform controls.
- Add an "Open Platform Console" chip in the tenant topbar visible only to super admins.

### 2. Sales documents with line items

Schema additions (one migration):

- `sales_quote_lines`, `sales_order_lines`, `invoice_lines` — each: `id`, `tenant_id`, `document_id` (FK), `line_no`, `item_id`, `description`, `quantity`, `unit_price`, `discount_pct`, `tax_pct`, `line_total`, timestamps, soft-delete.
- Extend `sales_quotes` / `sales_orders` / `invoices` with `subtotal`, `tax_total`, `discount_total`, `grand_total`, `notes`, `currency`, and workflow status enums.
- `stock_movements` table — item, warehouse, qty, direction, ref_type, ref_id (used by inventory posting later).
- `payment_applications` — links `payments_received` to invoices (amount applied per invoice, supports partials).
- Postgres RPCs, all `SECURITY DEFINER`, tenant-scoped:
  - `post_invoice(invoice_id)` — sets status = posted, generates AR + Revenue journal entries in `journal_entries`, decrements stock via `stock_movements` for stocked items, blocks re-post.
  - `apply_payment(payment_id, allocations jsonb)` — inserts `payment_applications`, updates invoice `amount_paid` / `balance_due`, generates Cash + AR journal entries.
  - `convert_quote_to_order(quote_id)` — copies lines, links back.
  - `convert_order_to_invoice(order_id)` — copies lines, links back.
- Grants + RLS on every new table (tenant-scoped, `tenant_write_ok` for writes).

### 3. Document editor UI

New reusable `DocumentEditor` component (replaces DataModulePage for documents):

- Header form (customer, dates, currency, terms, reference)
- Line-item grid with add/remove, item picker (autocomplete from `items`), auto-fill price, live per-line totals
- Footer with subtotal / discount / tax / grand total
- Status pill and action bar: Save Draft, Send, Convert to Order, Convert to Invoice, Post, Record Payment
- Wired to server-function RPCs above via TanStack Query mutations
- Works for Quotes, Orders, Invoices with the same shell + config

Routes updated: `sales.quotes`, `sales.orders`, `sales.invoices`, `sales.payments` — list view stays DataModulePage; row click opens the DocumentEditor at `sales.quotes.$id`, `sales.orders.$id`, `sales.invoices.$id`.

### 4. Payments

- `sales.payments` list stays as-is
- New `RecordPaymentDialog` opened from an invoice — pick amount, method, bank account, calls `apply_payment` RPC
- Invoice list shows balance_due + paid badge

## Phase 2 (next turn) — Purchasing mirror

Same pattern: `purchase_order_lines`, `bill_lines`, `receive_purchase_order` (stock in + AP journal), `bill_from_po`, `apply_payment_made`. DocumentEditor reused.

## Phase 3 — Inventory + Manufacturing posting

- Stock movements drive on-hand levels; adjustments and transfers produce movements
- BOMs get component lines; production orders consume components and receive finished goods via stock movements + WIP journal entries

## Phase 4 — Accounting close-out

- Journals list shows entries produced by all posting RPCs
- Trial Balance / P&L / Balance Sheet reports read from `journal_entries`
- Bank reconciliation UI against `bank_accounts` and payment tables

## Technical notes

- All posting logic lives in Postgres RPCs so multi-tenant integrity is enforced by RLS, not client code.
- Journal entries follow double-entry: each posting RPC inserts balanced debit/credit rows; a check trigger rejects unbalanced sets.
- `stock_movements` is append-only; on-hand is a sum, no destructive updates.
- Chart of accounts codes referenced by posting RPCs (1100 AR, 1000 Cash, 1200 Inventory, 4000 Revenue, 5000 COGS, 2000 AP) already seeded by `handle_new_user`.
- Route file layout stays flat-dot: `_admin.tenants.tsx`, `_authenticated.sales.quotes.$id.tsx`, etc.
- Tenant `AppSidebar` will drop the `super-admin.*` group; a new `AdminSidebar` renders inside `_admin/route.tsx`.

I'll execute Phase 1 as soon as you approve. Phases 2–4 follow in subsequent turns to keep each change reviewable.
