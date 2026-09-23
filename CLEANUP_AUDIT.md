# Cleanup Audit

This file is the source of truth for component cleanup decisions in this workspace. Only files with zero repo references and no active replacement were removed.

## Confirmed unused and deleted

- [src/components/customer-editor.tsx](src/components/customer-editor.tsx) — no imports, dynamic imports, route references, barrel exports, config usage, or server-side dependencies found.
- [src/components/invoices-list-page.tsx](src/components/invoices-list-page.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/manual-journals-page.tsx](src/components/manual-journals-page.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/orders-list-page.tsx](src/components/orders-list-page.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/production-item-page.tsx](src/components/production-item-page.tsx) — no imports, dynamic imports, route references, or barrel usage found. Replacement retained: [src/components/item360-page.tsx](src/components/item360-page.tsx).
- [src/components/purchase-document-lineage.tsx](src/components/purchase-document-lineage.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/purchase-next-action.tsx](src/components/purchase-next-action.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/sales-overview-report-page.tsx](src/components/sales-overview-report-page.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/supplier-bill-detail-page.tsx](src/components/supplier-bill-detail-page.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/supplier-bill-list-page.tsx](src/components/supplier-bill-list-page.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/supplier-editor.tsx](src/components/supplier-editor.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/supplier-payment-allocation-table.tsx](src/components/supplier-payment-allocation-table.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/supplier-payment-dialog.tsx](src/components/supplier-payment-dialog.tsx) — no imports, dynamic imports, route references, or barrel usage found.
- [src/components/super-admin/page-stub.tsx](src/components/super-admin/page-stub.tsx) — placeholder "coming soon" component for unbuilt super-admin pages; every super-admin route now has a real implementation, and `PageStub` had no imports, dynamic imports, or route references anywhere in the repo.

## Intentionally retained

- [src/components/item360-page.tsx](src/components/item360-page.tsx) — retained as the active replacement for the older ProductionItemPage workflow; routes for inventory and manufacturing items import Item360Page directly.

## Validation notes

- Full repo text scans returned no import strings, dynamic import strings, route references, or barrel export references for the deleted files.
- No database files, route files, or generated files were removed.
- The delete set is limited to confirmed-unused UI components only.
