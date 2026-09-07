import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { CustomerCreateEditWindow } from "@/components/customer-create-edit-window";
import { SupplierCreateEditModal } from "@/components/supplier-create-edit-modal";
import type { FieldDef } from "@/components/data-module-page";
import { ArrowLeft, Building2, CalendarDays, ClipboardList, FileText, History, Mail, MapPin, Pencil, Phone, Plus, Receipt, ShoppingCart, Wallet } from "lucide-react";

type PartyKind = "customer" | "supplier";
type Row = Record<string, any>;

const money = (value: any, currency: string) => `${currency} ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateFmt = (value: any) => value ? new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const dateTimeFmt = (value: any) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const addressLines = (value: string | null | undefined) => (value ?? "").split("\n").map((line) => line.trim()).filter(Boolean);

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return <div className="grid gap-0.5"><span className="text-[11px] text-muted-foreground">{label}</span><span className="break-words text-sm font-medium">{value || "Not set"}</span></div>;
}

function TransactionTable({ rows, label, currency }: { rows: Row[]; label: string; currency: string }) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">No {label.toLowerCase()} yet.</TableCell></TableRow> : rows.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.number ?? "—"}</TableCell><TableCell>{dateFmt(row.date)}</TableCell><TableCell><Badge variant="secondary">{row.status ?? "Draft"}</Badge></TableCell><TableCell className="text-right font-mono">{money(row.grand_total ?? row.amount, currency)}</TableCell></TableRow>)}</TableBody></Table></div>;
}

export function Party360Page({ id, kind, fields }: { id: string; kind: PartyKind; fields: FieldDef[] }) {
  const nav = useNavigate();
  const { tenant, can } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const isCustomer = kind === "customer";
  const table = isCustomer ? "customers" : "suppliers";
  const listHref = isCustomer ? "/crm/customers" : "/purchasing/suppliers";
  const permissionModule = isCustomer ? "crm" : "purchasing";
  const recordLabel = isCustomer ? "Customer" : "Supplier";
  const currency = tenant?.currency_symbol ?? tenant?.currency ?? "KES";
  const related = isCustomer
    ? [{ key: "orders", label: "Orders", table: "sales_orders" }, { key: "invoices", label: "Invoices", table: "invoices" }, { key: "payments", label: "Payments", table: "payments_received" }]
    : [{ key: "purchase-orders", label: "Purchase Orders", table: "purchase_orders" }, { key: "bills", label: "Bills", table: "bills" }, { key: "payments", label: "Payments", table: "payments_made" }];

  const { data: record, isLoading } = useQuery({
    queryKey: [table, "360", id],
    queryFn: async () => {
      const { data, error } = await db.from(table).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  const relatedQueries = useQueries({ queries: related.map((entry) => ({
    queryKey: [entry.table, "party-360", id],
    queryFn: async () => {
      const { data, error } = await db.from(entry.table).select("*").eq(isCustomer ? "customer_id" : "supplier_id", id).is("deleted_at", null).order("date", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  })) });
  const transactionRows = Object.fromEntries(related.map((entry, index) => [entry.key, relatedQueries[index].data ?? []]));
  const allTransactions = related.flatMap((entry) => transactionRows[entry.key] ?? []);
  const { data: audit = [] } = useQuery({
    queryKey: ["audit_logs", table, id],
    queryFn: async () => {
      const { data, error } = await db.from("audit_logs").select("*").eq("table_name", table).eq("record_id", id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const activity = useMemo(() => [...allTransactions].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()).slice(0, 8), [allTransactions]);
  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading {recordLabel.toLowerCase()}…</div>;
  if (!record) return <div className="p-8 text-sm text-muted-foreground">{recordLabel} not found.</div>;

  const outstanding = Number(record.balance ?? 0);
  const creditLimit = Number(record.credit_limit ?? 0);
  const overdueRows = allTransactions.filter((row) => Number(row.balance_due ?? 0) > 0 && row.due_date && new Date(row.due_date) < new Date());
  const overdue = overdueRows.reduce((sum, row) => sum + Number(row.balance_due ?? 0), 0);
  const ytd = allTransactions.filter((row) => row.date && new Date(row.date).getFullYear() === new Date().getFullYear()).reduce((sum, row) => sum + Number(row.grand_total ?? row.amount ?? 0), 0);
  const utilization = creditLimit > 0 ? Math.min(100, Math.max(0, (outstanding / creditLimit) * 100)) : 0;
  const lastTransaction = activity[0];
  const canEdit = can([`${permissionModule}.update`, `${permissionModule}.create`]);
  const kpis = [
    { label: isCustomer ? "YTD Sales" : "YTD Purchases", value: money(ytd, currency), sub: "Current fiscal year", icon: isCustomer ? ShoppingCart : ClipboardList },
    { label: isCustomer ? "Outstanding Balance" : "Outstanding Payable", value: money(outstanding, currency), sub: record.payment_terms ?? "Terms not set", icon: Wallet },
    { label: "Available Credit", value: creditLimit ? money(Math.max(0, creditLimit - outstanding), currency) : "Not set", sub: creditLimit ? `${Math.round(100 - utilization)}% remaining` : "No credit limit", icon: Receipt },
    { label: "Overdue Balance", value: money(overdue, currency), sub: `${overdueRows.length} document(s)`, icon: CalendarDays },
    { label: isCustomer ? "Last Order" : "Last Purchase", value: dateFmt(lastTransaction?.date), sub: lastTransaction?.number ?? "No transactions", icon: FileText },
  ];

  return <div className="min-h-full bg-muted/20 p-4 md:p-6"><div className="mx-auto flex max-w-[1500px] flex-col gap-4">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex min-w-0 items-start gap-3"><Button variant="ghost" size="sm" onClick={() => nav({ to: listHref as never })}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button><div className="flex min-w-0 items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-semibold tracking-tight">{record.name}</h1><Badge variant="secondary">{record.status ?? "Active"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{record.code ?? "—"} · {recordLabel} · {record.category ?? record.industry ?? "General"} · {record.country ?? "—"}</p></div></div></div><div className="flex flex-wrap gap-2 lg:justify-end"><Button size="sm" asChild><a href={isCustomer ? "/sales/orders" : "/purchasing/orders"}><Plus className="mr-1.5 h-4 w-4" /> {isCustomer ? "New Order" : "New Purchase Order"}</a></Button><Button size="sm" variant="outline" onClick={() => nav({ to: (isCustomer ? "/sales/payments" : "/purchasing/payments") as never })}><Wallet className="mr-1.5 h-4 w-4" /> Record Payment</Button>{canEdit && <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-1.5 h-4 w-4" /> Edit</Button>}</div></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">{kpis.map((item) => <Card key={item.label} className="p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 truncate font-mono text-lg font-semibold tabular-nums">{item.value}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.sub}</p></div><item.icon className="h-4 w-4 shrink-0 text-primary" /></div></Card>)}</div>
    <Tabs defaultValue="overview" className="w-full"><TabsList className="w-full justify-start overflow-x-auto"><TabsTrigger value="overview">Overview</TabsTrigger>{related.map((entry) => <TabsTrigger key={entry.key} value={entry.key}>{entry.label}</TabsTrigger>)}<TabsTrigger value="contacts">Contacts</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="audit">Audit Trail</TabsTrigger></TabsList>
      <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr]"><Card><CardHeader><CardTitle className="text-sm">Financial Summary</CardTitle></CardHeader><Separator /><CardContent className="grid gap-4 sm:grid-cols-2"><Detail label="Currency" value={record.currency ?? currency} /><Detail label="Payment Terms" value={record.payment_terms} /><Detail label="Credit Limit" value={creditLimit ? money(creditLimit, currency) : "Not set"} /><Detail label="Current Balance" value={<span className={outstanding > 0 ? "text-amber-600" : ""}>{money(outstanding, currency)}</span>} /><Detail label="Overdue Balance" value={<span className={overdue > 0 ? "text-destructive" : ""}>{money(overdue, currency)}</span>} /><Detail label="Tax / VAT ID" value={record.tax_id ?? record.vat_number} /><div className="sm:col-span-2"><div className="mb-1 flex justify-between text-xs"><span>Credit Utilization</span><span>{creditLimit ? `${Math.round(utilization)}%` : "Not set"}</span></div><Progress value={utilization} /></div></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Contact Information</CardTitle></CardHeader><Separator /><CardContent className="grid gap-4"><Detail label="Contact Person" value={record.contact_person} /><Detail label="Email" value={record.email ? <a className="text-primary hover:underline" href={`mailto:${record.email}`}><Mail className="mr-1 inline h-3.5 w-3.5" />{record.email}</a> : null} /><Detail label="Phone" value={record.phone ? <a className="text-primary hover:underline" href={`tel:${record.phone}`}><Phone className="mr-1 inline h-3.5 w-3.5" />{record.phone}</a> : null} /><Detail label="Website" value={record.website ? <a className="text-primary hover:underline" href={record.website} target="_blank" rel="noreferrer">{record.website}</a> : null} /><Detail label={isCustomer ? "Salesperson" : "Buyer"} value="Not assigned" /></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Recent Activity</CardTitle></CardHeader><Separator /><CardContent className="space-y-4">{activity.length ? activity.map((row) => <div key={row.id} className="flex gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /><div className="min-w-0"><p className="text-sm font-medium">{row.number ?? "Transaction"} · {row.status ?? "Recorded"}</p><p className="text-xs text-muted-foreground">{dateTimeFmt(row.date)} · {money(row.grand_total ?? row.amount, currency)}</p></div></div>) : <p className="text-sm text-muted-foreground">No transactions yet.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm"><MapPin className="mr-1 inline h-4 w-4" />Addresses</CardTitle></CardHeader><Separator /><CardContent className="grid gap-4"><div><p className="text-xs font-semibold text-muted-foreground">Billing Address</p>{addressLines(record.billing_address).map((line) => <p key={line} className="text-sm">{line}</p>)}{!record.billing_address && <p className="text-sm text-muted-foreground">Not set</p>}</div><div><p className="text-xs font-semibold text-muted-foreground">Shipping / Delivery Address</p>{addressLines(record.shipping_address).map((line) => <p key={line} className="text-sm">{line}</p>)}{!record.shipping_address && <p className="text-sm text-muted-foreground">Not set</p>}</div></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader><Separator /><CardContent><p className="whitespace-pre-wrap text-sm">{record.notes || "No notes added."}</p></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Documents</CardTitle></CardHeader><Separator /><CardContent><AttachmentsPanel entityType={table} entityId={id} /></CardContent></Card></TabsContent>
      {related.map((entry) => <TabsContent key={entry.key} value={entry.key} className="mt-4"><Card><CardHeader><CardTitle className="text-sm">{entry.label}</CardTitle></CardHeader><Separator /><TransactionTable rows={transactionRows[entry.key] ?? []} label={entry.label} currency={currency} /></Card></TabsContent>)}
      <TabsContent value="contacts" className="mt-4"><Card><CardHeader><CardTitle className="text-sm">Contacts</CardTitle></CardHeader><CardContent><Detail label="Primary Contact" value={record.contact_person} /><p className="mt-4 text-sm text-muted-foreground">Additional contacts are not configured for this record.</p></CardContent></Card></TabsContent><TabsContent value="documents" className="mt-4"><Card><CardHeader><CardTitle className="text-sm">Documents</CardTitle></CardHeader><CardContent><AttachmentsPanel entityType={table} entityId={id} /></CardContent></Card></TabsContent><TabsContent value="activity" className="mt-4"><Card><CardHeader><CardTitle className="text-sm">Activity</CardTitle></CardHeader><CardContent className="space-y-4">{activity.length ? activity.map((row) => <div key={row.id} className="border-b pb-3"><p className="text-sm font-medium">{row.number ?? "Transaction"}</p><p className="text-xs text-muted-foreground">{dateTimeFmt(row.date)} · {row.status ?? "Recorded"}</p></div>) : <p className="text-sm text-muted-foreground">No activity yet.</p>}</CardContent></Card></TabsContent><TabsContent value="audit" className="mt-4"><Card><CardHeader><CardTitle className="text-sm"><History className="mr-1 inline h-4 w-4" />Audit Trail</CardTitle></CardHeader><CardContent className="space-y-4">{audit.length ? audit.map((log) => <div key={log.id} className="border-b pb-3"><p className="text-sm font-medium">{log.action} · {log.actor_email ?? "System"}</p><p className="text-xs text-muted-foreground">{dateTimeFmt(log.created_at)}</p></div>) : <p className="text-sm text-muted-foreground">No audit activity yet.</p>}</CardContent></Card></TabsContent>
    </Tabs></div>{isCustomer ? <CustomerCreateEditWindow id={id} fields={fields} open={editOpen} onOpenChange={setEditOpen} onSaved={() => setEditOpen(false)} /> : <SupplierCreateEditModal id={id} fields={fields} open={editOpen} onOpenChange={setEditOpen} onSaved={() => setEditOpen(false)} />}</div>;
}
