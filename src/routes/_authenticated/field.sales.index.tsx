import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FieldHeader, SearchBar, Chips, Row, Loading, Empty, ErrorBox, NoAccess, Fab, StatusPill, useFieldAccess, money } from "@/components/field/field-ui";
import { dbMinor } from "@/lib/field-money";

export const Route = createFileRoute("/_authenticated/field/sales/")({
  validateSearch: (s: Record<string, unknown>): { tab?: "quote" | "order" } => (s.tab === "order" || s.tab === "quote" ? { tab: s.tab } : {}),
  head: () => ({ meta: [{ title: "Sales — Field Sales" }] }),
  component: SalesList,
});

function SalesList() {
  const a = useFieldAccess();
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const kind = search.tab ?? "quote";
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  const [sort, setSort] = useState<"newest" | "total" | "oldest">("newest");
  const table = kind === "quote" ? "sales_quotes" : "sales_orders";
  const dateCol = kind === "quote" ? "expiry" : "promised_date";
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: [table, "field-list"], enabled: a.sales,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(table).select(`id,number,date,${dateCol},status,grand_total,currency,created_at,customers(name)`).is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const statuses = useMemo(() => Array.from(new Set(data.map((d) => d.status ?? "Draft"))), [data]);
  const list = useMemo(() => {
    const s = q.toLowerCase();
    let r = data.filter((d) => (st === "all" || (d.status ?? "Draft") === st) && (!s || [d.number, d.customers?.name].some((v: string | null) => v?.toLowerCase().includes(s))));
    if (sort === "total") r = [...r].sort((x, y) => dbMinor(y.grand_total) - dbMinor(x.grand_total));
    if (sort === "oldest") r = [...r].reverse();
    return r;
  }, [data, q, st, sort]);
  if (!a.sales) return <><FieldHeader title="Sales" /><NoAccess what="sales" /></>;
  return (
    <div>
      <FieldHeader title="Sales" right={
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as never)} className="mr-2 h-10 rounded-lg border bg-card/80 px-2 text-sm">
          <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="total">Total</option>
        </select>
      } />
      <div className="mx-4 mt-3 grid grid-cols-2 rounded-xl border border-border/60 bg-card/60 p-1">
        {(["quote", "order"] as const).map((k) => (
          <button key={k} onClick={() => { setSt("all"); nav({ search: { tab: k }, replace: true }); }} className={`h-10 rounded-lg text-sm font-medium transition-colors ${kind === k ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground"}`}>
            {k === "quote" ? "Quotes" : "Sales Orders"}
          </button>
        ))}
      </div>
      <div className="space-y-3 p-4">
        <SearchBar value={q} onChange={setQ} placeholder="Search number or customer" />
        <Chips value={st} onChange={setSt} options={[{ value: "all", label: "All" }, ...statuses.map((s) => ({ value: s, label: s }))]} />
      </div>
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} retry={refetch} /> : list.length === 0 ? <Empty text={`No ${kind === "quote" ? "quotes" : "sales orders"} yet.`} /> : list.map((d) => (
        <Row key={d.id} to="/field/sales/$kind/$id" params={{ kind, id: d.id }} title={`${d.number ?? "—"} · ${d.customers?.name ?? ""}`}
          subtitle={`${d.date ?? ""}${d[dateCol] ? ` · ${kind === "quote" ? "expires" : "deliver"} ${d[dateCol]}` : ""}`}
          right={<span className="font-medium tabular-nums">{money(d.grand_total, d.currency)}</span>} meta={<StatusPill status={d.status} />} />
      ))}
      {a.salesCreate && <Fab to="/field/sales/new" search={{ kind }} label={kind === "quote" ? "Quote" : "Order"} />}
    </div>
  );
}
