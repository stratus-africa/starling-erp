import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FieldHeader, Loading, ErrorBox, NoAccess, StatusPill, useFieldAccess, money } from "@/components/field/field-ui";

export const Route = createFileRoute("/_authenticated/field/sales/$kind/$id")({
  head: () => ({ meta: [{ title: "Sales document — Field Sales" }] }),
  component: SalesDetail,
});

// Next steps a field user may take, restricted to non-accounting transitions handled by the existing status engine.
const NEXT: Record<string, Record<string, string[]>> = {
  quote: { Draft: ["Sent"], Sent: ["Accepted", "Rejected"], Viewed: ["Accepted", "Rejected"] },
  order: { Draft: ["Confirmed"] },
};

function SalesDetail() {
  const { kind: rawKind, id } = Route.useParams();
  const kind = rawKind === "order" ? "order" : "quote";
  const a = useFieldAccess();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const t = kind === "quote" ? "sales_quotes" : "sales_orders";
  const lt = kind === "quote" ? "sales_quote_lines" : "sales_order_lines";
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [t, "field-detail", id], enabled: a.sales,
    queryFn: async () => {
      const [{ data: h, error: e }, { data: ls }] = await Promise.all([
        (supabase as any).from(t).select("*, customers(id,name)").eq("id", id).maybeSingle(),
        (supabase as any).from(lt).select("*").eq("document_id", id).is("deleted_at", null).order("line_no"),
      ]);
      if (e) throw e;
      if (!h) throw new Error("Not found");
      return { h, ls: ls ?? [] };
    },
  });
  const label = kind === "quote" ? "Quote" : "Sales Order";
  if (!a.sales) return <><FieldHeader title={label} back="/field/sales" /><NoAccess what="sales" /></>;
  if (isLoading) return <><FieldHeader title={label} back="/field/sales" /><Loading /></>;
  if (error || !data) return <><FieldHeader title={label} back="/field/sales" /><ErrorBox error={error} retry={refetch} /></>;
  const { h, ls } = data;
  const status = h.status ?? "Draft";
  const next = a.salesEdit ? NEXT[kind][status] ?? [] : [];

  const transition = async (to: string) => {
    const rpc = kind === "quote" ? "transition_quote" : "transition_sales_order";
    const args = kind === "quote" ? { _quote_id: id, _new_status: to, _reason: "Field Sales" } : { _order_id: id, _new_status: to, _reason: "Field Sales" };
    const { error } = await (supabase as any).rpc(rpc, args);
    if (error) return toast.error(error.message);
    toast.success(`${label} marked ${to}`);
    qc.invalidateQueries({ queryKey: [t] });
  };

  return (
    <div className="pb-6">
      <FieldHeader title={h.number ?? label} back={`/field/sales`} right={a.salesEdit && status === "Draft" ? <Link to="/field/sales/new" search={{ kind, edit: id }} aria-label="Edit" className="flex h-11 w-11 items-center justify-center"><Pencil className="h-5 w-5" /></Link> : null} />
      <div className="space-y-4 p-4 text-sm">
        <div className="flex items-start justify-between">
          <div>
            <Link to="/field/customers/$id" params={{ id: h.customers?.id ?? h.customer_id }} className="text-base font-semibold text-primary">{h.customers?.name}</Link>
            <div className="text-xs text-muted-foreground">{h.date}{(kind === "quote" ? h.expiry : h.promised_date) ? ` · ${kind === "quote" ? "expires" : "deliver"} ${kind === "quote" ? h.expiry : h.promised_date}` : ""}</div>
          </div>
          <StatusPill status={status} />
        </div>
        <div className="divide-y rounded-xl border">
          {ls.map((l: any) => (
            <div key={l.id} className="flex justify-between gap-2 p-3">
              <div className="min-w-0"><div className="truncate font-medium">{l.description}</div><div className="text-xs text-muted-foreground">{Number(l.quantity)} × {money(l.unit_price, h.currency)}{Number(l.discount_pct) ? ` −${Number(l.discount_pct)}%` : ""}{Number(l.tax_pct) ? ` +${Number(l.tax_pct)}%` : ""}</div></div>
              <div className="shrink-0 tabular-nums">{money(l.line_total, h.currency)}</div>
            </div>
          ))}
        </div>
        <dl className="space-y-1 rounded-xl border p-3">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{money(h.subtotal, h.currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">{money(h.discount_total, h.currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Tax</dt><dd className="tabular-nums">{money(h.tax_total, h.currency)}</dd></div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(h.grand_total, h.currency)}</dd></div>
        </dl>
        {h.notes && <div><div className="text-xs text-muted-foreground">Notes</div><p className="whitespace-pre-line">{h.notes}</p></div>}
        <div className="grid gap-2">
          {next.map((s) => <Button key={s} className="h-12 text-base" variant={s === "Rejected" ? "outline" : "default"} onClick={() => setPending(s)}>Mark {s}</Button>)}
          {kind === "quote" && status === "Accepted" && a.salesCreate && (
            <p className="text-center text-xs text-muted-foreground">Accepted quotes are converted to sales orders from the office app.</p>
          )}
        </div>
      </div>
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Mark {pending}?</AlertDialogTitle><AlertDialogDescription>This changes the {label.toLowerCase()} status. No accounting entries are posted.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { const s = pending!; setPending(null); void transition(s); }}>Confirm</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
