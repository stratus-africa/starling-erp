import type { Column } from "@/components/module-page";

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: any) => <span className="font-mono tabular-nums">{v}</span>;
const bold = (v: any) => <span className="font-medium text-foreground">{v}</span>;

export interface ModuleSpec {
  title: string;
  description: string;
  primaryAction?: string;
  columns: Column[];
  rows: Record<string, any>[];
}

export const modules: Record<string, ModuleSpec> = {
  "crm.customers": {
    title: "Customers", description: "Manage customer accounts, contacts, and credit terms.", primaryAction: "New Customer",
    columns: [
      { key: "code", label: "Code", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "name", label: "Customer", render: bold },
      { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
      { key: "currency", label: "Currency" },
      { key: "credit", label: "Credit Limit", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "balance", label: "Balance", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { code: "CUS-0001", name: "Nairobi Traders Ltd", phone: "+254 700 111222", email: "billing@nairobitraders.co.ke", currency: "KES", credit: 500000, balance: 128400, status: "Active" },
      { code: "CUS-0002", name: "Blue Ocean Logistics", phone: "+971 4 555 0123", email: "ap@blueocean.ae", currency: "AED", credit: 250000, balance: 0, status: "Active" },
      { code: "CUS-0003", name: "Kilimanjaro Coffee Co.", phone: "+255 22 987 6543", email: "finance@kilicoffee.co.tz", currency: "USD", credit: 100000, balance: 42150, status: "Active" },
      { code: "CUS-0004", name: "Sahara Motors", phone: "+20 2 3344 5566", email: "orders@sahara-motors.eg", currency: "EGP", credit: 750000, balance: 611200, status: "Overdue" },
      { code: "CUS-0005", name: "Rift Valley Foods", phone: "+254 720 998877", email: "ap@rvfoods.co.ke", currency: "KES", credit: 150000, balance: 8450, status: "Active" },
    ],
  },
  "sales.quotes": {
    title: "Quotes", description: "Prepare and send price quotes to customers.", primaryAction: "New Quote",
    columns: [
      { key: "number", label: "Quote #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "customer", label: "Customer", render: bold },
      { key: "expiry", label: "Valid Until" },
      { key: "amount", label: "Amount", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "QT-2026-0142", date: "12 Jul 2026", customer: "Nairobi Traders Ltd", expiry: "26 Jul 2026", amount: 18450, status: "Sent" },
      { number: "QT-2026-0141", date: "11 Jul 2026", customer: "Kilimanjaro Coffee Co.", expiry: "25 Jul 2026", amount: 42800, status: "Accepted" },
      { number: "QT-2026-0140", date: "10 Jul 2026", customer: "Sahara Motors", expiry: "24 Jul 2026", amount: 210500, status: "Draft" },
      { number: "QT-2026-0139", date: "08 Jul 2026", customer: "Blue Ocean Logistics", expiry: "22 Jul 2026", amount: 9720, status: "Rejected" },
      { number: "QT-2026-0138", date: "05 Jul 2026", customer: "Rift Valley Foods", expiry: "19 Jul 2026", amount: 15300, status: "Expired" },
    ],
  },
  "sales.orders": {
    title: "Sales Orders", description: "Confirmed customer orders ready for fulfilment.", primaryAction: "New Sales Order",
    columns: [
      { key: "number", label: "SO #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Order Date" }, { key: "customer", label: "Customer", render: bold },
      { key: "items", label: "Items", className: "text-right", render: num },
      { key: "amount", label: "Amount", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "SO-2026-0341", date: "12 Jul", customer: "Kilimanjaro Coffee Co.", items: 12, amount: 42800, status: "Confirmed" },
      { number: "SO-2026-0340", date: "11 Jul", customer: "Nairobi Traders Ltd", items: 4, amount: 18450, status: "Processing" },
      { number: "SO-2026-0339", date: "10 Jul", customer: "Blue Ocean Logistics", items: 22, amount: 76400, status: "Packed" },
      { number: "SO-2026-0338", date: "09 Jul", customer: "Sahara Motors", items: 8, amount: 210500, status: "Shipped" },
      { number: "SO-2026-0337", date: "08 Jul", customer: "Rift Valley Foods", items: 6, amount: 15300, status: "Delivered" },
    ],
  },
  "sales.packages": {
    title: "Packages", description: "Pack items from sales orders for shipment.", primaryAction: "New Package",
    columns: [
      { key: "number", label: "Package #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "so", label: "Sales Order", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "customer", label: "Customer", render: bold },
      { key: "date", label: "Packed Date" },
      { key: "weight", label: "Weight", className: "text-right" },
      { key: "tracking", label: "Tracking" }, { key: "status", label: "Status" },
    ],
    rows: [
      { number: "PKG-00812", so: "SO-2026-0339", customer: "Blue Ocean Logistics", date: "12 Jul", weight: "18.4 kg", tracking: "DHL-9821-4432", status: "Delivered" },
      { number: "PKG-00811", so: "SO-2026-0338", customer: "Sahara Motors", date: "11 Jul", weight: "142 kg", tracking: "FDX-6612-9021", status: "In Transit" },
      { number: "PKG-00810", so: "SO-2026-0340", customer: "Nairobi Traders Ltd", date: "11 Jul", weight: "6.8 kg", tracking: "—", status: "Pending" },
    ],
  },
  "sales.shipments": {
    title: "Shipments", description: "Track dispatched shipments to delivery.", primaryAction: "New Shipment",
    columns: [
      { key: "number", label: "Shipment #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "transporter", label: "Transporter" }, { key: "vehicle", label: "Vehicle" },
      { key: "route", label: "Route" }, { key: "dispatch", label: "Dispatched" },
      { key: "eta", label: "ETA" }, { key: "status", label: "Status" },
    ],
    rows: [
      { number: "SHP-00421", transporter: "DHL Kenya", vehicle: "KDA 442Q", route: "Nairobi → Mombasa", dispatch: "10 Jul", eta: "12 Jul", status: "Delivered" },
      { number: "SHP-00420", transporter: "Fedex Egypt", vehicle: "TRK-91-4523", route: "Cairo → Alexandria", dispatch: "11 Jul", eta: "13 Jul", status: "In Transit" },
      { number: "SHP-00419", transporter: "In-house Fleet", vehicle: "KCA 118M", route: "Nairobi → Nakuru", dispatch: "12 Jul", eta: "12 Jul", status: "In Transit" },
    ],
  },
  "sales.invoices": {
    title: "Invoices", description: "Customer invoices, taxes, and payment status.", primaryAction: "New Invoice",
    columns: [
      { key: "number", label: "Invoice #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "customer", label: "Customer", render: bold },
      { key: "due", label: "Due Date" },
      { key: "amount", label: "Total", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "balance", label: "Balance", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "INV-2026-1188", date: "12 Jul", customer: "Kilimanjaro Coffee Co.", due: "26 Jul", amount: 42800, balance: 42800, status: "Sent" },
      { number: "INV-2026-1187", date: "11 Jul", customer: "Nairobi Traders Ltd", due: "25 Jul", amount: 18450, balance: 0, status: "Paid" },
      { number: "INV-2026-1186", date: "05 Jul", customer: "Sahara Motors", due: "19 Jul", amount: 210500, balance: 210500, status: "Overdue" },
      { number: "INV-2026-1185", date: "02 Jul", customer: "Blue Ocean Logistics", due: "16 Jul", amount: 76400, balance: 30000, status: "Sent" },
      { number: "INV-2026-1184", date: "28 Jun", customer: "Rift Valley Foods", due: "12 Jul", amount: 15300, balance: 0, status: "Paid" },
    ],
  },
  "sales.payments": {
    title: "Payments Received", description: "Customer payments across all channels.", primaryAction: "Record Payment",
    columns: [
      { key: "number", label: "Payment #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "customer", label: "Customer", render: bold },
      { key: "mode", label: "Mode" }, { key: "reference", label: "Reference" },
      { key: "amount", label: "Amount", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
    ],
    rows: [
      { number: "RCP-00921", date: "11 Jul", customer: "Nairobi Traders Ltd", mode: "Bank Transfer", reference: "FT26071100211", amount: 18450 },
      { number: "RCP-00920", date: "09 Jul", customer: "Blue Ocean Logistics", mode: "Cheque", reference: "CHQ 004521", amount: 46400 },
      { number: "RCP-00919", date: "08 Jul", customer: "Rift Valley Foods", mode: "Mobile Money", reference: "MPESA QK4X22Z", amount: 15300 },
    ],
  },
  "sales.credit-notes": {
    title: "Credit Notes", description: "Issue credits and refunds against invoices.", primaryAction: "New Credit Note",
    columns: [
      { key: "number", label: "CN #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "customer", label: "Customer", render: bold },
      { key: "invoice", label: "Applied To", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "amount", label: "Amount", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "CN-2026-0044", date: "10 Jul", customer: "Sahara Motors", invoice: "INV-2026-1186", amount: 4200, status: "Applied" },
      { number: "CN-2026-0043", date: "02 Jul", customer: "Blue Ocean Logistics", invoice: "INV-2026-1185", amount: 1800, status: "Applied" },
    ],
  },
  "purchasing.suppliers": {
    title: "Suppliers", description: "Vendor master and payment terms.", primaryAction: "New Supplier",
    columns: [
      { key: "code", label: "Code", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "name", label: "Supplier", render: bold },
      { key: "category", label: "Category" }, { key: "phone", label: "Phone" },
      { key: "currency", label: "Currency" },
      { key: "balance", label: "Payable", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { code: "SUP-0001", name: "Global Steel Co.", category: "Raw Materials", phone: "+86 21 6288 1122", currency: "USD", balance: 128400, status: "Active" },
      { code: "SUP-0002", name: "Prime Packaging Ltd", category: "Packaging", phone: "+254 733 445566", currency: "KES", balance: 22150, status: "Active" },
      { code: "SUP-0003", name: "AutoParts Middle East", category: "Components", phone: "+971 4 887 1100", currency: "AED", balance: 0, status: "Active" },
    ],
  },
  "purchasing.requisitions": {
    title: "Purchase Requisitions", description: "Internal requests awaiting procurement approval.", primaryAction: "New Requisition",
    columns: [
      { key: "number", label: "PR #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "requester", label: "Requester" },
      { key: "dept", label: "Department" }, { key: "items", label: "Items", className: "text-right", render: num },
      { key: "amount", label: "Est. Value", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "PR-2026-0088", date: "12 Jul", requester: "M. Otieno", dept: "Production", items: 6, amount: 34200, status: "Pending" },
      { number: "PR-2026-0087", date: "11 Jul", requester: "L. Kimani", dept: "Warehouse", items: 3, amount: 8400, status: "Approved" },
      { number: "PR-2026-0086", date: "09 Jul", requester: "S. Hassan", dept: "Maintenance", items: 12, amount: 15600, status: "Draft" },
    ],
  },
  "purchasing.orders": {
    title: "Purchase Orders", description: "Confirmed orders with suppliers.", primaryAction: "New Purchase Order",
    columns: [
      { key: "number", label: "PO #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "supplier", label: "Supplier", render: bold },
      { key: "expected", label: "Expected" },
      { key: "amount", label: "Amount", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "PO-2026-0221", date: "10 Jul", supplier: "Global Steel Co.", expected: "24 Jul", amount: 128400, status: "Confirmed" },
      { number: "PO-2026-0220", date: "08 Jul", supplier: "Prime Packaging Ltd", expected: "15 Jul", amount: 22150, status: "Processing" },
      { number: "PO-2026-0219", date: "05 Jul", supplier: "AutoParts Middle East", expected: "12 Jul", amount: 46800, status: "Delivered" },
    ],
  },
  "purchasing.bills": {
    title: "Bills", description: "Supplier invoices awaiting payment.", primaryAction: "New Bill",
    columns: [
      { key: "number", label: "Bill #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "supplier", label: "Supplier", render: bold },
      { key: "due", label: "Due" },
      { key: "amount", label: "Total", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "balance", label: "Balance", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "BILL-6621", date: "10 Jul", supplier: "Global Steel Co.", due: "24 Jul", amount: 128400, balance: 128400, status: "Pending" },
      { number: "BILL-6620", date: "05 Jul", supplier: "AutoParts Middle East", due: "19 Jul", amount: 46800, balance: 0, status: "Paid" },
      { number: "BILL-6619", date: "01 Jul", supplier: "Prime Packaging Ltd", due: "15 Jul", amount: 22150, balance: 22150, status: "Overdue" },
    ],
  },
  "purchasing.expenses": {
    title: "Expenses", description: "Track operational and travel expenses.", primaryAction: "Record Expense",
    columns: [
      { key: "number", label: "Ref", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "category", label: "Category" },
      { key: "payee", label: "Paid To", render: bold }, { key: "account", label: "Paid From" },
      { key: "amount", label: "Amount", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
    ],
    rows: [
      { number: "EXP-01102", date: "11 Jul", category: "Fuel", payee: "Shell Kenya", account: "Petty Cash", amount: 320 },
      { number: "EXP-01101", date: "10 Jul", category: "Utilities", payee: "Kenya Power", account: "Equity Bank #221", amount: 4820 },
      { number: "EXP-01100", date: "09 Jul", category: "Software", payee: "Adobe Systems", account: "USD Visa", amount: 1290 },
    ],
  },
  "purchasing.credits": {
    title: "Supplier Credits", description: "Credits from suppliers to apply on future bills.", primaryAction: "New Credit",
    columns: [
      { key: "number", label: "SC #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "supplier", label: "Supplier", render: bold },
      { key: "bill", label: "Original Bill", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "amount", label: "Amount", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "SC-0031", date: "08 Jul", supplier: "Prime Packaging Ltd", bill: "BILL-6614", amount: 1200, status: "Applied" },
    ],
  },
  "purchasing.payments": {
    title: "Payments Made", description: "Outgoing payments to suppliers.", primaryAction: "Record Payment",
    columns: [
      { key: "number", label: "Payment #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "supplier", label: "Supplier", render: bold },
      { key: "mode", label: "Mode" },
      { key: "amount", label: "Amount", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
    ],
    rows: [
      { number: "PAY-00512", date: "10 Jul", supplier: "AutoParts Middle East", mode: "Bank Transfer", amount: 46800 },
      { number: "PAY-00511", date: "07 Jul", supplier: "Prime Packaging Ltd", mode: "Cheque", amount: 22150 },
    ],
  },
  "inventory.items": {
    title: "Items", description: "Products, raw materials, assemblies, and services.", primaryAction: "New Item",
    columns: [
      { key: "sku", label: "SKU", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "name", label: "Item", render: bold }, { key: "type", label: "Type" },
      { key: "uom", label: "UoM" }, { key: "stock", label: "On Hand", className: "text-right", render: num },
      { key: "reorder", label: "Reorder", className: "text-right", render: num },
      { key: "cost", label: "Avg Cost", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "price", label: "Sell Price", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
    ],
    rows: [
      { sku: "RM-STL-014", name: "Cold Rolled Steel 2mm", type: "Raw Material", uom: "kg", stock: 4820, reorder: 1500, cost: 1.85, price: 0 },
      { sku: "FG-BRK-201", name: "Brake Assembly – Model X", type: "Finished Good", uom: "pc", stock: 128, reorder: 50, cost: 44.20, price: 89.00 },
      { sku: "AS-ENG-088", name: "Engine Sub-Assembly", type: "Assembly", uom: "pc", stock: 22, reorder: 10, cost: 312.50, price: 0 },
      { sku: "SV-INS-001", name: "On-site Installation", type: "Service", uom: "hr", stock: 0, reorder: 0, cost: 0, price: 45.00 },
      { sku: "PK-BOX-06", name: "Corrugated Box 60cm", type: "Raw Material", uom: "pc", stock: 240, reorder: 500, cost: 0.42, price: 0 },
    ],
  },
  "inventory.warehouses": {
    title: "Warehouses", description: "Storage locations and stocking rules.", primaryAction: "New Warehouse",
    columns: [
      { key: "code", label: "Code", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "name", label: "Warehouse", render: bold }, { key: "location", label: "Location" },
      { key: "manager", label: "Manager" }, { key: "items", label: "Item Count", className: "text-right", render: num },
      { key: "status", label: "Status" },
    ],
    rows: [
      { code: "WH-NBO-01", name: "Nairobi Main Warehouse", location: "Industrial Area, Nairobi", manager: "P. Wanjiru", items: 1284, status: "Active" },
      { code: "WH-MSA-01", name: "Mombasa Port Depot", location: "Changamwe, Mombasa", manager: "A. Salim", items: 421, status: "Active" },
      { code: "WH-CAI-01", name: "Cairo Distribution Hub", location: "6th of October City", manager: "N. Abdel", items: 812, status: "Active" },
    ],
  },
  "inventory.adjustments": {
    title: "Inventory Adjustments", description: "Corrections for damage, loss, and stock counts.", primaryAction: "New Adjustment",
    columns: [
      { key: "number", label: "ADJ #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "warehouse", label: "Warehouse" },
      { key: "reason", label: "Reason" }, { key: "items", label: "Items", className: "text-right", render: num },
      { key: "value", label: "Value Δ", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "ADJ-00212", date: "11 Jul", warehouse: "WH-NBO-01", reason: "Stock Count", items: 8, value: -420, status: "Approved" },
      { number: "ADJ-00211", date: "09 Jul", warehouse: "WH-MSA-01", reason: "Damage", items: 2, value: -180, status: "Approved" },
      { number: "ADJ-00210", date: "05 Jul", warehouse: "WH-CAI-01", reason: "Opening Balance", items: 812, value: 128400, status: "Approved" },
    ],
  },
  "inventory.transfers": {
    title: "Stock Transfers", description: "Move stock between warehouses.", primaryAction: "New Transfer",
    columns: [
      { key: "number", label: "TR #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "from", label: "From" }, { key: "to", label: "To" },
      { key: "items", label: "Items", className: "text-right", render: num }, { key: "status", label: "Status" },
    ],
    rows: [
      { number: "TR-00114", date: "12 Jul", from: "WH-NBO-01", to: "WH-MSA-01", items: 24, status: "In Transit" },
      { number: "TR-00113", date: "09 Jul", from: "WH-NBO-01", to: "WH-CAI-01", items: 6, status: "Completed" },
    ],
  },
  "inventory.ledger": {
    title: "Inventory Ledger", description: "Movement history using FIFO / Weighted Average.", primaryAction: undefined,
    columns: [
      { key: "date", label: "Date" }, { key: "item", label: "Item", render: bold },
      { key: "warehouse", label: "Warehouse" }, { key: "type", label: "Type" },
      { key: "ref", label: "Reference", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "in", label: "In", className: "text-right", render: num },
      { key: "out", label: "Out", className: "text-right", render: num },
      { key: "balance", label: "Balance", className: "text-right", render: num },
    ],
    rows: [
      { date: "12 Jul", item: "Cold Rolled Steel 2mm", warehouse: "WH-NBO-01", type: "Purchase", ref: "PO-2026-0221", in: 2000, out: 0, balance: 4820 },
      { date: "11 Jul", item: "Brake Assembly – Model X", warehouse: "WH-NBO-01", type: "Production", ref: "PR-RUN-0142", in: 40, out: 0, balance: 128 },
      { date: "10 Jul", item: "Brake Assembly – Model X", warehouse: "WH-NBO-01", type: "Sale", ref: "SO-2026-0339", in: 0, out: 22, balance: 88 },
    ],
  },
  "manufacturing.items": {
    title: "Production Items", description: "Finished goods produced in-house.", primaryAction: "New Item",
    columns: [
      { key: "sku", label: "SKU", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "name", label: "Item", render: bold },
      { key: "bom", label: "Active BOM", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "leadtime", label: "Lead Time (d)", className: "text-right", render: num },
      { key: "cost", label: "Std Cost", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
    ],
    rows: [
      { sku: "FG-BRK-201", name: "Brake Assembly – Model X", bom: "BOM-BRK-201-v3", leadtime: 5, cost: 44.20 },
      { sku: "FG-EXH-108", name: "Exhaust Manifold", bom: "BOM-EXH-108-v1", leadtime: 3, cost: 62.10 },
    ],
  },
  "manufacturing.bom": {
    title: "Bill of Materials", description: "Components, labour, and overheads for each product.", primaryAction: "New BOM",
    columns: [
      { key: "code", label: "BOM #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "product", label: "Product", render: bold },
      { key: "components", label: "Components", className: "text-right", render: num },
      { key: "labour", label: "Labour", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "overhead", label: "Overhead", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "total", label: "Total Cost", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { code: "BOM-BRK-201-v3", product: "Brake Assembly – Model X", components: 12, labour: 6.50, overhead: 3.20, total: 44.20, status: "Active" },
      { code: "BOM-EXH-108-v1", product: "Exhaust Manifold", components: 8, labour: 9.80, overhead: 4.10, total: 62.10, status: "Active" },
    ],
  },
  "manufacturing.orders": {
    title: "Production Orders", description: "Planned manufacturing work orders.", primaryAction: "New Production Order",
    columns: [
      { key: "number", label: "MO #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "product", label: "Product", render: bold },
      { key: "qty", label: "Qty", className: "text-right", render: num },
      { key: "so", label: "Sales Order", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "due", label: "Due" }, { key: "status", label: "Status" },
    ],
    rows: [
      { number: "MO-2026-0142", date: "12 Jul", product: "Brake Assembly – Model X", qty: 40, so: "SO-2026-0341", due: "18 Jul", status: "Confirmed" },
      { number: "MO-2026-0141", date: "10 Jul", product: "Exhaust Manifold", qty: 24, so: "SO-2026-0339", due: "15 Jul", status: "Processing" },
    ],
  },
  "manufacturing.runs": {
    title: "Production Runs", description: "Active and completed shop-floor runs.", primaryAction: "Start Run",
    columns: [
      { key: "number", label: "Run #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "mo", label: "MO", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "started", label: "Started" },
      { key: "produced", label: "Produced", className: "text-right", render: num },
      { key: "scrap", label: "Scrap", className: "text-right", render: num },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "PR-RUN-0142", mo: "MO-2026-0142", started: "12 Jul 08:30", produced: 40, scrap: 1, status: "Completed" },
      { number: "PR-RUN-0141", mo: "MO-2026-0141", started: "11 Jul 09:00", produced: 14, scrap: 0, status: "Processing" },
    ],
  },
  "accounting.chart": {
    title: "Chart of Accounts", description: "General ledger accounts by classification.", primaryAction: "New Account",
    columns: [
      { key: "code", label: "Code", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "name", label: "Account", render: bold }, { key: "type", label: "Type" },
      { key: "parent", label: "Parent" },
      { key: "balance", label: "Balance", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { code: "1100", name: "Cash & Equivalents", type: "Assets", parent: "Current Assets", balance: 428100, status: "Active" },
      { code: "1200", name: "Accounts Receivable", type: "Assets", parent: "Current Assets", balance: 790200, status: "Active" },
      { code: "1500", name: "Inventory Asset", type: "Assets", parent: "Current Assets", balance: 612400, status: "Active" },
      { code: "2100", name: "Accounts Payable", type: "Liabilities", parent: "Current Liabilities", balance: 218550, status: "Active" },
      { code: "3100", name: "Owner Equity", type: "Equity", parent: "Equity", balance: 1200000, status: "Active" },
      { code: "4100", name: "Product Sales", type: "Income", parent: "Revenue", balance: 2841000, status: "Active" },
      { code: "5100", name: "Cost of Goods Sold", type: "Cost of Sales", parent: "COGS", balance: 1642000, status: "Active" },
    ],
  },
  "accounting.banking": {
    title: "Banking", description: "Bank accounts, deposits, withdrawals, and transfers.", primaryAction: "New Account",
    columns: [
      { key: "name", label: "Account", render: bold }, { key: "bank", label: "Bank" },
      { key: "number", label: "A/C Number", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "currency", label: "Currency" },
      { key: "balance", label: "Balance", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { name: "Operating – KES", bank: "Equity Bank", number: "0100 2214 8821", currency: "KES", balance: 3420100, status: "Active" },
      { name: "USD Trade", bank: "Standard Chartered", number: "0400 8812 4402", currency: "USD", balance: 148200, status: "Active" },
      { name: "Petty Cash", bank: "Cash on Hand", number: "—", currency: "KES", balance: 22400, status: "Active" },
    ],
  },
  "accounting.journals": {
    title: "Manual Journals", description: "Adjusting and recurring journal entries.", primaryAction: "New Journal",
    columns: [
      { key: "number", label: "Journal #", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "date", label: "Date" }, { key: "reference", label: "Reference" },
      { key: "narration", label: "Narration", render: bold },
      { key: "amount", label: "Amount", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { number: "JV-2026-0071", date: "30 Jun", reference: "Depreciation", narration: "June depreciation of fixed assets", amount: 18420, status: "Approved" },
      { number: "JV-2026-0070", date: "30 Jun", reference: "Payroll accrual", narration: "Salary accrual – June", amount: 84200, status: "Approved" },
    ],
  },
  "accounting.reconciliation": {
    title: "Bank Reconciliation", description: "Match imported bank statements to ledger transactions.", primaryAction: "Import Statement",
    columns: [
      { key: "account", label: "Account", render: bold }, { key: "period", label: "Period" },
      { key: "statement", label: "Statement Balance", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "book", label: "Book Balance", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "difference", label: "Difference", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { account: "Operating – KES", period: "Jun 2026", statement: 3420100, book: 3420100, difference: 0, status: "Completed" },
      { account: "USD Trade", period: "Jun 2026", statement: 148200, book: 146800, difference: 1400, status: "Pending" },
    ],
  },
  "super-admin.tenants": {
    title: "Tenants", description: "All customer organisations on the platform.", primaryAction: "New Tenant",
    columns: [
      { key: "name", label: "Company", render: bold }, { key: "industry", label: "Industry" },
      { key: "country", label: "Country" }, { key: "plan", label: "Plan" },
      { key: "users", label: "Users", className: "text-right", render: num },
      { key: "mrr", label: "MRR", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "status", label: "Status" },
    ],
    rows: [
      { name: "Acme Manufacturing Ltd", industry: "Manufacturing", country: "Kenya", plan: "Enterprise", users: 42, mrr: 890, status: "Active" },
      { name: "Blue Ocean Logistics", industry: "Logistics", country: "UAE", plan: "Business", users: 18, mrr: 420, status: "Active" },
      { name: "Kilimanjaro Coffee Co.", industry: "F&B", country: "Tanzania", plan: "Business", users: 12, mrr: 320, status: "Trial" },
      { name: "Sahara Motors", industry: "Automotive", country: "Egypt", plan: "Enterprise", users: 64, mrr: 1240, status: "Suspended" },
    ],
  },
  "super-admin.plans": {
    title: "Subscription Plans", description: "Pricing tiers offered to tenants.", primaryAction: "New Plan",
    columns: [
      { key: "name", label: "Plan", render: bold },
      { key: "price", label: "Price / mo", className: "text-right", render: (v) => <span className="font-mono tabular-nums">{money(v)}</span> },
      { key: "users", label: "Users" }, { key: "storage", label: "Storage" }, { key: "modules", label: "Modules" },
      { key: "tenants", label: "Active Tenants", className: "text-right", render: num },
      { key: "status", label: "Status" },
    ],
    rows: [
      { name: "Starter", price: 49, users: "5", storage: "10 GB", modules: "Sales, Inventory", tenants: 118, status: "Active" },
      { name: "Business", price: 199, users: "25", storage: "100 GB", modules: "All Core", tenants: 84, status: "Active" },
      { name: "Enterprise", price: 890, users: "Unlimited", storage: "1 TB", modules: "All + Manufacturing", tenants: 42, status: "Active" },
    ],
  },
  "super-admin.users": {
    title: "Platform Users", description: "Users across every tenant.", primaryAction: "Invite User",
    columns: [
      { key: "name", label: "Name", render: bold }, { key: "email", label: "Email" },
      { key: "tenant", label: "Tenant" }, { key: "role", label: "Role" },
      { key: "lastLogin", label: "Last Login" }, { key: "status", label: "Status" },
    ],
    rows: [
      { name: "Jane Doe", email: "jane@acme.co.ke", tenant: "Acme Manufacturing", role: "Tenant Admin", lastLogin: "2 min ago", status: "Active" },
      { name: "Ahmed Salim", email: "ahmed@blueocean.ae", tenant: "Blue Ocean Logistics", role: "Sales Manager", lastLogin: "1 hr ago", status: "Active" },
      { name: "Grace Wanjiru", email: "grace@acme.co.ke", tenant: "Acme Manufacturing", role: "Warehouse Manager", lastLogin: "yesterday", status: "Active" },
      { name: "Nour Abdel", email: "nour@saharamotors.eg", tenant: "Sahara Motors", role: "Finance Manager", lastLogin: "6 days ago", status: "Suspended" },
    ],
  },
  "super-admin.audit": {
    title: "Audit Logs", description: "Every privileged action across the platform.", primaryAction: undefined,
    columns: [
      { key: "time", label: "Time" }, { key: "user", label: "User", render: bold },
      { key: "tenant", label: "Tenant" }, { key: "action", label: "Action" },
      { key: "target", label: "Target", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "ip", label: "IP", render: (v) => <span className="font-mono text-xs">{v}</span> },
    ],
    rows: [
      { time: "12 Jul 09:42", user: "Jane Doe", tenant: "Acme", action: "invoice.approved", target: "INV-2026-1188", ip: "196.201.44.12" },
      { time: "12 Jul 09:31", user: "System", tenant: "—", action: "backup.completed", target: "db-nightly-20260712", ip: "10.0.0.4" },
      { time: "12 Jul 08:22", user: "Nour Abdel", tenant: "Sahara", action: "user.suspended", target: "hakim@saharamotors.eg", ip: "156.211.4.221" },
    ],
  },
  "super-admin.settings": {
    title: "System Settings", description: "Platform-wide configuration, security, and integrations.", primaryAction: undefined,
    columns: [
      { key: "key", label: "Setting", render: bold }, { key: "value", label: "Value" },
      { key: "scope", label: "Scope" }, { key: "updated", label: "Last Updated" },
    ],
    rows: [
      { key: "Default Currency", value: "USD", scope: "Global", updated: "10 Jun 2026" },
      { key: "Session Timeout", value: "60 minutes", scope: "Security", updated: "02 Jul 2026" },
      { key: "MFA Enforcement", value: "Required for admins", scope: "Security", updated: "02 Jul 2026" },
      { key: "Nightly Backup", value: "02:00 UTC", scope: "Backups", updated: "01 Jan 2026" },
    ],
  },
  // Settings modules
  "settings.company": {
    title: "Company Profile", description: "Legal name, addresses, tax IDs, and branding.", primaryAction: "Edit Profile",
    columns: [
      { key: "field", label: "Field", render: bold }, { key: "value", label: "Value" },
    ],
    rows: [
      { field: "Legal Name", value: "Acme Manufacturing Limited" },
      { field: "Trading Name", value: "Acme Mfg." },
      { field: "PIN / Tax ID", value: "P051234567X" },
      { field: "VAT Number", value: "0123456789" },
      { field: "Base Currency", value: "KES – Kenyan Shilling" },
      { field: "Financial Year", value: "Jan – Dec" },
      { field: "Time Zone", value: "Africa/Nairobi (UTC+03:00)" },
    ],
  },
  "settings.taxes": {
    title: "Taxes", description: "Tax rates applied on invoices and bills.", primaryAction: "New Tax",
    columns: [
      { key: "name", label: "Tax", render: bold }, { key: "rate", label: "Rate", className: "text-right" },
      { key: "type", label: "Type" }, { key: "account", label: "Linked Account" }, { key: "status", label: "Status" },
    ],
    rows: [
      { name: "VAT 16%", rate: "16.00%", type: "Output", account: "VAT Payable", status: "Active" },
      { name: "VAT 8%", rate: "8.00%", type: "Output", account: "VAT Payable", status: "Active" },
      { name: "Withholding 5%", rate: "5.00%", type: "Withholding", account: "WHT Receivable", status: "Active" },
    ],
  },
  "settings.currencies": {
    title: "Currencies", description: "Foreign exchange rates and enabled currencies.", primaryAction: "Add Currency",
    columns: [
      { key: "code", label: "Code", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "name", label: "Currency", render: bold },
      { key: "rate", label: "Rate to KES", className: "text-right" },
      { key: "updated", label: "Updated" }, { key: "status", label: "Status" },
    ],
    rows: [
      { code: "KES", name: "Kenyan Shilling", rate: "1.0000", updated: "12 Jul", status: "Active" },
      { code: "USD", name: "US Dollar", rate: "129.4200", updated: "12 Jul", status: "Active" },
      { code: "EUR", name: "Euro", rate: "141.8500", updated: "12 Jul", status: "Active" },
      { code: "AED", name: "UAE Dirham", rate: "35.2200", updated: "12 Jul", status: "Active" },
    ],
  },
  "settings.warehouses": {
    title: "Warehouses", description: "Locations available for stocking items.", primaryAction: "New Warehouse",
    columns: [
      { key: "code", label: "Code", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "name", label: "Warehouse", render: bold }, { key: "location", label: "Location" }, { key: "status", label: "Status" },
    ],
    rows: [
      { code: "WH-NBO-01", name: "Nairobi Main Warehouse", location: "Industrial Area, Nairobi", status: "Active" },
      { code: "WH-MSA-01", name: "Mombasa Port Depot", location: "Changamwe, Mombasa", status: "Active" },
    ],
  },
  "settings.uom": {
    title: "Units of Measure", description: "Measurement units and conversions.", primaryAction: "New Unit",
    columns: [
      { key: "code", label: "Code", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "name", label: "Unit", render: bold }, { key: "category", label: "Category" }, { key: "status", label: "Status" },
    ],
    rows: [
      { code: "pc", name: "Piece", category: "Count", status: "Active" },
      { code: "kg", name: "Kilogram", category: "Weight", status: "Active" },
      { code: "l", name: "Litre", category: "Volume", status: "Active" },
      { code: "hr", name: "Hour", category: "Time", status: "Active" },
    ],
  },
  "settings.workflows": {
    title: "Approval Workflows", description: "Automated approvals for documents and thresholds.", primaryAction: "New Workflow",
    columns: [
      { key: "name", label: "Workflow", render: bold }, { key: "trigger", label: "Trigger" },
      { key: "approvers", label: "Approvers" }, { key: "status", label: "Status" },
    ],
    rows: [
      { name: "PO over $10k", trigger: "Purchase Order created", approvers: "Procurement Manager → Finance Manager", status: "Active" },
      { name: "Discount over 15%", trigger: "Invoice line discount", approvers: "Sales Manager", status: "Active" },
    ],
  },
  "settings.payment-terms": {
    title: "Payment Terms", description: "Standard credit terms for customers and suppliers.", primaryAction: "New Term",
    columns: [
      { key: "name", label: "Term", render: bold }, { key: "days", label: "Days", className: "text-right", render: num }, { key: "status", label: "Status" },
    ],
    rows: [
      { name: "Due on Receipt", days: 0, status: "Active" },
      { name: "Net 15", days: 15, status: "Active" },
      { name: "Net 30", days: 30, status: "Active" },
      { name: "Net 60", days: 60, status: "Active" },
    ],
  },
  "settings.numbering": {
    title: "Document Numbering", description: "Prefixes and sequences for business documents.", primaryAction: "New Series",
    columns: [
      { key: "type", label: "Document", render: bold }, { key: "prefix", label: "Prefix", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "next", label: "Next #", className: "text-right", render: num }, { key: "status", label: "Status" },
    ],
    rows: [
      { type: "Invoice", prefix: "INV-{YYYY}-", next: 1189, status: "Active" },
      { type: "Sales Order", prefix: "SO-{YYYY}-", next: 342, status: "Active" },
      { type: "Purchase Order", prefix: "PO-{YYYY}-", next: 222, status: "Active" },
      { type: "Quote", prefix: "QT-{YYYY}-", next: 143, status: "Active" },
    ],
  },
  "settings.templates": {
    title: "Email Templates", description: "Templates for automated transactional emails.", primaryAction: "New Template",
    columns: [
      { key: "name", label: "Template", render: bold }, { key: "event", label: "Event" }, { key: "updated", label: "Updated" }, { key: "status", label: "Status" },
    ],
    rows: [
      { name: "Invoice Sent", event: "invoice.sent", updated: "10 Jun", status: "Active" },
      { name: "Payment Received", event: "payment.received", updated: "10 Jun", status: "Active" },
      { name: "Quote Sent", event: "quote.sent", updated: "05 May", status: "Active" },
    ],
  },
  "settings.notifications": {
    title: "Notifications", description: "In-app and email notification preferences.", primaryAction: "New Rule",
    columns: [
      { key: "event", label: "Event", render: bold }, { key: "channel", label: "Channel" },
      { key: "audience", label: "Audience" }, { key: "status", label: "Status" },
    ],
    rows: [
      { event: "Sales Order confirmed", channel: "In-app + Email", audience: "Sales, Logistics", status: "Active" },
      { event: "Stock below reorder level", channel: "Email", audience: "Procurement", status: "Active" },
      { event: "Invoice overdue", channel: "In-app + Email", audience: "Finance", status: "Active" },
    ],
  },
  "settings.users": {
    title: "Users", description: "Users in this tenant workspace.", primaryAction: "Invite User",
    columns: [
      { key: "name", label: "Name", render: bold }, { key: "email", label: "Email" },
      { key: "role", label: "Role" }, { key: "lastLogin", label: "Last Login" }, { key: "status", label: "Status" },
    ],
    rows: [
      { name: "Jane Doe", email: "jane@acme.co.ke", role: "Tenant Admin", lastLogin: "2 min ago", status: "Active" },
      { name: "Grace Wanjiru", email: "grace@acme.co.ke", role: "Warehouse Manager", lastLogin: "yesterday", status: "Active" },
      { name: "Peter Otieno", email: "peter@acme.co.ke", role: "Production Manager", lastLogin: "3 hrs ago", status: "Active" },
      { name: "Linet Kimani", email: "linet@acme.co.ke", role: "Procurement Manager", lastLogin: "5 hrs ago", status: "Active" },
    ],
  },
  "settings.roles": {
    title: "Roles & Permissions", description: "Role-based access control across modules.", primaryAction: "New Role",
    columns: [
      { key: "name", label: "Role", render: bold }, { key: "users", label: "Users", className: "text-right", render: num },
      { key: "modules", label: "Modules" }, { key: "type", label: "Type" },
    ],
    rows: [
      { name: "Tenant Admin", users: 2, modules: "All", type: "System" },
      { name: "Sales Manager", users: 3, modules: "CRM, Sales, Reports", type: "System" },
      { name: "Warehouse Manager", users: 4, modules: "Inventory, Logistics", type: "System" },
      { name: "Custom – Regional Ops", users: 5, modules: "Sales, Logistics, Reports", type: "Custom" },
    ],
  },
  "settings.api-keys": {
    title: "API Keys", description: "Programmatic access tokens for integrations.", primaryAction: "Generate Key",
    columns: [
      { key: "name", label: "Name", render: bold },
      { key: "prefix", label: "Prefix", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "created", label: "Created" }, { key: "lastUsed", label: "Last Used" }, { key: "status", label: "Status" },
    ],
    rows: [
      { name: "Zapier Integration", prefix: "sk_live_a2f9…", created: "10 May 2026", lastUsed: "1 hr ago", status: "Active" },
      { name: "Warehouse Scanner", prefix: "sk_live_c811…", created: "01 Jun 2026", lastUsed: "3 min ago", status: "Active" },
    ],
  },
  // Reports use same table shape
  "reports.sales": {
    title: "Sales Reports", description: "Revenue, conversion, and customer insights.", primaryAction: undefined,
    columns: [
      { key: "name", label: "Report", render: bold }, { key: "period", label: "Period" }, { key: "updated", label: "Last Run" },
    ],
    rows: [
      { name: "Sales by Customer", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Sales by Item", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Sales by Salesperson", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Quote Conversion", period: "QTD", updated: "12 Jul 08:00" },
      { name: "Customer Statements", period: "MTD", updated: "12 Jul 08:00" },
    ],
  },
  "reports.purchases": {
    title: "Purchase Reports", description: "Vendor spend and procurement analytics.", primaryAction: undefined,
    columns: [
      { key: "name", label: "Report", render: bold }, { key: "period", label: "Period" }, { key: "updated", label: "Last Run" },
    ],
    rows: [
      { name: "Purchases by Supplier", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Purchases by Item", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Supplier Statements", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Bills to Pay", period: "Live", updated: "12 Jul 09:42" },
    ],
  },
  "reports.inventory": {
    title: "Inventory Reports", description: "Stock levels, movement, and valuation.", primaryAction: undefined,
    columns: [
      { key: "name", label: "Report", render: bold }, { key: "period", label: "Period" }, { key: "updated", label: "Last Run" },
    ],
    rows: [
      { name: "Inventory Valuation", period: "As of today", updated: "12 Jul 09:00" },
      { name: "Stock Movement", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Low Stock", period: "Live", updated: "12 Jul 09:42" },
      { name: "Warehouse Stock Report", period: "Live", updated: "12 Jul 09:42" },
    ],
  },
  "reports.manufacturing": {
    title: "Manufacturing Reports", description: "Production output and cost analysis.", primaryAction: undefined,
    columns: [
      { key: "name", label: "Report", render: bold }, { key: "period", label: "Period" }, { key: "updated", label: "Last Run" },
    ],
    rows: [
      { name: "Production Cost Report", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Material Consumption", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Production Efficiency", period: "MTD", updated: "12 Jul 09:00" },
    ],
  },
  "reports.financial": {
    title: "Financial Reports", description: "Statutory and management accounting reports.", primaryAction: undefined,
    columns: [
      { key: "name", label: "Report", render: bold }, { key: "period", label: "Period" }, { key: "updated", label: "Last Run" },
    ],
    rows: [
      { name: "Trial Balance", period: "MTD", updated: "12 Jul 09:00" },
      { name: "General Ledger", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Profit & Loss", period: "MTD", updated: "12 Jul 09:00" },
      { name: "Balance Sheet", period: "As of today", updated: "12 Jul 09:00" },
      { name: "Cash Flow", period: "MTD", updated: "12 Jul 09:00" },
    ],
  },
};
