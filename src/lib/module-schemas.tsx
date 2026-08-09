import type { FieldDef } from "@/components/data-module-page";

export const money = (v: any) => v == null ? "—" : "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const mono = (v: any) => v == null ? "—" : <span className="font-mono text-xs">{v}</span>;
export const monoRight = (v: any) => v == null ? "—" : <span className="font-mono tabular-nums">{v}</span>;
export const moneyRight = (v: any) => v == null ? "—" : <span className="font-mono tabular-nums">{money(v)}</span>;
export const bold = (v: any) => <span className="font-medium text-foreground">{v}</span>;
export const dateFmt = (v: any) => !v ? "—" : new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

export const customerFields: FieldDef[] = [
  { key: "code", label: "Code", render: mono },
  { key: "name", label: "Customer", required: true, render: bold },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "currency", label: "Currency", type: "select", options: ["USD","EUR","GBP","KES","AED","EGP","INR","ZAR"], defaultValue: "USD" },
  { key: "credit_limit", label: "Credit Limit", type: "number", className: "text-right", render: moneyRight },
  { key: "balance", label: "Balance", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Active","Inactive","Overdue"], defaultValue: "Active" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const supplierFields: FieldDef[] = [
  { key: "code", label: "Code", render: mono },
  { key: "name", label: "Supplier", required: true, render: bold },
  { key: "category", label: "Category" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email", hideInTable: true },
  { key: "currency", label: "Currency", type: "select", options: ["USD","EUR","GBP","KES","AED","EGP","INR","ZAR"], defaultValue: "USD" },
  { key: "balance", label: "Payable", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Active","Inactive"], defaultValue: "Active" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const warehouseFields: FieldDef[] = [
  { key: "code", label: "Code", render: mono },
  { key: "name", label: "Warehouse", required: true, render: bold },
  { key: "location", label: "Location" },
  { key: "status", label: "Status", type: "select", options: ["Active","Inactive"], defaultValue: "Active" },
];

export const itemFields: FieldDef[] = [
  { key: "sku", label: "SKU", render: mono },
  { key: "name", label: "Item", required: true, render: bold },
  { key: "type", label: "Type", type: "select", options: ["Finished Good","Raw Material","Sub-assembly","Service","Consumable"], defaultValue: "Finished Good" },
  { key: "uom", label: "UoM", type: "select", options: ["pc","kg","g","lb","m","cm","l","ml","box","pack"], defaultValue: "pc" },
  { key: "stock", label: "On Hand", type: "number", className: "text-right", render: monoRight },
  { key: "reorder", label: "Reorder", type: "number", className: "text-right", render: monoRight },
  { key: "cost", label: "Avg Cost", type: "number", className: "text-right", render: moneyRight },
  { key: "price", label: "Sell Price", type: "number", className: "text-right", render: moneyRight },
  { key: "description", label: "Description", type: "textarea", hideInTable: true },
];

export const salesQuoteFields: FieldDef[] = [
  { key: "number", label: "Quote #", render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "customer_id", label: "Customer", type: "fk", fkTable: "customers", required: true, hideInTable: true },
  { key: "expiry", label: "Valid Until", type: "date", render: dateFmt },
  { key: "amount", label: "Amount", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Draft","Sent","Accepted","Rejected","Expired"], defaultValue: "Draft" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const salesOrderFields: FieldDef[] = [
  { key: "number", label: "SO #", render: mono },
  { key: "date", label: "Order Date", type: "date", render: dateFmt },
  { key: "customer_id", label: "Customer", type: "fk", fkTable: "customers", required: true, hideInTable: true },
  { key: "items_count", label: "Items", type: "number", className: "text-right", render: monoRight },
  { key: "amount", label: "Amount", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Draft","Confirmed","Processing","Packed","Shipped","Delivered","Cancelled"], defaultValue: "Confirmed" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const invoiceFields: FieldDef[] = [
  { key: "number", label: "Invoice #", render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "customer_id", label: "Customer", type: "fk", fkTable: "customers", required: true, hideInTable: true },
  { key: "due_date", label: "Due", type: "date", render: dateFmt },
  { key: "amount", label: "Total", type: "number", className: "text-right", render: moneyRight },
  { key: "balance", label: "Balance", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Draft","Sent","Paid","Overdue","Cancelled"], defaultValue: "Draft" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const paymentReceivedFields: FieldDef[] = [
  { key: "number", label: "Receipt #", render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "customer_id", label: "Customer", type: "fk", fkTable: "customers", required: true, hideInTable: true },
  { key: "mode", label: "Mode", type: "select", options: ["Cash","Bank Transfer","Cheque","Credit Card","Mobile Money"], defaultValue: "Bank Transfer" },
  { key: "reference", label: "Reference" },
  { key: "amount", label: "Amount", type: "number", className: "text-right", render: moneyRight },
];

export const purchaseOrderFields: FieldDef[] = [
  { key: "number", label: "PO #", render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "supplier_id", label: "Supplier", type: "fk", fkTable: "suppliers", required: true, hideInTable: true },
  { key: "expected_date", label: "Expected", type: "date", render: dateFmt },
  { key: "amount", label: "Amount", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Draft","Confirmed","Processing","Delivered","Cancelled"], defaultValue: "Draft" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const billFields: FieldDef[] = [
  { key: "number", label: "Bill #", render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "supplier_id", label: "Supplier", type: "fk", fkTable: "suppliers", required: true, hideInTable: true },
  { key: "due_date", label: "Due", type: "date", render: dateFmt },
  { key: "amount", label: "Total", type: "number", className: "text-right", render: moneyRight },
  { key: "balance", label: "Balance", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Pending","Paid","Overdue","Cancelled"], defaultValue: "Pending" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const paymentMadeFields: FieldDef[] = [
  { key: "number", label: "Payment #", render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "supplier_id", label: "Supplier", type: "fk", fkTable: "suppliers", required: true, hideInTable: true },
  { key: "mode", label: "Mode", type: "select", options: ["Cash","Bank Transfer","Cheque","Credit Card"], defaultValue: "Bank Transfer" },
  { key: "amount", label: "Amount", type: "number", className: "text-right", render: moneyRight },
];

export const chartOfAccountFields: FieldDef[] = [
  { key: "code", label: "Code", render: mono },
  { key: "name", label: "Account", required: true, render: bold },
  { key: "type", label: "Type", type: "select", options: ["Asset","Liability","Equity","Income","Expense"], defaultValue: "Asset" },
  { key: "balance", label: "Balance", type: "number", className: "text-right", render: moneyRight },
];

export const bankAccountFields: FieldDef[] = [
  { key: "name", label: "Account", required: true, render: bold },
  { key: "bank", label: "Bank" },
  { key: "account_number", label: "Number", render: mono },
  { key: "currency", label: "Currency", type: "select", options: ["USD","EUR","GBP","KES","AED","EGP","INR","ZAR"], defaultValue: "USD" },
  { key: "balance", label: "Balance", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Active","Inactive"], defaultValue: "Active" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const journalEntryFields: FieldDef[] = [
  { key: "number", label: "Entry #", required: true, render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "memo", label: "Memo" },
  { key: "debit", label: "Debit", type: "number", className: "text-right", render: moneyRight },
  { key: "credit", label: "Credit", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Draft","Posted","Void"], defaultValue: "Draft" },
];

export const inventoryAdjustmentFields: FieldDef[] = [
  { key: "number", label: "Adj #", required: true, render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "item_id", label: "Item", type: "fk", fkTable: "items", required: true, hideInTable: true },
  { key: "warehouse_id", label: "Warehouse", type: "fk", fkTable: "warehouses", required: true, hideInTable: true },
  { key: "quantity", label: "Qty", type: "number", className: "text-right", render: monoRight },
  { key: "reason", label: "Reason" },
  { key: "status", label: "Status", type: "select", options: ["Draft","Posted","Void"], defaultValue: "Posted" },
];

export const inventoryTransferFields: FieldDef[] = [
  { key: "number", label: "Transfer #", required: true, render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "item_id", label: "Item", type: "fk", fkTable: "items", required: true, hideInTable: true },
  { key: "from_warehouse_id", label: "From", type: "fk", fkTable: "warehouses", required: true, hideInTable: true },
  { key: "to_warehouse_id", label: "To", type: "fk", fkTable: "warehouses", required: true, hideInTable: true },
  { key: "quantity", label: "Qty", type: "number", className: "text-right", render: monoRight },
  { key: "status", label: "Status", type: "select", options: ["Draft","In Transit","Completed","Cancelled"], defaultValue: "Draft" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const bomFields: FieldDef[] = [
  { key: "code", label: "BOM Code", required: true, render: mono },
  { key: "product_id", label: "Product", type: "fk", fkTable: "items", required: true, hideInTable: true },
  { key: "version", label: "Version" },
  { key: "yield_qty", label: "Yield", type: "number", className: "text-right", render: monoRight },
  { key: "status", label: "Status", type: "select", options: ["Active","Draft","Archived"], defaultValue: "Active" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const productionOrderFields: FieldDef[] = [
  { key: "number", label: "PO #", required: true, render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "bom_id", label: "BOM", type: "fk", fkTable: "bom_headers", fkLabel: "code", required: true, hideInTable: true },
  { key: "quantity", label: "Qty", type: "number", className: "text-right", render: monoRight },
  { key: "status", label: "Status", type: "select", options: ["Planned","In Progress","Completed","Cancelled"], defaultValue: "Planned" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const packageFields: FieldDef[] = [
  { key: "number", label: "Package #", render: mono },
  { key: "date", label: "Packed Date", type: "date", render: dateFmt },
  { key: "sales_order_id", label: "Sales Order", type: "fk", fkTable: "sales_orders", fkLabel: "number", hideInTable: true },
  { key: "customer_id", label: "Customer", type: "fk", fkTable: "customers", hideInTable: true },
  { key: "weight", label: "Weight (kg)", type: "number", className: "text-right", render: monoRight },
  { key: "carrier", label: "Carrier" },
  { key: "tracking", label: "Tracking", render: mono },
  { key: "status", label: "Status", type: "select", options: ["Draft","Packed","Shipped","Delivered","Cancelled"], defaultValue: "Draft" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const creditNoteFields: FieldDef[] = [
  { key: "number", label: "Credit Note #", render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "customer_id", label: "Customer", type: "fk", fkTable: "customers", required: true, hideInTable: true },
  { key: "invoice_id", label: "Against Invoice", type: "fk", fkTable: "invoices", fkLabel: "number", hideInTable: true },
  { key: "reason", label: "Reason" },
  { key: "grand_total", label: "Total", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Draft","Issued","Applied","Void"], defaultValue: "Draft" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const shipmentFields: FieldDef[] = [
  { key: "number", label: "Shipment #", render: mono },
  { key: "ship_date", label: "Ship Date", type: "date", render: dateFmt },
  { key: "package_id", label: "Package", type: "fk", fkTable: "packages", fkLabel: "number", hideInTable: true },
  { key: "sales_order_id", label: "Sales Order", type: "fk", fkTable: "sales_orders", fkLabel: "number", hideInTable: true },
  { key: "customer_id", label: "Customer", type: "fk", fkTable: "customers", hideInTable: true },
  { key: "carrier", label: "Carrier" },
  { key: "service_level", label: "Service" },
  { key: "tracking", label: "Tracking", render: mono },
  { key: "delivery_date", label: "Delivered", type: "date", render: dateFmt },
  { key: "cost", label: "Cost", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Draft","In Transit","Delivered","Cancelled"], defaultValue: "Draft" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];

export const requisitionFields: FieldDef[] = [
  { key: "number", label: "Requisition #", render: mono },
  { key: "date", label: "Date", type: "date", render: dateFmt },
  { key: "required_date", label: "Required By", type: "date", render: dateFmt },
  { key: "supplier_id", label: "Preferred Supplier", type: "fk", fkTable: "suppliers", hideInTable: true },
  { key: "department", label: "Department" },
  { key: "grand_total", label: "Est. Total", type: "number", className: "text-right", render: moneyRight },
  { key: "status", label: "Status", type: "select", options: ["Draft","Submitted","Approved","Rejected","Ordered","Cancelled"], defaultValue: "Draft" },
  { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
];
