import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchVarianceBadge } from "@/components/match-variance-badge";
import { MatchExceptionPanel } from "@/components/match-exception-panel";

export function ThreeWayMatchPanel({ billId }: { billId: string }) {
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["bills", billId, "three-way-match"], queryFn: async () => { const { data, error } = await db.rpc("get_purchase_three_way_match", { _bill_id: billId }); if (error) throw error; return (data ?? []) as Record<string, any>[]; } });
  const exception = rows.find((row) => row.match_status === "Exception");
  return <Card><CardHeader><CardTitle className="text-sm">Three-Way Match</CardTitle></CardHeader><CardContent className="space-y-3">{exception && <MatchExceptionPanel message="Bill quantity or price exceeds the configured PO/receipt tolerance." />}{isLoading ? <p className="text-sm text-muted-foreground">Loading match...</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No PO match available.</p> : <div className="space-y-2">{rows.map((row) => <div className="flex items-center justify-between border-b py-2 text-sm" key={row.bill_line_id}><span>Bill line</span><div className="flex items-center gap-3"><span className="font-mono">Qty variance {Number(row.quantity_variance ?? 0).toFixed(2)}</span><MatchVarianceBadge status={row.match_status} /></div></div>)}</div>}</CardContent></Card>;
}