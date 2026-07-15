import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ShieldAlert, ShieldCheck } from "lucide-react";

const ACTION_TONE: Record<string, string> = {
  INSERT: "bg-success/15 text-success",
  UPDATE: "bg-info/15 text-info",
  DELETE: "bg-destructive/15 text-destructive",
  SOFT_DELETE: "bg-warning/15 text-warning",
  RESTORE: "bg-success/15 text-success",
};

function AuditPage() {
  const { hasRole } = useAuth();
  const allowed = hasRole(["tenant_admin", "super_admin"]);
  const [action, setAction] = useState<string>("all");
  const [table, setTable] = useState<string>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<any | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["audit", { action, table, q, from, to }],
    enabled: allowed,
    queryFn: async () => {
      let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500);
      if (action !== "all") query = query.eq("action", action);
      if (table !== "all") query = query.eq("table_name", table);
      if (q.trim()) query = query.ilike("actor_email", `%${q.trim()}%`);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to + "T23:59:59");
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!allowed) {
    return (
      <div className="p-6"><Card className="p-8 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Admin access required.</p>
      </Card></div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Audit Logs
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Who did what and when, including soft-deletes and restorations.</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 bg-muted/30">
          <Input placeholder="Filter by actor email…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-56 text-sm" />
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.keys(ACTION_TONE).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={table} onValueChange={setTable}>
            <SelectTrigger className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tables</SelectItem>
              {["customers","suppliers","items","invoices","sales_orders","sales_quotes","purchase_orders","bills","payments_received","payments_made","warehouses","chart_of_accounts","bank_accounts","journal_entries","inventory_adjustments","inventory_transfers","bom_headers","production_orders"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-sm" />
          <div className="ml-auto text-xs text-muted-foreground">{data.length} events</div>
        </div>

        <Table>
          <TableHeader><TableRow className="bg-muted/20">
            <TableHead>When</TableHead><TableHead>Actor</TableHead>
            <TableHead>Action</TableHead><TableHead>Table</TableHead>
            <TableHead>Record</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No events.</TableCell></TableRow>}
            {data.map((r: any) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDetail(r)}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{r.actor_email ?? "—"}</TableCell>
                <TableCell><Badge variant="secondary" className={"font-medium " + (ACTION_TONE[r.action] ?? "")}>{r.action}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{r.table_name}</TableCell>
                <TableCell className="font-mono text-[10px] text-muted-foreground">{r.record_id?.slice(0,8)}…</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Audit event</SheetTitle>
            <SheetDescription>{detail && `${detail.action} on ${detail.table_name} · ${new Date(detail.created_at).toLocaleString()}`}</SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="grid gap-3 mt-4 px-4 pb-6">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><div className="text-muted-foreground">Actor</div><div>{detail.actor_email ?? "—"}</div></div>
                <div><div className="text-muted-foreground">Record</div><div className="font-mono">{detail.record_id}</div></div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Before</div>
                <pre className="text-[11px] bg-muted/40 rounded p-2 overflow-auto max-h-64">{JSON.stringify(detail.old_data, null, 2)}</pre>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">After</div>
                <pre className="text-[11px] bg-muted/40 rounded p-2 overflow-auto max-h-64">{JSON.stringify(detail.new_data, null, 2)}</pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/super-admin/audit")({ component: AuditPage });
