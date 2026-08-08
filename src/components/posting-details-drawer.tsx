import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookMarked, Boxes } from "lucide-react";

const money = (n: any) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Shows the journal entries and stock movements produced when a document was posted. */
export function PostingDetailsDrawer({
  open, onOpenChange, refType, refId, title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  refType: string;
  refId: string;
  title: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["posting-details", refType, refId],
    enabled: open && !!refId,
    queryFn: async () => {
      const [{ data: entries }, { data: movements }] = await Promise.all([
        supabase
          .from("journal_entries" as any)
          .select("id,number,entry_date,memo,total_debit,total_credit,source_ref_type")
          .eq("source_ref_id", refId)
          .order("created_at"),
        supabase
          .from("stock_movements" as any)
          .select("id,quantity,unit_cost,note,created_at,item_id,warehouse_id")
          .eq("ref_id", refId)
          .order("created_at"),
      ]);

      const ids = ((entries ?? []) as any[]).map((e) => e.id);
      let lines: any[] = [];
      if (ids.length) {
        const { data: jl } = await supabase
          .from("journal_lines" as any)
          .select("id,journal_id,debit,credit,memo,account_id")
          .in("journal_id", ids);
        lines = (jl ?? []) as any[];
      }

      const itemIds = [...new Set(((movements ?? []) as any[]).map((m) => m.item_id).filter(Boolean))];
      const acctIds = [...new Set(lines.map((l) => l.account_id).filter(Boolean))];
      const [{ data: items }, { data: accounts }] = await Promise.all([
        itemIds.length ? supabase.from("items").select("id,name,sku").in("id", itemIds) : Promise.resolve({ data: [] as any[] }),
        acctIds.length ? supabase.from("chart_of_accounts").select("id,code,name").in("id", acctIds) : Promise.resolve({ data: [] as any[] }),
      ]);

      const itemMap = new Map(((items ?? []) as any[]).map((i) => [i.id, i]));
      const acctMap = new Map(((accounts ?? []) as any[]).map((a) => [a.id, a]));

      return {
        entries: ((entries ?? []) as any[]).map((e) => ({
          ...e,
          lines: lines.filter((l) => l.journal_id === e.id).map((l) => ({ ...l, account: acctMap.get(l.account_id) })),
        })),
        movements: ((movements ?? []) as any[]).map((m) => ({ ...m, item: itemMap.get(m.item_id) })),
      };
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Posting details</SheetTitle>
          <SheetDescription>Accounting and inventory impact of {title}.</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="mt-4 space-y-6">
            <section>
              <div className="flex items-center gap-2 text-sm font-medium mb-2"><BookMarked className="h-4 w-4 text-muted-foreground" /> Journal entries</div>
              {!data?.entries.length ? (
                <p className="text-sm text-muted-foreground">No journal entry was generated.</p>
              ) : (
                data.entries.map((e: any) => (
                  <div key={e.id} className="rounded-md border mb-3 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-sm">
                      <span className="font-medium">{e.number ?? "Journal"}</span>
                      <span className="text-xs text-muted-foreground">{e.entry_date}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs uppercase text-muted-foreground border-b">
                          <th className="text-left px-3 py-1.5">Account</th>
                          <th className="text-right px-3 py-1.5 w-24">Debit</th>
                          <th className="text-right px-3 py-1.5 w-24">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.lines.map((l: any) => (
                          <tr key={l.id} className="border-b last:border-0">
                            <td className="px-3 py-1.5">
                              <span className="font-mono text-xs text-muted-foreground mr-1.5">{l.account?.code}</span>
                              {l.account?.name ?? l.memo}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums">{Number(l.debit) ? money(l.debit) : "—"}</td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums">{Number(l.credit) ? money(l.credit) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </section>

            <section>
              <div className="flex items-center gap-2 text-sm font-medium mb-2"><Boxes className="h-4 w-4 text-muted-foreground" /> Inventory movements</div>
              {!data?.movements.length ? (
                <p className="text-sm text-muted-foreground">No stock movements were recorded.</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-muted-foreground border-b bg-muted/30">
                        <th className="text-left px-3 py-1.5">Item</th>
                        <th className="text-right px-3 py-1.5 w-20">Qty</th>
                        <th className="text-right px-3 py-1.5 w-24">Unit cost</th>
                        <th className="text-right px-3 py-1.5 w-24">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movements.map((m: any) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="px-3 py-1.5">{m.item?.name ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Badge variant={Number(m.quantity) < 0 ? "destructive" : "secondary"} className="font-mono">{Number(m.quantity)}</Badge>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{money(m.unit_cost)}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{money(Math.abs(Number(m.quantity) * Number(m.unit_cost)))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
