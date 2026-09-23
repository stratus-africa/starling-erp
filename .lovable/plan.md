# Mobile Field Sales App

A phone-first section of the existing app at `/field`, using the same sign-in, workspace, permissions, customers, quotes, orders, invoices, payments and accounting engine. No separate database, ledger or login.

## Audit findings (what gets reused)
- Sign-in, workspace switching, `can()` permission checks and `hasFeature()` module checks already exist.
- Roles live in a fixed role list; permissions use the `module.action` style (`crm.read`, `sales.create`, `payments.create`) and are editable per workspace on the Roles page.
- Customers, quotes, sales orders, invoices, payments received and multi-invoice allocation (`allocate_customer_payment`) already exist, with posting handled by the accounting engine.
- The CRM module toggle exists, but **there is no leads table** — one has to be added (the only new business table).
- Audit logging and notifications tables already exist.

## Phases (built in this order)
1. **Foundation** — new `field_sales` role with default grants; `/field` layout with header (name, company, avatar, bell), bottom nav (Home, Customers, Sales, Payments, More), dashboard with 4 summary cards, quick actions, recent activity.
2. **Customers** — searchable/filterable list with balances, detail page (summary, Quotes/Orders/Invoices/Payments tabs, Call/Email/Edit/Quote/Order/Payment actions), create/edit form with duplicate warning (name, phone, email, PIN).
3. **Leads** (only when CRM is on) — list, detail, create/edit, convert to customer. Database blocks lead access when CRM is off.
4. **Quotes** and 5. **Sales Orders** — list, detail, 4-step create wizard (customer → items → details → review), Save Draft / Create, edit drafts only. Status changes use the existing transition actions; no postings.
6. **Payments** — list; wizard: pick customer → see open invoices and balance → amount, method, deposit account (existing accounts only), reference → allocate across invoices with live Payment / Allocated / Unallocated totals; invalid allocations block submit. Uses the existing payment and allocation actions.
7. **Offline** — drafts saved on the device, pending queue with Saved Offline / Pending Sync / Synced / Sync Failed badges, automatic retry when back online, offline banner. Payments count as recorded only after the server confirms.
8. **Security & testing** — type check, then browser walk-through on a phone-sized screen as a Field Sales user: create customer, lead, quote, order, multi-invoice payment; confirm CRM hidden and blocked when off; confirm accounting/purchases/settings pages are refused.

## Technical details
- Migration: add `field_sales` to `app_role`; seed `role_permissions` for it (crm.read/create/update, sales.read/create/update, payments.read/create/update, invoice read only); create `crm_leads` (tenant_id, name, company, phone, email, source, status, assigned_to, notes, converted_customer_id, timestamps) with GRANTs, RLS using tenant match + `has_permission('crm.*')` + `can_tenant_use_feature('crm')`; audit trigger; notify on lead assignment.
- Add a RESTRICTIVE module check on customers/quotes/orders/payments policies only if missing (verify first).
- Routes under `src/routes/_authenticated/field.*`; components in `src/components/field/`. Desktop routes untouched; desktop sidebar gets a "Field Sales" link.
- Money handled as integer minor units in the UI; `inputMode="decimal"` on amount fields; currency decimals from tenant currency.
- Offline queue in IndexedDB-backed local storage with idempotency keys to avoid duplicate records on retry.
- Roles page shows the new role column automatically (built from live data).

## Open question
Leads need one new table since none exists — this is the only new business structure.
