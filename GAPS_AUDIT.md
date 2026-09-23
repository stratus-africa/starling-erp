# Gaps Audit — missing backend actions, unreachable pages, broken buttons

Audit taken 23 Sep 2026 against the live database function list (`pg_proc`, schema `public`), the route files under `src/routes`, and every `db.rpc(...)` call site in `src`.

Method: 179 distinct backend action names are called from the front end; each was checked for existence in the database. Route files were compared against every `to=` / `url:` / `href` link in the app (menu, hubs, breadcrumbs).

**Status: section A is RESOLVED** (migrations `0017`–`0019`). All 12 actions now exist with tenant scoping, permission checks, status-transition validation and plain-language error messages; the four platform observability tables they read (`platform_system_health`, `platform_error_logs`, `platform_background_jobs`, `platform_api_metrics`) were created with grants and platform-admin-only policies. Sections B and C are unchanged and still open.

---

## A. Missing backend actions — RESOLVED

12 of the 179 called actions had no matching database function; every call returned `404 / PGRST202`. The table below is the original finding, kept as the record of what was fixed.

| Action | Route | Calling component | Observed behavior |
|---|---|---|---|
| `transition_quote` | `/sales/quotes/$id` | `src/components/quote-view-page.tsx:350` (`setStatus` mutation) | Changing a quote's status (Draft → Sent → Accepted / Rejected / Expired) fails. The mutation throws, the error toast shows the PostgREST message, the quote stays on its old status. No timeline entry written. |
| `transition_sales_order` | `/sales/orders/$id` | `src/components/sales-order-view-page.tsx:593` (`setStatus` mutation) | Same: no sales order status can be advanced from the order page (Confirm, Processing, Closed, etc.). Error toast, status unchanged. |
| `archive_bom` | `/manufacturing/bom/$id` | `src/routes/_authenticated/manufacturing.bom.$id.tsx:491` | Archive button on a bill of materials fails; the BOM stays active. Call is cast with `(db as any)`, so the build never caught it. |
| `check_reservation_integrity` | `/inventory/items/$id` and stock tool panels | `src/components/inventory-stock-tools.tsx:79` | The reservation-integrity check reports an error instead of a result; the other two checks on the same panel work. |
| `admin_get_system_health` | `/super-admin/system`, `/super-admin/monitoring/health` | `src/lib/observability.ts:139` | Degrades silently: logs a console warning and falls back to reading tables directly, so the page renders but not from the intended source. |
| `admin_list_error_logs` | `/super-admin/errors`, `/super-admin/monitoring/errors` | `src/lib/observability.ts:254` | Same fallback path — list renders from a direct table read; server-side filtering/aggregation is not applied. |
| `admin_list_background_jobs` | `/super-admin/jobs`, `/super-admin/monitoring/jobs` | `src/lib/observability.ts:323` | Same fallback. |
| `admin_get_api_monitoring_metrics` | `/super-admin/api`, `/super-admin/monitoring/api` | `src/lib/observability.ts:396` | Same fallback. |
| `admin_ping_system_component` | `/super-admin/system` | `src/lib/observability.ts:228` | No fallback. The per-component "Ping" button always fails. |
| `admin_resolve_error_log` | `/super-admin/errors` | `src/lib/observability.ts:298` | No fallback. "Resolve" on an error row always fails; the row stays open. |
| `admin_retry_background_job` | `/super-admin/jobs` | `src/lib/observability.ts:360` | No fallback. "Retry" on a failed job always fails. |
| `admin_cancel_background_job` | `/super-admin/jobs` | `src/lib/observability.ts:377` | No fallback. "Cancel" on a running job always fails. |

Related note: the database does have `convert_quote_to_order`, `refresh_sales_order_status`, `transition_package`, `transition_purchase_order`, `transition_purchase_requisition`, `transition_sales_fulfillment`, `transition_supplier_bill`, `transition_supplier_payment` and `transition_expense` — the quote and sales order status machines are the only two in that family with no server-side counterpart.

Contributing cause: 12 files call the database through the loose helper `src/lib/typed-db.ts` (`db.rpc`) or `(db as any).rpc`, which accepts any action name. `bunx tsgo --noEmit` passes with all 12 missing actions in place.

---

## B. Unreachable pages (route exists, nothing links to it)

These routes resolve if the URL is typed, but no menu item, hub tile, breadcrumb or in-page link points at them.

