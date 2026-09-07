import { useQuery } from "@tanstack/react-query";
import { BarChart3, ClipboardList, CreditCard, FileCheck2, PackageCheck, Receipt, WalletCards } from "lucide-react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export function PurchasesDashboardPage() {
  const { tenant } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["purchases-dashboard", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await db.rpc("get_purchases_dashboard", { _date_from: null, _date_to: null, _currency: tenant?.currency ?? null });
      if (error) throw error;
      return data as Record<string, any>;
    },
  });
  const kpis = data?.kpis ?? {};
  const aging = data?.ap_aging ?? {};
  const funnel = data?.funnel ?? {};
  const money = (value: number) => `${tenant?.currency ?? "KES"} ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const cards = [
    ["Purchase Spend Today", money(kpis.purchase_spend_today), WalletCards],
    ["Purchase Spend MTD", money(kpis.purchase_spend_mtd), WalletCards],
    ["Open Purchase Orders", kpis.open_purchase_orders, ClipboardList],
    ["Pending Requisitions", kpis.pending_requisitions, ClipboardList],
    ["Pending Approvals", kpis.pending_approvals, FileCheck2],
    ["Orders Awaiting Receipt", kpis.orders_awaiting_receipt, PackageCheck],
    ["Orders Awaiting Bills", kpis.orders_awaiting_bills, Receipt],
    ["Outstanding AP", money(kpis.outstanding_ap), CreditCard],
    ["Overdue AP", money(kpis.overdue_ap), CreditCard],
    ["Unallocated Payments", money(kpis.unallocated_supplier_payments), CreditCard],
    ["Open Commitments", money(kpis.open_commitments), BarChart3],
    ["Expense Spend MTD", money(kpis.expense_spend_mtd), WalletCards],
    ["Outstanding Reimbursements", money(kpis.outstanding_reimbursements), WalletCards],
  ] as const;
  return <div className="min-h-full bg-muted/20 p-6"><div className="mx-auto max-w-[1500px] space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">Purchases / Overview</p><h1 className="text-2xl font-bold">Purchasing Dashboard</h1><p className="text-sm text-muted-foreground">Procure-to-pay, accounts payable, and expense health.</p></div><div className="flex gap-2"><Button variant="outline" asChild><Link to="/purchasing/requisitions">Requisitions</Link></Button><Button variant="outline" asChild><Link to="/purchasing/bills">Supplier Bills</Link></Button><Button asChild><Link to="/reports/purchases">Reports</Link></Button></div></div>{error && <Card className="p-4 text-sm text-destructive">Unable to load purchasing dashboard: {(error as Error).message}</Card>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{cards.map(([label, value, Icon]) => <Card className="p-4" key={label}><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4 text-primary" /></div><div className="mt-3 font-mono text-xl font-bold">{isLoading ? "—" : String(value)}</div></Card>)}</div><div className="grid gap-5 lg:grid-cols-2"><DashboardTable title="Purchase Trend" rows={data?.purchase_trend ?? []} labelKey="period" valueKey="spend" money={money} /><DashboardTable title="Supplier Spend" rows={data?.supplier_spend ?? []} labelKey="supplier" valueKey="spend" money={money} /><DashboardTable title="AP Aging" rows={Object.entries(aging).map(([bucket, value]) => ({ bucket, value }))} labelKey="bucket" valueKey="value" money={money} /><DashboardTable title="Procurement Funnel" rows={Object.entries(funnel).map(([stage, value]) => ({ stage, value }))} labelKey="stage" valueKey="value" money={(value) => Number(value ?? 0).toLocaleString()} /><DashboardTable title="Expense Spend" rows={data?.expense_by_category ?? []} labelKey="category" valueKey="spend" money={money} /><Card className="p-5"><h2 className="mb-4 text-sm font-semibold">3-Way Match Exceptions</h2><div className="font-mono text-3xl font-bold text-destructive">{data?.match_exceptions ?? 0}</div><p className="mt-1 text-xs text-muted-foreground">Bills requiring review before posting.</p><Button className="mt-4" variant="outline" asChild><Link to="/reports/purchases/matching">Review matching report</Link></Button></Card></div></div></div>;
}

function DashboardTable({ title, rows, labelKey, valueKey, money }: { title: string; rows: Record<string, any>[]; labelKey: string; valueKey: string; money: (value: any) => string }) { const max = Math.max(...rows.map((row) => Number(row[valueKey] ?? 0)), 1); return <Card className="p-5"><h2 className="mb-4 text-sm font-semibold">{title}</h2>{rows.length ? <div className="space-y-3">{rows.slice(0, 8).map((row, index) => <div key={`${row[labelKey]}-${index}`}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{String(row[labelKey] ?? "—")}</span><span className="font-mono">{money(row[valueKey])}</span></div><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(3, Math.min(100, Number(row[valueKey] ?? 0) / max * 100))}%` }} /></div></div>)}</div> : <p className="text-sm text-muted-foreground">No data for this period.</p>}</Card>; }