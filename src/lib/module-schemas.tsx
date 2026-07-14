import type { FieldDef } from "@/components/data-module-page";

export const money = (v: any) => v == null ? "—" : "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const mono = (v: any) => v == null ? "—" : <span className="font-mono text-xs">{v}</span>;
export const monoRight = (v: any) => v == null ? "—" : <span className="font-mono tabular-nums">{v}</span>;
export const moneyRight = (v: any) => v == null ? "—" : <span className="font-mono tabular-nums">{money(v)}</span>;
export const bold = (v: any) => <span className="font-medium text-foreground">{v}</span>;
export const dateFmt = (v: any) => !v ? "—" : new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

// Per-module field configs
export const customerFields: FieldDef[] = [
  { key: "code", label: "Code", render: mono },
  { key: "name", label: "Customer", required: true, render: bold },
  { key: "email", label: "Email", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
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
