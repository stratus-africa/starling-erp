# Supabase Schema Order

The migration directory is the forward history. Filenames are applied lexically by Supabase. The deployed schema remains authoritative when an older migration and a later repair disagree; later migrations must be additive or explicitly replace the deployed function body.

## Dependency layers

1. **Deployed baseline**: `tenants`, `profiles`, `user_roles`, core sales/procurement documents, `items`, `warehouses`, `bom_headers`, inventory tables, and the original audit tables. `bom_headers` is a deployed prerequisite referenced by the first migration but not created in this directory.
2. **Security and shared helpers**: permissions, tenant helpers, audit/event helpers, notifications, and tenant features.
3. **Accounting core**: chart of accounts, journal entries/lines, periods, banking, tax, posting configuration, and integrity checks.
4. **Inventory and manufacturing**: item master, UOM/location data, lot/serial traceability, BOM governance, production orders/entries, reservations, and costing.
5. **Platform administration**: platform roles, plans, feature flags, support sessions, security center, settings, sessions, and platform audit.
6. **Sales financial state**: payment allocations, payment/status state machines, atomic customer payment capture, reporting, and fulfillment.
7. **Procurement and expenses**: AP integrity, supplier payments, receiving/matching, supplier bills/credits, expenses/reimbursements, reports, dashboards, and delete guards.
8. **Contract validation**: `20260930100000_schema_contract_validation.sql` verifies tables, columns, RPC signatures, enum, indexes, RLS, and critical policies against the deployed schema.

## Authoritative RPC implementations

- `_emit_journal`: `20260828040000_accounting_periods.sql`; the single journal write chokepoint with period and balance checks.
- `post_invoice`, `post_bill`, `post_credit_note`, and payment/expense posting wrappers: `20260828020000_complete_transaction_posting_engine.sql`, with later configuration and tax migrations providing the deployed final bodies for unchecked posting functions.
- `post_manual_journal`: `20260916000000_banking_period_authorization_hardening.sql`.
- `create_and_post_customer_payment`: `20260915000000_atomic_customer_payment_capture.sql`.
- `get_sales_overview`: `20260916010000_fix_sales_overview_payment_status.sql`.
- `create_supplier_payment`, `post_payment_made_unchecked`, and `post_supplier_payment`: `20260922000000_supplier_payment_engine_phase2.sql`.
- `record_production_run`: `20260908030000_production_performance_tracking.sql`.
- `has_platform_permission`: `20260910000000_fix_platform_permission_overload.sql`.
- `list_tenant_users` and `admin_set_tenant_user_roles`: `20260907500000_admin_tenant_user_management_suite.sql`.
- `platform_audit`: `20260907950000_super_admin_platform_audit_log_system.sql`.

## Review command

Run `npm run db:audit`. It reports intentional function replacements, duplicate table/type declarations, same-timestamp migration files, destructive enum changes, and unguarded trigger disabling. It exits non-zero for duplicate table/type declarations.
