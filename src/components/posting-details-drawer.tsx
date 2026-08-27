import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { JournalLine } from "@/lib/db-types";
import { Loader2, BookMarked, Boxes, ExternalLink } from "lucide-react";

const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface PostingSourceLink {
  label: string;
  to: string;
}

/** Shows the journal entries and stock movements produced when a document was posted. */
export function PostingDetailsDrawer({
  open,
  onOpenChange,
  refType,
  refId,
  refIds,
  title,
  sources = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  refType: string;
  refId?: string;
  refIds?: (string | null | undefined)[];
  title: string;
  sources?: PostingSourceLink[];
}) {
  const ids = [...new Set([refId, ...(refIds ?? [])].filter(Boolean))] as string[];

  const { data, isLoading } = useQuery({
    queryKey: ["posting-details", refType, ids],
    enabled: open && ids.length > 0,
    queryFn: async () => {
      const [{ data: entries }, { data: movements }] = await Promise.all([
        supabase
          .from("journal_entries")
          .select("id,number,entry_date,memo,total_debit,total_credit,source_ref_type")
          .in("source_ref_id", ids)
          .order("created_at"),
        supabase
          .from("stock_movements")
          .select("id,quantity,unit_cost,note,created_at,item_id,warehouse_id,ref_type")
          .in("ref_id", ids)
          .order("created_at"),
      ]);

      const journalIds = (entries ?? []).map((e) => e.id);
      let lines: JournalLine[] = [];
      if (journalIds.length) {
        const { data: jl } = await supabase
          .from("journal_lines")
          .select("id,journal_id,debit,credit,memo,account_id")
          .in("journal_id", journalIds);
        lines = jl ?? [];
      }

      const itemIds = [...new Set((movements ?? []).map((m) => m.item_id).filter((id): id is string => Boolean(id)))];
      const acctIds = [...new Set(lines.map((l) => l.account_id).filter(Boolean))];
      const items = itemIds.length
        ? ((await supabase.from("items").select("id,name,sku").in("id", itemIds)).data ?? [])
        : [];
      const accounts = acctIds.length
        ? ((await supabase.from("chart_of_accounts").select("id,code,name").in("id", acctIds)).data ?? [])
        : [];

      const itemMap = new Map(items.map((i) => [i.id, i]));
      const acctMap = new Map(accounts.map((a) => [a.id, a]));

      return {
        entries: (entries ?? []).map((e) => ({
          ...e,
          lines: lines.filter((l) => l.journal_id === e.id).map((l) => ({ ...l, account: acctMap.get(l.account_id) })),
        })),
        movements: (movements ?? []).map((m) => ({ ...m, item: itemMap.get(m.item_id) })),
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
          <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {sources.length > 0 && (
              <section>
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" /> Originating documents
                </div>
                <div className="flex flex-wrap gap-2">
                  {sources.map((s) => (
                    <Link
                      key={s.to}
                      to={s.to as never}
                      className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted/50"
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <section>
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <BookMarked className="h-4 w-4 text-muted-foreground" /> Journal entries
              </div>
              {!data?.entries.length ? (
                <p className="text-sm text-muted-foreground">No journal entry was generated.</p>
              ) : (
                data.entries.map((e) => (
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
                        {e.lines.map((l) => (
                          <tr key={l.id} className="border-b last:border-0">
                            <td className="px-3 py-1.5">
                              <span className="font-mono text-xs text-muted-foreground mr-1.5">{l.account?.code}</span>
                              {l.account?.name ?? l.memo}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                              {Number(l.debit) ? money(l.debit) : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                              {Number(l.credit) ? money(l.credit) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </section>

            <section>
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <Boxes className="h-4 w-4 text-muted-foreground" /> Inventory movements
              </div>
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
                      {data.movements.map((m) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="px-3 py-1.5">{m.item?.name ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Badge variant={Number(m.quantity) < 0 ? "destructive" : "secondary"} className="font-mono">
                              {Number(m.quantity)}
                            </Badge>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{money(m.unit_cost)}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                            {money(Math.abs(Number(m.quantity) * Number(m.unit_cost)))}
                          </td>
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
