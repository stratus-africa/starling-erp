import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { Badge } from "@/components/ui/badge";

export function PurchaseOrderReceiptSummary({ orderId }: { orderId: string }) {
  const { data: lines = [], isLoading } = useQuery({ queryKey: ["purchase_orders", orderId, "receiving-status"], queryFn: async () => { const { data, error } = await db.rpc("get_purchase_order_receiving_status", { _order_id: orderId }); if (error) throw error; return (data ?? []) as Record<string, any>[]; } });
  const ordered = lines.reduce((sum, line) => sum + Number(line.ordered_quantity ?? 0), 0);
  const received = lines.reduce((sum, line) => sum + Number(line.previously_received ?? 0), 0);
  const rejected = lines.reduce((sum, line) => sum + Number(line.rejected_quantity ?? 0), 0);
  const status = received <= 0 ? "Not Received" : received + rejected >= ordered ? "Fully Received" : "Partially Received";
  return <div className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-4"><Metric label="Ordered" value={ordered} loading={isLoading} /><Metric label="Accepted" value={received} loading={isLoading} /><Metric label="Rejected" value={rejected} loading={isLoading} /><div><div className="text-xs text-muted-foreground">Status</div><Badge variant="outline">{status}</Badge></div></div>;
}
function Metric({ label, value, loading }: { label: string; value: number; loading: boolean }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-mono font-semibold">{loading ? "—" : value.toLocaleString()}</div></div>; }