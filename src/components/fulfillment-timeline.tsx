import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package as PackageIcon, Truck, Clock } from "lucide-react";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface Row {
  id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  note: string | null;
  actor_email: string | null;
  created_at: string;
  label: string;
  href: string;
}

/** Aggregated fulfillment history for a sales order: its packages and shipments. */
export function FulfillmentTimeline({ orderId }: { orderId: string }) {
  const { data: rows = [] } = useQuery({
    queryKey: ["fulfillment-timeline", orderId],
    enabled: !!orderId && orderId !== "new",
    queryFn: async (): Promise<Row[]> => {
      const [{ data: packages }, { data: shipments }] = await Promise.all([
        supabase.from("packages" as any).select("id,number").eq("sales_order_id", orderId).is("deleted_at", null),
        supabase.from("shipments" as any).select("id,number").eq("sales_order_id", orderId).is("deleted_at", null),
      ]);

      const meta = new Map<string, { label: string; href: string; type: string }>();
      for (const p of ((packages ?? []) as any[])) meta.set(p.id, { label: p.number ?? "Package", href: `/sales/packages/${p.id}`, type: "package" });
      for (const s of ((shipments ?? []) as any[])) meta.set(s.id, { label: s.number ?? "Shipment", href: `/sales/shipments/${s.id}`, type: "shipment" });

      const ids = [...meta.keys(), orderId];
      if (!ids.length) return [];

      const { data: events, error } = await supabase
        .from("document_events" as any)
        .select("*")
        .in("entity_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;

      return ((events ?? []) as any[]).map((e) => {
        const m = meta.get(e.entity_id);
        return {
          ...e,
          label: m?.label ?? "Order",
          href: m?.href ?? `/sales/orders/${orderId}`,
        } as Row;
      });
    },
  });

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-2 border-b bg-muted/30 text-sm font-medium flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" /> Fulfillment timeline
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground text-center">No fulfillment activity recorded yet.</div>
      ) : (
        <ul className="divide-y">
          {rows.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
              {e.entity_type === "shipment" ? (
                <Truck className="h-4 w-4 mt-0.5 text-muted-foreground" />
              ) : (
                <PackageIcon className="h-4 w-4 mt-0.5 text-muted-foreground" />
              )}
              <Badge variant="secondary" className="mt-0.5">{e.status}</Badge>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <Link to={e.href as any} className="font-medium underline-offset-2 hover:underline">{e.label}</Link>
                  {e.note ? <span className="text-muted-foreground"> — {e.note}</span> : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {when(e.created_at)} {e.actor_email ? `· ${e.actor_email}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
