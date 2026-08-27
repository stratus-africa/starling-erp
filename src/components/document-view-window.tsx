import { useEffect, useMemo, useState } from "react";
import { useModuleList } from "@/hooks/use-module-data";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DocumentEditor, type DocKind } from "@/components/document-editor";
import type { FieldDef } from "@/components/data-module-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Loader2 } from "lucide-react";

const statusVariant: Record<string, string> = {
  Draft: "text-muted-foreground",
  Sent: "text-info",
  Accepted: "text-success",
  Approved: "text-info",
  Paid: "text-success",
  Posted: "text-success",
  Overdue: "text-destructive",
  Rejected: "text-destructive",
  Cancelled: "text-destructive",
  Invoiced: "text-success",
};

const money = (value: any, currency: any) =>
  value == null ? "—" : `${currency ?? "USD"} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DocumentViewWindow({
  kind, title, description, table, fields, searchColumn = "number", filters = [],
}: {
  kind: DocKind;
  title: string;
  description: string;
  table: string;
  fields: FieldDef[];
  searchColumn?: string;
  filters?: { key: string; label: string; options: string[] }[];
}) {
  const { hasRole } = useAuth();
  const canWrite = hasRole(["tenant_admin", "super_admin", "sales", "accounting"] as any);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const pageSize = 25;
  const { data, isLoading } = useModuleList(table, {
    search, searchColumn, page, pageSize, orderBy: "created_at", orderAsc: false, filters: filterValues,
  });
  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const customerIds = useMemo(() => Array.from(new Set(rows.map((r: any) => r.customer_id).filter(Boolean))), [rows]);
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "document-list-names", customerIds],
    enabled: customerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name").in("id", customerIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });
  const customerNames = useMemo(() => Object.fromEntries(customers.map((c: any) => [c.id, c.name])), [customers]);

  useEffect(() => {
    if (!creating && selectedId == null && rows[0]?.id) setSelectedId(rows[0].id);
  }, [rows, selectedId, creating]);

  const selectRow = (id: string) => { setCreating(false); setSelectedId(id); };
  const newDocument = () => { setCreating(true); setSelectedId(null); };

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden p-3 md:p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={newDocument}><Plus className="mr-1.5 h-4 w-4" /> New {kind === "order" ? "Sales Order" : title.slice(0, -1)}</Button>
        )}
      </div>

      <Card className="flex min-h-0 flex-1 overflow-hidden p-0">
        <aside className="flex w-[310px] shrink-0 flex-col border-r bg-background">
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 pl-8 text-xs" placeholder={`Search ${searchColumn}…`} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            {filters.length > 0 && <div className="flex gap-2">
              {filters.map((f) => <Select key={f.key} value={filterValues[f.key] ?? "all"} onValueChange={(v) => { setFilterValues((p) => ({ ...p, [f.key]: v })); setPage(1); }}>
                <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder={f.label} /></SelectTrigger>
                <SelectContent><SelectItem value="all">All {f.label}</SelectItem>{f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>)}
            </div>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && <div className="flex justify-center p-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
            {!isLoading && rows.length === 0 && <div className="p-8 text-center text-xs text-muted-foreground">No documents found.</div>}
            {rows.map((row: any) => {
              const active = selectedId === row.id && !creating;
              return <button key={row.id} type="button" onClick={() => selectRow(row.id)} className={`w-full border-b px-3 py-3 text-left transition-colors hover:bg-muted/40 ${active ? "bg-muted/60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{row.number || "Untitled"}</span>
                  <span className="shrink-0 font-mono text-xs">{money(row.grand_total ?? row.amount, row.currency)}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{row.customer_name || customerNames[row.customer_id] || row.customer_id || "No customer"}</div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{row.date ? new Date(row.date).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                  {row.status && <Badge variant="outline" className={`border-0 p-0 text-[10px] ${statusVariant[row.status] ?? "text-muted-foreground"}`}>{row.status.toUpperCase()}</Badge>}
                </div>
              </button>;
            })}
          </div>
          <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span>Page {page} · {total}</span>
            <div className="flex gap-1"><Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button><Button variant="outline" size="sm" className="h-7 px-2" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>›</Button></div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-muted/10">
          {creating ? (
            <DocumentEditor kind={kind} id="new" embedded onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); setSelectedId(id); }} />
          ) : selectedId ? (
            <DocumentEditor key={selectedId} kind={kind} id={selectedId} embedded onClose={() => setSelectedId(null)} />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">Select a document from the list.</div>
          )}
        </main>
      </Card>
    </div>
  );
}
