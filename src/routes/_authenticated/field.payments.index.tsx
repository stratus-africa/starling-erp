import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FieldHeader, SearchBar, Chips, Row, Loading, Empty, ErrorBox, NoAccess, Fab, StatusPill, SyncBadge, useFieldAccess, money } from "@/components/field/field-ui";
import { useOutbox } from "@/lib/field-sync";

export const Route = createFileRoute("/_authenticated/field/payments/")({
  head: () => ({ meta: [{ title: "Payments — Field Sales" }] }),
  component: PaymentsList,
});

function PaymentsList() {
  const a = useFieldAccess();
  const [q, setQ] = useState("");
  const [m, setM] = useState("all");
  const outbox = useOutbox().filter((i) => i.kind === "payment" && i.status !== "synced");
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ["payments_received", "field-list"], enabled: a.payments,
    queryFn: async () => {
      const { data, error } = await supabase.from("payments_received").select("id,number,date,amount,currency,mode,status,customer_id,customers(name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const modes = useMemo(() => Array.from(new Set(data.map((d: any) => d.mode).filter(Boolean))) as string[], [data]);
  const list = useMemo(() => {
    const s = q.toLowerCase();
    return data.filter((d: any) => (m === "all" || d.mode === m) && (!s || [d.number, d.customers?.name].some((v: string | null) => v?.toLowerCase().includes(s))));
  }, [data, q, m]);
  if (!a.payments) return <><FieldHeader title="Payments" /><NoAccess what="payments" /></>;
  return (
    <div>
      <FieldHeader title="Customer payments" />
      <div className="space-y-3 p-4">
        <SearchBar value={q} onChange={setQ} placeholder="Search number or customer" />
        <Chips value={m} onChange={setM} options={[{ value: "all", label: "All methods" }, ...modes.map((x) => ({ value: x, label: x }))]} />
      </div>
      {outbox.map((o) => (
        <div key={o.id} className="flex min-h-16 items-center gap-3 border-b bg-muted/40 px-4 py-3">
          <div className="min-w-0 flex-1"><div className="truncate font-medium">{o.label}</div><div className="truncate text-xs text-muted-foreground">{o.error ?? "Waiting for connection"}</div></div>
          <SyncBadge status={o.status} />
        </div>
      ))}
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} retry={refetch} /> : list.length === 0 ? <Empty text="No payments recorded." /> : list.map((d: any) => (
        <Row key={d.id} to="/field/customers/$id" params={{ id: d.customer_id }} title={`${d.number ?? "—"} · ${d.customers?.name ?? ""}`}
          subtitle={`${d.date ?? ""} · ${d.mode ?? ""}`} right={<span className="font-medium tabular-nums">{money(d.amount, d.currency)}</span>} meta={<StatusPill status={d.status} />} />
      ))}
      {a.paymentsCreate && <Fab to="/field/payments/new" label="Payment" />}
    </div>
  );
}
