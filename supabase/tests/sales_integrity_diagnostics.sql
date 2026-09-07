-- Read-only Sales integrity diagnostics. Do not auto-repair returned rows.
-- Run as an authorized tenant-scoped database role with an active tenant.

-- Negative or impossible invoice balances.
SELECT id, tenant_id, number, grand_total, amount_paid, balance_due, balance
FROM public.invoices
WHERE deleted_at IS NULL
  AND (grand_total < 0 OR amount_paid < 0 OR balance_due < 0 OR balance < 0 OR amount_paid > grand_total + 0.005);

-- Active allocations beyond payment or invoice balances.
SELECT pa.payment_id, pa.invoice_id, pa.amount,
       p.amount AS payment_amount,
       i.grand_total AS invoice_total,
       COALESCE((SELECT SUM(x.amount) FROM public.payment_allocations x WHERE x.payment_id = pa.payment_id AND x.deleted_at IS NULL), 0) AS payment_allocated,
       COALESCE((SELECT SUM(x.amount) FROM public.payment_allocations x WHERE x.invoice_id = pa.invoice_id AND x.deleted_at IS NULL), 0) AS invoice_allocated
FROM public.payment_allocations pa
JOIN public.payments_received p ON p.id = pa.payment_id
JOIN public.invoices i ON i.id = pa.invoice_id
WHERE pa.deleted_at IS NULL
  AND (pa.amount <= 0
    OR (SELECT SUM(x.amount) FROM public.payment_allocations x WHERE x.payment_id = pa.payment_id AND x.deleted_at IS NULL) > p.amount + 0.005
    OR (SELECT SUM(x.amount) FROM public.payment_allocations x WHERE x.invoice_id = pa.invoice_id AND x.deleted_at IS NULL) > i.grand_total + 0.005);

-- Cross-customer or cross-currency allocations.
SELECT pa.id, pa.payment_id, pa.invoice_id, p.customer_id AS payment_customer,
       i.customer_id AS invoice_customer, p.currency AS payment_currency, i.currency AS invoice_currency
FROM public.payment_allocations pa
JOIN public.payments_received p ON p.id = pa.payment_id
JOIN public.invoices i ON i.id = pa.invoice_id
WHERE pa.deleted_at IS NULL
  AND (p.customer_id IS DISTINCT FROM i.customer_id OR upper(p.currency) IS DISTINCT FROM upper(i.currency));

-- Orphaned source references.
SELECT so.id AS order_id, so.source_quote_id
FROM public.sales_orders so
LEFT JOIN public.sales_quotes q ON q.id = so.source_quote_id
WHERE so.deleted_at IS NULL AND so.source_quote_id IS NOT NULL AND q.id IS NULL
UNION ALL
SELECT i.id AS invoice_id, i.source_order_id
FROM public.invoices i
LEFT JOIN public.sales_orders so ON so.id = i.source_order_id
WHERE i.deleted_at IS NULL AND i.source_order_id IS NOT NULL AND so.id IS NULL;

-- Duplicate active quote conversions.
SELECT source_quote_id, COUNT(*) AS order_count, array_agg(id) AS order_ids
FROM public.sales_orders
WHERE deleted_at IS NULL AND source_quote_id IS NOT NULL
GROUP BY source_quote_id
HAVING COUNT(*) > 1;

-- Invoice quantities exceeding Sales Order quantities by item/description matching.
SELECT inv.source_order_id, COALESCE(il.item_id::text, il.description) AS line_key,
       SUM(il.quantity) AS invoiced_quantity, MAX(sol.quantity) AS ordered_quantity
FROM public.invoices inv
JOIN public.invoice_lines il ON il.document_id = inv.id AND il.deleted_at IS NULL
JOIN public.sales_order_lines sol ON sol.document_id = inv.source_order_id
  AND sol.deleted_at IS NULL
  AND ((il.item_id IS NOT NULL AND sol.item_id = il.item_id)
    OR (il.item_id IS NULL AND sol.description = il.description))
WHERE inv.deleted_at IS NULL AND inv.source_order_id IS NOT NULL
  AND COALESCE(inv.status, '') NOT IN ('Cancelled', 'Voided')
GROUP BY inv.source_order_id, COALESCE(il.item_id::text, il.description)
HAVING SUM(il.quantity) > MAX(sol.quantity) + 0.000001;
