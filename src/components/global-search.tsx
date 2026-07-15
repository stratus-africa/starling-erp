import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Loader2 } from "lucide-react";

const MODULES: { key: string; label: string; route: (id: string) => string }[] = [
  { key: "customers",       label: "Customers",       route: () => `/crm/customers` },
  { key: "suppliers",       label: "Suppliers",       route: () => `/purchasing/suppliers` },
  { key: "items",           label: "Items",           route: () => `/inventory/items` },
  { key: "invoices",        label: "Invoices",        route: () => `/sales/invoices` },
  { key: "sales_orders",    label: "Sales Orders",    route: () => `/sales/orders` },
  { key: "sales_quotes",    label: "Quotes",          route: () => `/sales/quotes` },
  { key: "purchase_orders", label: "Purchase Orders", route: () => `/purchasing/orders` },
  { key: "bills",           label: "Bills",           route: () => `/purchasing/bills` },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [modules, setModules] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", q, modules, from, to],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("global_search", {
        q, modules: modules.length ? modules : null,
        date_from: from || null, date_to: to || null, max_per_module: 8,
      });
      if (error) throw error;
      return (data ?? []) as { module: string; id: string; title: string; subtitle: string; created_at: string }[];
    },
  });

  const grouped = (data ?? []).reduce<Record<string, any[]>>((acc, r) => {
    (acc[r.module] ??= []).push(r); return acc;
  }, {});

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="relative hidden md:flex items-center gap-2 h-8 w-72 rounded-md border border-transparent bg-muted/50 hover:bg-muted px-2.5 text-sm text-muted-foreground">
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search customers, invoices, items…</span>
        <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px]">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-sm">Global search</DialogTitle>
          </DialogHeader>
          <div className="border-t px-3 py-2 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search across customers, invoices, items…"
              className="border-0 shadow-none focus-visible:ring-0 h-8" />
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="border-t px-3 py-2 flex flex-wrap items-center gap-1.5">
            {MODULES.map((m) => {
              const on = modules.includes(m.key);
              return (
                <Button key={m.key} size="sm" variant={on ? "default" : "outline"} className="h-6 text-[11px] px-2"
                  onClick={() => setModules((v) => on ? v.filter((x) => x !== m.key) : [...v, m.key])}>
                  {m.label}
                </Button>
              );
            })}
            <div className="ml-auto flex items-center gap-1.5">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 w-32 text-xs" />
              <span className="text-xs text-muted-foreground">→</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 w-32 text-xs" />
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto border-t">
            {q.trim().length < 2 && <div className="p-6 text-center text-sm text-muted-foreground">Type at least 2 characters…</div>}
            {q.trim().length >= 2 && !isFetching && (data?.length ?? 0) === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No matches.</div>
            )}
            {Object.entries(grouped).map(([mod, rows]) => {
              const meta = MODULES.find((m) => m.key === mod);
              return (
                <div key={mod} className="py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                    {meta?.label ?? mod} <Badge variant="secondary" className="ml-1 h-4 text-[10px]">{rows.length}</Badge>
                  </div>
                  {rows.map((r) => (
                    <button key={r.id} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                      onClick={() => { setOpen(false); if (meta) navigate({ to: meta.route(r.id) }); }}>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{r.title}</div>
                        {r.subtitle && <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