| Route | Route file / component | Observed behavior |
|---|---|---|
| `/accounting/transactions` | `accounting.transactions.tsx` → `accounting-ledger-page.tsx` | The full accounting ledger (Transactions / Chart of Accounts / Cash & Profit) is complete but absent from the Accounting menu and the Settings hub. |
| `/purchasing/dashboard` | `purchasing.dashboard.tsx` → `supplier-dashboard.tsx` | Supplier dashboard (open bills, orders, payments, credit balance, Apply Credit) has no entry in the Purchasing menu. |
| `/dashboards/purchases` | `dashboards.purchases.tsx` → `purchases-dashboard-page.tsx` | A second purchasing dashboard, orphaned. The Overview menu links `/dashboards/procurement` instead. Two dashboards now cover the same ground. |
| `/expenses`, `/expenses/approvals`, `/expenses/reimbursements`, `/expenses/$id` | `expenses.*.tsx` | The whole employee-expense workflow is unlinked. The menu only exposes `/purchasing/expenses`, which is a different page over the same data. |
| `/audit-events` | `audit-events.tsx` | Business-event/audit feed with no entry point. |
| `/manufacturing/orders/new` | `manufacturing.orders.new.tsx` | Reachable only if a component navigates there; no menu or list-page button links to it. |
| `/reports/expenses/categories`, `/departments`, `/employees`, `/reimbursements` | `reports.expenses.*.tsx` | The expenses report hub (`/reports/expenses`) lists no tiles for these four, so the sub-reports cannot be opened from the UI. Compare the sales and purchases hubs, which do list theirs. |
| `/reports/expenses` (hub itself) | `reports.expenses.index.tsx` | Not present in the Reports menu (`src/lib/nav.ts` lists financial, sales, purchases, inventory, manufacturing only). |
| `/super-admin/billing` | `super-admin/billing/index.tsx` | Billing overview not in the platform sidebar; only `/super-admin/billing/plans` is linked. |

### Duplicate / shadow entry points

- **Two complete admin consoles.** `src/routes/_admin/` (`/tenants`, `/users`, `/plans`, `/audit`, `/settings`, sidebar `admin-sidebar.tsx`) runs in parallel with the current `src/routes/super-admin/` console. The old one is invisible in navigation but live and guarded by the same `admin_ping` platform-admin check, so a platform admin who types `/tenants` lands in the legacy console. Its pages are a different, older implementation of the same functions.
- **Alias routes inside the platform console.** `/super-admin/plans` → `billing/plans`, `/super-admin/features` → `platform/features`, `/super-admin/api|errors|jobs|system` → `monitoring/*`, `/super-admin/audit` → redirect to `security/audit`. Each target is reachable at two URLs; only one is in the sidebar, so deep links and breadcrumbs can disagree.
- **Flat-route naming.** `/inventory/stock-audit` and `/inventory/bin-usage` are served by `inventory_.stock-audit.tsx` / `inventory_.bin-usage.tsx`. The URLs are correct; the trailing-underscore form only opts out of the inventory layout, so these pages render without the shared inventory chrome.

---

## C. Broken / inert buttons

### C1. The five placeholder Settings pages

`/settings/api-keys`, `/settings/currencies`, `/settings/notifications`, `/settings/numbering`, `/settings/payment-terms` each render `ModulePage` with a hardcoded `rows` array from `src/lib/modules.tsx` (lines 543–678). They look like working tables but hold invented sample data (for example "Zapier Integration / sk_live_a2f9…", "USD 129.4200", "Invoice prefix INV-{YYYY}- next 1189").

Every control on `src/components/module-page.tsx` is rendered without a handler:

| Control | Observed behavior |
|---|---|
| `Import` | Nothing happens on click. |
| `Export` | Nothing happens on click. |
| Primary action (`Generate Key`, `Add Currency`, `New Rule`, `New Series`, `New Term`) | Nothing happens on click. |
| `Filters` | Nothing happens on click. |
| Search box | Typing does not filter; the row count stays fixed. |
| Row `⋯` menu (Print / Email / etc.) | Items render but perform no action. |

The same inert component also backs `/settings/taxes`, `/settings/templates`, `/settings/workflows`, `/settings/users`, `/settings/roles`, `/settings/uom`, `/settings/warehouses` entries in `modules.tsx` — those routes have since been replaced by real pages for some paths, but the sample rows remain in the file and are still served wherever `ModulePage` is used.

### C2. Buttons whose backend action is missing

Every row in section A with "no fallback" is a button that always fails: Ping component, Resolve error, Retry job, Cancel job (platform console), Archive BOM, quote status control, sales order status control, and the reservation-integrity check.

### C3. Hub tile pointing at a non-existent page

`src/components/reports-configs.tsx:338` — the Inventory Reports tile **"Stock on Hand"** links to `/inventory/locations`. No route file exists for that path; clicking the tile lands on the not-found page. (All other links in the app resolve, including the flat inventory routes.)

---

## D. Notes for prioritising

1. **Highest impact:** `transition_quote` and `transition_sales_order` — two core sales documents cannot change status from their own pages.
2. **Visible-but-fake:** the five Settings pages; they read as finished features and silently save nothing.
3. **Access risk:** the legacy `_admin` console duplicating platform administration.
4. **Discoverability:** five finished pages (accounting ledger, supplier dashboard, expenses workflow, expense sub-reports, audit events) that users cannot find.
5. **Type safety:** the loose `db.rpc` helper is what let all 12 missing actions ship without a build failure.

Not covered by this pass: a column-by-column check of table/field names used in direct queries, and a click-through of every listed gap in the browser.
