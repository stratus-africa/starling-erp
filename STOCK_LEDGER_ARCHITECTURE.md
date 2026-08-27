# Inventory Stock Ledger Architecture

`stock_movements` is the authoritative inventory ledger.

- `inventory_item_stock` derives current on-hand with `SUM(stock_movements.quantity)`.
- `inventory_warehouse_stock` derives warehouse-level on-hand.
- The old `trg_sync_item_stock` trigger is removed.
- `items.stock` is retained only as a controlled performance projection for backwards compatibility.
- `recalculate_item_stock_projection()` rebuilds that projection from the ledger.
- `check_inventory_stock_integrity()` compares the projection against the ledger.
- Inventory corrections should be represented by compensating stock movements rather than editing historical movements.
- New opening balances should be recorded as `opening_balance` movements through `set_item_opening_stock()`.
