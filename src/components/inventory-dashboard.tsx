/**
 * InventoryDashboard
 *
 * All data is fetched from get_inventory_dashboard() RPC — no mocks.
 * Sections:
 *   1. KPI cards (12 headline numbers)
 *   2. 30-day movement trend chart (inbound vs outbound)
 *   3. Warehouse distribution bar chart
 *   4. Inventory valuation by category
 *   5. Low stock alerts
 *   6. Out of stock items
 *   7. Pending transfers
 *   8. Pending adjustments
 *   9. Recent stock movements
 *  10. Slow-moving inventory
 *  11. Top items by value
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  useInventoryDashboard,
  type LowStockItem,
  type OutOfStockItem,
  type PendingTransfer,
  type PendingAdjustment,
  type RecentMovement,
  type SlowMovingItem,
  type TopItem,
  type ValuationByCategory,
  type WarehouseDist,
} from "@/hooks/use-inventory-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Layers,
  Loader2,
  Lock,
  Package,
  PackagePlus,
  RefreshCw,
  ShoppingCart,
  Snail,
  TrendingDown,
  TrendingUp,
  Warehouse,
  XCircle,
  Timer,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Formatting helpers ───────────────────────────────────────────────────────

const money = (v: number | null | undefined, compact = false) => {
  const n = Number(v ?? 0);
  if (compact) {
    if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  }
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const num = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const compactNum = (v: number | null | undefined) => {
  const n = Number(v ?? 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
};

const fmtDateTime = (v: string | null) =>
  !v
    ? "—"
    : new Date(v).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

const fmtDate = (v: string | null) =>
  !v
    ? "—"
    : new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

const REF_LABELS: Record<string, string> = {
  bill: "Purchase In",
  invoice: "Sale Out",
  package: "Package Out",
  shipment: "Shipment Out",
  adjustment: "Adjustment",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  production_consume: "Prod. Consume",
  production_receive: "Prod. Receive",
  credit_note: "Credit Return",
  opening_balance: "Opening Balance",
  reversal: "Reversal",
};

// Recharts tooltip styles matching the design system
const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--popover-foreground)",
    boxShadow: "0 4px 12px rgba(0,0,0,.08)",
  },
};

// Palette for charts
const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
];

// ─── KPI card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  href?: string;
}

function KpiCard({ label, value, sub, icon: Icon, tone = "default", href }: KpiCardProps) {
  const iconBg: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    info: "bg-info/10 text-info",
  };
  const valColor: Record<string, string> = {
    default: "",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    info: "text-info",
  };

  const inner = (
    <Card className="border shadow-sm hover:border-primary/40 transition-colors h-full">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight">
            {label}
          </span>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg[tone]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${valColor[tone]}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {href && (
          <div className="mt-2 flex items-center gap-1 text-[11px] text-primary font-medium">
            View details <ArrowRight className="h-3 w-3" />
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link to={href as any} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  count,
  href,
  action,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
        {count !== undefined && (
          <span className="ml-1 inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </h2>
      {href && (
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
          <Link to={href as any}>
            {action ?? "View all"} <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
      <Icon className="h-7 w-7 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InventoryDashboard() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useInventoryDashboard();
  const [activeSection, setActiveSection] = useState<"low_stock" | "out_of_stock">("low_stock");

  const kpis = data?.kpis;
  const trend = data?.movement_trend ?? [];
  const warehouseDist = data?.warehouse_dist ?? [];
  const lowStock = data?.low_stock ?? [];
  const outOfStock = data?.out_of_stock ?? [];
  const pendingTransfers = data?.pending_transfers ?? [];
  const pendingAdj = data?.pending_adjustments ?? [];
  const recentMovements = data?.recent_movements ?? [];
  const slowMoving = data?.slow_moving ?? [];
  const topItems = data?.top_items ?? [];
  const valByCat = data?.valuation_by_category ?? [];

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Boxes className="h-6 w-6" />
            Inventory Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live stock levels, movements, and alerts across all warehouses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Updated {lastUpdated}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/inventory/items">
              <Package className="h-3.5 w-3.5 mr-1.5" />
              All Items
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Loading overlay ──────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* ── Section 1: KPIs ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <KpiCard
              label="Inventory Value"
              value={money(kpis?.total_value, true)}
              sub={`${num(kpis?.total_skus)} SKUs tracked`}
              icon={DollarSign}
              href="/inventory/items"
            />
            <KpiCard
              label="Units On Hand"
              value={compactNum(kpis?.total_units)}
              sub="Across all warehouses"
              icon={Boxes}
            />
            <KpiCard
              label="Available"
              value={compactNum(kpis?.available_units)}
              sub={`${num(kpis?.reserved_units)} reserved`}
              icon={CheckCircle2}
              tone="success"
            />
            <KpiCard
              label="Reserved"
              value={compactNum(kpis?.reserved_units)}
              sub="Active reservations"
              icon={Lock}
              tone="info"
            />
            <KpiCard
              label="Low Stock"
              value={String(kpis?.low_stock_count ?? 0)}
              sub="At or below reorder point"
              icon={AlertTriangle}
              tone={(kpis?.low_stock_count ?? 0) > 0 ? "warning" : "default"}
              href="/inventory/items"
            />
            <KpiCard
              label="Out of Stock"
              value={String(kpis?.out_of_stock_count ?? 0)}
              sub="Active items, zero stock"
              icon={XCircle}
              tone={(kpis?.out_of_stock_count ?? 0) > 0 ? "destructive" : "default"}
              href="/inventory/items"
            />
            <KpiCard
              label="Items on Order"
              value={compactNum(kpis?.items_on_order)}
              sub="Open purchase orders"
              icon={ShoppingCart}
              tone="info"
              href="/purchasing/orders"
            />
            <KpiCard
              label="Pending Transfers"
              value={String(kpis?.pending_transfers ?? 0)}
              sub="Awaiting completion"
              icon={ArrowLeftRight}
              tone={(kpis?.pending_transfers ?? 0) > 0 ? "warning" : "default"}
              href="/inventory/transfers"
            />
            <KpiCard
              label="Pending Adjustments"
              value={String(kpis?.pending_adjustments ?? 0)}
              sub="Draft, not yet posted"
              icon={PackagePlus}
              tone={(kpis?.pending_adjustments ?? 0) > 0 ? "warning" : "default"}
              href="/inventory/adjustments"
            />
            <KpiCard
              label="Slow Moving"
              value={String(kpis?.slow_moving_count ?? 0)}
              sub="No inbound in 90 days"
              icon={Snail}
              tone={(kpis?.slow_moving_count ?? 0) > 0 ? "warning" : "default"}
            />
            <KpiCard
              label="Expiry Tracked"
              value={String(kpis?.expiry_tracked_count ?? 0)}
              sub="Items with expiry tracking"
              icon={Timer}
              tone="info"
            />
            <KpiCard
              label="Total SKUs"
              value={num(kpis?.total_skus)}
              sub="Active inventory items"
              icon={Layers}
              href="/inventory/items"
            />
          </div>

          {/* ── Section 2 + 3: Charts row ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Movement trend — 30 day */}
            <Card className="lg:col-span-2 border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    30-Day Stock Movement Trend
                  </CardTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--chart-1))]" />
                      Inbound
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--chart-2))]" />
                      Outbound
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {trend.length === 0 ? (
                  <EmptyState icon={BarChart3} message="No movement data yet." />
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
                        <defs>
                          <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="outboundGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis
                          dataKey="x"
                          stroke="var(--muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          stroke="var(--muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          width={40}
                        />
                        <Tooltip {...TOOLTIP_STYLE} />
                        <Area
                          type="monotone"
                          dataKey="inbound"
                          stroke="hsl(var(--chart-1))"
                          strokeWidth={2}
                          fill="url(#inboundGrad)"
                          dot={false}
                          name="Inbound"
                        />
                        <Area
                          type="monotone"
                          dataKey="outbound"
                          stroke="hsl(var(--chart-2))"
                          strokeWidth={2}
                          fill="url(#outboundGrad)"
                          dot={false}
                          name="Outbound"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Warehouse distribution */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  Warehouse Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {warehouseDist.length === 0 ? (
                  <EmptyState icon={Warehouse} message="No warehouse stock recorded." />
                ) : (
                  <div className="h-56 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={warehouseDist}
                          dataKey="value"
                          nameKey="warehouse_name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={40}
                          paddingAngle={2}
                        >
                          {warehouseDist.map((_, idx) => (
                            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          {...TOOLTIP_STYLE}
                          formatter={(v: any) => money(v, true)}
                        />
                        <Legend
                          formatter={(v) => <span className="text-xs">{v}</span>}
                          iconType="circle"
                          iconSize={8}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Section 4: Inventory valuation by category ──────────────────── */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <SectionHeader icon={DollarSign} title="Inventory Valuation by Category" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {valByCat.length === 0 ? (
                <EmptyState icon={DollarSign} message="No inventory value recorded yet." />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                  {/* Bar chart */}
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={valByCat}
                        layout="vertical"
                        margin={{ left: 0, right: 24, top: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                        <XAxis
                          type="number"
                          stroke="var(--muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => money(v, true)}
                        />
                        <YAxis
                          type="category"
                          dataKey="category"
                          width={90}
                          stroke="var(--muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          {...TOOLTIP_STYLE}
                          formatter={(v: any) => [money(v), "Value"]}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Value">
                          {valByCat.map((_, idx) => (
                            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20">
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs text-right">SKUs</TableHead>
                          <TableHead className="text-xs text-right">Units</TableHead>
                          <TableHead className="text-xs text-right">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {valByCat.map((row: ValuationByCategory, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm font-medium">
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="inline-block h-2 w-2 rounded-full shrink-0"
                                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                                />
                                {row.category}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{row.sku_count}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">{num(row.units)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm font-semibold">
                              {money(row.value, true)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Section 5 + 6: Low stock / Out of stock (tabbed) ────────────── */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-0 pt-4 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 border-b w-full pb-0">
                  <button
                    type="button"
                    onClick={() => setActiveSection("low_stock")}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeSection === "low_stock"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5" />
                    Low Stock Alerts
                    {lowStock.length > 0 && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-warning/15 text-warning px-1.5 py-0.5 text-xs font-medium">
                        {lowStock.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection("out_of_stock")}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeSection === "out_of_stock"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <XCircle className="inline h-3.5 w-3.5 mr-1.5" />
                    Out of Stock
                    {outOfStock.length > 0 && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-destructive/15 text-destructive px-1.5 py-0.5 text-xs font-medium">
                        {outOfStock.length}
                      </span>
                    )}
                  </button>
                  <div className="ml-auto pb-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
                      <Link to="/inventory/items">
                        View all items <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-0 pb-0">
              {activeSection === "low_stock" && (
                <>
                  {lowStock.length === 0 ? (
                    <div className="px-4 py-6">
                      <EmptyState icon={CheckCircle2} message="All items are above their reorder points." />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/20">
                            <TableHead className="text-xs pl-4">Item</TableHead>
                            <TableHead className="text-xs">SKU</TableHead>
                            <TableHead className="text-xs text-right">On Hand</TableHead>
                            <TableHead className="text-xs text-right">Reorder Point</TableHead>
                            <TableHead className="text-xs w-40">Stock Level</TableHead>
                            <TableHead className="text-xs">UoM</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lowStock.map((item: LowStockItem) => (
                            <TableRow key={item.item_id} className="hover:bg-muted/30">
                              <TableCell className="pl-4">
                                <Link
                                  to={`/inventory/items/${item.item_id}` as any}
                                  className="text-sm font-medium hover:underline"
                                >
                                  {item.name}
                                </Link>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {item.sku ?? "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-sm font-semibold text-warning">
                                {num(item.on_hand)}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                                {num(item.reorder)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress
                                    value={Math.min(100, Number(item.pct))}
                                    className="h-1.5 flex-1 [&>div]:bg-warning"
                                  />
                                  <span className="text-xs tabular-nums text-muted-foreground w-9 text-right">
                                    {item.pct}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.uom ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}

              {activeSection === "out_of_stock" && (
                <>
                  {outOfStock.length === 0 ? (
                    <div className="px-4 py-6">
                      <EmptyState icon={CheckCircle2} message="No active items are out of stock." />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/20">
                            <TableHead className="text-xs pl-4">Item</TableHead>
                            <TableHead className="text-xs">SKU</TableHead>
                            <TableHead className="text-xs text-right">On Hand</TableHead>
                            <TableHead className="text-xs text-right">Reorder Point</TableHead>
                            <TableHead className="text-xs">Last Sale</TableHead>
                            <TableHead className="text-xs">UoM</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {outOfStock.map((item: OutOfStockItem) => (
                            <TableRow key={item.item_id} className="hover:bg-muted/30">
                              <TableCell className="pl-4">
                                <Link
                                  to={`/inventory/items/${item.item_id}` as any}
                                  className="text-sm font-medium hover:underline"
                                >
                                  {item.name}
                                </Link>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {item.sku ?? "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-sm font-semibold text-destructive">
                                {num(item.on_hand)}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                                {item.reorder != null ? num(item.reorder) : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {item.last_sale ? fmtDateTime(item.last_sale) : "Never sold"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.uom ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Section 7 + 8: Pending transfers & adjustments ──────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pending transfers */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <SectionHeader
                  icon={ArrowLeftRight}
                  title="Pending Transfers"
                  count={pendingTransfers.length}
                  href="/inventory/transfers"
                />
              </CardHeader>
              <CardContent className="p-0">
                {pendingTransfers.length === 0 ? (
                  <div className="px-4 pb-4">
                    <EmptyState icon={CheckCircle2} message="No pending stock transfers." />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20">
                          <TableHead className="text-xs pl-4">#</TableHead>
                          <TableHead className="text-xs">Item</TableHead>
                          <TableHead className="text-xs">Route</TableHead>
                          <TableHead className="text-xs text-right">Qty</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingTransfers.map((t: PendingTransfer) => (
                          <TableRow key={t.id} className="hover:bg-muted/30">
                            <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                              {t.number}
                            </TableCell>
                            <TableCell className="text-sm font-medium max-w-[140px] truncate">
                              {t.item_name ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <span>{t.from_wh ?? "—"}</span>
                              <ArrowRight className="inline h-3 w-3 mx-1" />
                              <span>{t.to_wh ?? "—"}</span>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              {num(t.quantity)}
                              {t.uom && <span className="ml-1 text-muted-foreground text-xs">{t.uom}</span>}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={
                                  t.status === "In Transit"
                                    ? "bg-info/15 text-info border-0 text-xs"
                                    : "bg-muted text-muted-foreground text-xs"
                                }
                              >
                                {t.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending adjustments */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <SectionHeader
                  icon={PackagePlus}
                  title="Pending Adjustments"
                  count={pendingAdj.length}
                  href="/inventory/adjustments"
                />
              </CardHeader>
              <CardContent className="p-0">
                {pendingAdj.length === 0 ? (
                  <div className="px-4 pb-4">
                    <EmptyState icon={CheckCircle2} message="No draft adjustments awaiting posting." />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20">
                          <TableHead className="text-xs pl-4">#</TableHead>
                          <TableHead className="text-xs">Item</TableHead>
                          <TableHead className="text-xs">Warehouse</TableHead>
                          <TableHead className="text-xs text-right">Qty</TableHead>
                          <TableHead className="text-xs">Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingAdj.map((a: PendingAdjustment) => (
                          <TableRow key={a.id} className="hover:bg-muted/30">
                            <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                              {a.number}
                            </TableCell>
                            <TableCell className="text-sm font-medium max-w-[140px] truncate">
                              {a.item_name ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[100px]">
                              {a.warehouse ?? "—"}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono tabular-nums text-sm font-semibold ${
                                Number(a.quantity) >= 0 ? "text-success" : "text-destructive"
                              }`}
                            >
                              {Number(a.quantity) >= 0 ? "+" : ""}
                              {num(a.quantity)}
                              {a.uom && <span className="ml-1 text-muted-foreground text-xs">{a.uom}</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {a.reason ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Section 9: Recent stock movements ───────────────────────────── */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <SectionHeader
                icon={TrendingUp}
                title="Recent Stock Movements"
                count={recentMovements.length}
                href="/inventory/ledger"
                action="Full ledger"
              />
            </CardHeader>
            <CardContent className="p-0">
              {recentMovements.length === 0 ? (
                <div className="px-4 pb-4">
                  <EmptyState icon={TrendingUp} message="No stock movements recorded yet." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs pl-4">Date</TableHead>
                        <TableHead className="text-xs">Item</TableHead>
                        <TableHead className="text-xs">Warehouse</TableHead>
                        <TableHead className="text-xs">Bin</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs text-right w-24">In</TableHead>
                        <TableHead className="text-xs text-right w-24">Out</TableHead>
                        <TableHead className="text-xs text-right w-28">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentMovements.map((m: RecentMovement) => {
                        const q = Number(m.quantity);
                        const isIn = q > 0;
                        return (
                          <TableRow key={m.id} className="hover:bg-muted/30">
                            <TableCell className="pl-4 text-xs text-muted-foreground whitespace-nowrap">
                              {fmtDateTime(m.created_at)}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{m.item_name ?? "—"}</div>
                              {m.item_sku && (
                                <div className="text-xs text-muted-foreground font-mono">{m.item_sku}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{m.warehouse ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {m.location_code ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={isIn ? "secondary" : "outline"}
                                className="text-xs whitespace-nowrap"
                              >
                                {isIn ? (
                                  <ArrowUpRight className="h-3 w-3 mr-1 text-success" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3 mr-1 text-destructive" />
                                )}
                                {REF_LABELS[m.ref_type] ?? m.ref_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-success text-sm">
                              {isIn ? num(Math.abs(q)) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-destructive text-sm">
                              {!isIn ? num(Math.abs(q)) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              {money(Math.abs(q * Number(m.unit_cost || 0)), true)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Section 10 + 11: Slow-moving & Top items ────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Slow-moving */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <SectionHeader
                  icon={Snail}
                  title="Slow-Moving Inventory"
                  count={slowMoving.length}
                />
              </CardHeader>
              <CardContent className="p-0">
                {slowMoving.length === 0 ? (
                  <div className="px-4 pb-4">
                    <EmptyState icon={CheckCircle2} message="No slow-moving items in the last 90 days." />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20">
                          <TableHead className="text-xs pl-4">Item</TableHead>
                          <TableHead className="text-xs text-right">On Hand</TableHead>
                          <TableHead className="text-xs text-right">Value</TableHead>
                          <TableHead className="text-xs">Last Movement</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {slowMoving.map((item: SlowMovingItem) => (
                          <TableRow key={item.item_id} className="hover:bg-muted/30">
                            <TableCell className="pl-4">
                              <Link
                                to={`/inventory/items/${item.item_id}` as any}
                                className="text-sm font-medium hover:underline"
                              >
                                {item.name}
                              </Link>
                              {item.sku && (
                                <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              {num(item.on_hand)}
                              {item.uom && (
                                <span className="ml-1 text-muted-foreground text-xs">{item.uom}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm font-semibold">
                              {money(item.value, true)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.last_movement ? fmtDate(item.last_movement) : "Never"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top items by value */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <SectionHeader
                  icon={TrendingDown}
                  title="Top Items by Value"
                  count={topItems.length}
                  href="/inventory/items"
                />
              </CardHeader>
              <CardContent className="p-0">
                {topItems.length === 0 ? (
                  <div className="px-4 pb-4">
                    <EmptyState icon={Package} message="No inventory value recorded yet." />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20">
                          <TableHead className="text-xs pl-4">Item</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs text-right">On Hand</TableHead>
                          <TableHead className="text-xs text-right">Avg Cost</TableHead>
                          <TableHead className="text-xs text-right">Total Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topItems.map((item: TopItem, idx) => (
                          <TableRow key={item.item_id} className="hover:bg-muted/30">
                            <TableCell className="pl-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">
                                  {idx + 1}.
                                </span>
                                <div>
                                  <Link
                                    to={`/inventory/items/${item.item_id}` as any}
                                    className="text-sm font-medium hover:underline"
                                  >
                                    {item.name}
                                  </Link>
                                  {item.sku && (
                                    <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.type ? (
                                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.type}</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              {num(item.on_hand)}
                              {item.uom && (
                                <span className="ml-1 text-muted-foreground text-xs">{item.uom}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                              {money(item.cost, true)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm font-bold">
                              {money(item.value, true)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Section: Warehouse utilisation detail ────────────────────────── */}
          {warehouseDist.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <SectionHeader
                  icon={Warehouse}
                  title="Warehouse Utilisation"
                  count={warehouseDist.length}
                  href="/inventory/warehouses"
                />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {warehouseDist.map((wh: WarehouseDist, idx) => {
                    const totalValue = warehouseDist.reduce((s, w) => s + Number(w.value), 0);
                    const pct = totalValue > 0 ? Math.round((Number(wh.value) / totalValue) * 100) : 0;
                    return (
                      <div key={wh.warehouse_id ?? idx} className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="inline-block h-3 w-3 rounded-full shrink-0"
                              style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
                            />
                            <span className="text-sm font-medium truncate">
                              {wh.warehouse_name ?? "Unknown"}
                            </span>
                          </div>
                          {wh.warehouse_code && (
                            <span className="font-mono text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded border shrink-0">
                              {wh.warehouse_code}
                            </span>
                          )}
                        </div>
                        <div className="text-xl font-bold tabular-nums">{money(wh.value, true)}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {num(wh.on_hand)} units · {pct}% of total
                        </div>
                        <Progress
                          value={pct}
                          className="h-1.5 mt-2"
                          style={{ "--progress-color": CHART_COLORS[idx % CHART_COLORS.length] } as any}
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
