import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/lib/typed-db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BusinessEventTimeline } from "@/components/business-event-timeline";
import { Loader2, BookMarked, Boxes } from "lucide-react";

const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Full accounting chain for a posted document: journal entries, GL lines and stock movements. */
export function AccountingAuditTrail({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["accounting-audit-trail", entityType, entityId],
    queryFn: async () => {
      const [{ data: entries }, { data: movements }] = await Promise.all([
        db
          .from("journal_entries")
          .select("id,number,entry_date,memo,total_debit,total_credit,source_ref_type,status,posted_at")
          .eq("source_ref_id", entityId)
          .order("created_at"),
        db
          .from("stock_movements")
          .select("id,quantity,unit_cost,note,created_at,item_id,warehouse_id,ref_type")
          .eq("ref_id", entityId)
          .order("created_at"),
      ]);

      const entryRows: Row[] = (entries ?? []) as Row[];
      const movementRows: Row[] = (movements ?? []) as Row[];

      const journalIds = entryRows.map((e) => e.id as string);
      let lines: Row[] = [];
      if (journalIds.length) {
        const { data: jl } = await db
          .from("journal_lines")
          .select("id,journal_id,debit,credit,memo,account_id")
          .in("journal_id", journalIds);
        lines = (jl ?? []) as Row[];
      }

      const itemIds = [...new Set(movementRows.map((m) => m.item_id as string).filter(Boolean))];
      const acctIds = [...new Set(lines.map((l) => l.account_id as string).filter(Boolean))];
      const items = itemIds.length
        ? (((await db.from("items").select("id,name,sku").in("id", itemIds)).data ?? []) as Row[])
        : [];
      const accounts = acctIds.length
        ? (((await db.from("chart_of_accounts").select("id,code,name").in("id", acctIds)).data ?? []) as Row[])
        : [];
      const itemMap = new Map(items.map((i) => [i.id as string, i]));
      const acctMap = new Map(accounts.map((a) => [a.id as string, a]));

      return {
        entries: entryRows.map((e): Row => ({
          ...e,
          lines: lines
            .filter((l) => l.journal_id === e.id)
            .map((l) => ({ ...l, account: acctMap.get(l.account_id as string) })),
        })),
        movements: movementRows.map((m): Row => ({ ...m, item: itemMap.get(m.item_id as string) })),
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading audit trail…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Journal entries</h3>
        </div>
        {!data?.entries.length ? (
          <p className="text-sm text-muted-foreground">No journal entries found for this document.</p>
        ) : (
          data.entries.map((e) => (
            <div key={e.id as string} className="mb-3 overflow-hidden rounded-md border last:mb-0">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{(e.number as string) ?? "Journal"}</span>
                  {e.status ? <Badge variant="outline">{String(e.status)}</Badge> : null}
                  {e.source_ref_type === "reversal" && <Badge variant="outline">Reversal</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">{String(e.entry_date ?? "")}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-1.5 text-left">Account</th>
                    <th className="w-28 px-3 py-1.5 text-right">Debit</th>
                    <th className="w-28 px-3 py-1.5 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {(e.lines as Row[]).map((l) => (
                    <tr key={l.id as string} className="border-b last:border-0">
                      <td className="px-3 py-1.5">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                          {l.account?.code as string}
                        </span>
                        {(l.account?.name as string) ?? (l.memo as string)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {Number(l.debit) ? money(l.debit as number) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {Number(l.credit) ? money(l.credit as number) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Inventory movements</h3>
        </div>
        {!data?.movements.length ? (
          <p className="text-sm text-muted-foreground">No stock movements recorded for this document.</p>
        ) : (
          <div className="space-y-2">
            {data.movements.map((m) => (
              <div key={m.id as string} className="flex items-center justify-between border-b pb-2 text-sm last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {(m.item?.name as string) ?? "Item"}
                    {m.item?.sku ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{m.item.sku as string}</span> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {String(m.ref_type ?? "")} · {new Date(String(m.created_at)).toLocaleString()}
                  </div>
                </div>
                <div className="shrink-0 text-right font-mono tabular-nums">
                  <div>{Number(m.quantity) > 0 ? `+${money(m.quantity as number)}` : money(m.quantity as number)}</div>
                  <div className="text-xs text-muted-foreground">@ {money(m.unit_cost as number)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <BusinessEventTimeline entityType={entityType} entityId={entityId} />
    </div>
  );
}
