import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import {
  ArrowUpRight, ArrowDownRight, DollarSign, ShoppingCart, Users, Package,
  Plus, FileText, TrendingUp, AlertTriangle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const revenue = [
  { m: "Jan", rev: 214, exp: 148 }, { m: "Feb", rev: 232, exp: 152 },
  { m: "Mar", rev: 258, exp: 168 }, { m: "Apr", rev: 249, exp: 172 },
  { m: "May", rev: 288, exp: 181 }, { m: "Jun", rev: 322, exp: 198 },
  { m: "Jul", rev: 348, exp: 214 },
];

const sales = [
  { d: "Mon", v: 42 }, { d: "Tue", v: 58 }, { d: "Wed", v: 51 },
  { d: "Thu", v: 71 }, { d: "Fri", v: 88 }, { d: "Sat", v: 62 }, { d: "Sun", v: 34 },
];

const stockByWh = [
  { name: "Nairobi", value: 1284 },
  { name: "Mombasa", value: 421 },
  { name: "Cairo", value: 812 },
  { name: "Dubai", value: 348 },
];

const chartColors = ["#2563eb", "#38bdf8", "#22c55e", "#f59e0b", "#ef4444"];

function KpiCard({ label, value, delta, up, icon }: { label: string; value: string; delta: string; up: boolean; icon: ReactNode }) {
  return (
    <Card className="p-4 flex flex-col gap-2 border shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
      </div>
      <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="flex items-center gap-1 text-xs">
        <span className={"inline-flex items-center gap-0.5 font-medium " + (up ? "text-success" : "text-destructive")}>
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {delta}
        </span>
        <span className="text-muted-foreground">vs last month</span>
      </div>
    </Card>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)", border: "1px solid #e5e7eb",
    borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)",
  },
  labelStyle: { color: "#64748b", fontSize: 11 },
};

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Executive Dashboard</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary border-0">Live</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Acme Manufacturing Ltd · Fiscal Year 2026 · <span className="text-foreground">July MTD</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/sales/quotes"><FileText className="h-4 w-4 mr-1.5" /> New Quote</Link></Button>
          <Button size="sm" asChild><Link to="/sales/invoices"><Plus className="h-4 w-4 mr-1.5" /> New Invoice</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Revenue MTD" value="$348,210" delta="+12.4%" up icon={<DollarSign className="h-4 w-4" />} />
        <KpiCard label="Orders" value="1,284" delta="+8.1%" up icon={<ShoppingCart className="h-4 w-4" />} />
        <KpiCard label="Active Customers" value="642" delta="+3.9%" up icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Inventory Value" value="$612,400" delta="-1.8%" up={false} icon={<Package className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-4 lg:col-span-2 border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold">Revenue vs Expenses</h3>
              <p className="text-xs text-muted-foreground">Last 7 months · thousands (USD)</p>
            </div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="m" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="rev" stroke="#2563eb" strokeWidth={2} fill="url(#revG)" name="Revenue" />
                <Area type="monotone" dataKey="exp" stroke="#ef4444" strokeWidth={2} fill="url(#expG)" name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 border shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Stock by Warehouse</h3>
            <p className="text-xs text-muted-foreground">Item count</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stockByWh} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {stockByWh.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-4 border shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold">Sales Volume</h3>
              <p className="text-xs text-muted-foreground">This week</p>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sales} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="d" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="v" fill="#2563eb" radius={[4, 4, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Alerts</h3>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <div className="space-y-2.5">
            {[
              { t: "Sahara Motors invoice overdue", s: "$210,500 · 7 days late", type: "destructive" },
              { t: "Low stock: Corrugated Box 60cm", s: "240 pc · reorder at 500", type: "warning" },
              { t: "PR-2026-0088 awaiting approval", s: "Production · $34,200", type: "info" },
              { t: "Bank reconciliation pending", s: "USD Trade · Jun 2026", type: "info" },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-md hover:bg-muted/40 transition-colors">
                <div className={"mt-1 h-1.5 w-1.5 rounded-full " + (
                  a.type === "destructive" ? "bg-destructive" : a.type === "warning" ? "bg-warning" : "bg-info"
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.t}</p>
                  <p className="text-xs text-muted-foreground">{a.s}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4 border shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Top Customers</h3>
            <p className="text-xs text-muted-foreground">By revenue · MTD</p>
          </div>
          <div className="space-y-2">
            {[
              { n: "Sahara Motors", v: 210500, p: 100 },
              { n: "Kilimanjaro Coffee Co.", v: 142800, p: 68 },
              { n: "Blue Ocean Logistics", v: 96400, p: 46 },
              { n: "Nairobi Traders Ltd", v: 48450, p: 23 },
              { n: "Rift Valley Foods", v: 24300, p: 12 },
            ].map((c) => (
              <div key={c.n} className="flex items-center gap-3">
                <div className="w-40 text-sm truncate">{c.n}</div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: c.p + "%" }} />
                </div>
                <div className="w-24 text-right text-sm font-mono tabular-nums">${c.v.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 border shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Cashflow Trend</h3>
            <p className="text-xs text-muted-foreground">Net cash · thousands (USD)</p>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenue} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="m" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="rev" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="Inflow" />
                <Line type="monotone" dataKey="exp" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Outflow" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
