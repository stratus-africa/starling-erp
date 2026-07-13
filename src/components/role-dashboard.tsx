import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { ReactNode } from "react";

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)", border: "1px solid var(--border)",
    borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)",
  },
};

interface Metric { label: string; value: string; delta?: string; up?: boolean; icon: LucideIcon }
interface Action { label: string; to: string; icon: LucideIcon }
interface RoleDashboardProps {
  title: string; subtitle: string; metrics: Metric[]; actions: Action[];
  chart: "bar" | "line"; chartTitle: string; chartData: any[];
  listTitle: string; list: { primary: string; secondary: string; status: string; tone?: "success" | "warning" | "info" | "destructive" }[];
}

const toneClass: Record<string, string> = {
  success: "bg-success/15 text-success", warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info", destructive: "bg-destructive/15 text-destructive",
};

export function RoleDashboard({ title, subtitle, metrics, actions, chart, chartTitle, chartData, listTitle, list }: RoleDashboardProps) {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((a) => (
            <Button key={a.label} size="sm" variant="outline" asChild>
              <Link to={a.to}><a.icon className="h-4 w-4 mr-1.5" /> {a.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      <div className={"grid grid-cols-2 gap-3 " + (metrics.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        {metrics.map((m) => (
          <Card key={m.label} className="p-4 border shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{m.label}</span>
              <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                <m.icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-xl font-semibold tabular-nums">{m.value}</div>
            {m.delta && (
              <div className="mt-1 text-xs flex items-center gap-1">
                <span className={"inline-flex items-center gap-0.5 font-medium " + (m.up ? "text-success" : "text-destructive")}>
                  {m.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {m.delta}
                </span>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-4 border shadow-sm lg:col-span-2">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">{chartTitle}</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {chart === "bar" ? (
                <BarChart data={chartData} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="x" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                  <Bar dataKey="a" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="b" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="x" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Line type="monotone" dataKey="a" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="b" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 border shadow-sm">
          <h3 className="text-sm font-semibold mb-3">{listTitle}</h3>
          <div className="space-y-2">
            {list.map((it, i) => (
              <div key={i} className="flex items-start justify-between gap-2 p-2.5 rounded-md hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{it.primary}</p>
                  <p className="text-xs text-muted-foreground truncate">{it.secondary}</p>
                </div>
                <Badge variant="secondary" className={"shrink-0 " + (toneClass[it.tone ?? "info"])}>{it.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function makeChart(labels: string[], a: number[], b: number[]): { x: string; a: number; b: number }[] {
  return labels.map((x, i) => ({ x, a: a[i] ?? 0, b: b[i] ?? 0 }));
}
