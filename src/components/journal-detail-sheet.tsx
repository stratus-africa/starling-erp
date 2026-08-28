import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/lib/typed-db";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";

const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Full detail view of a single journal entry with its lines. */
export function JournalDetailSheet({
  journalId,
  open,
  onClose,
}: {
  journalId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["journal-detail", journalId],
    enabled: open && !!journalId,
    queryFn: async () => {
      const { data: entry } = await db
        .from("journal_entries")
        .select("id,number,entry_date,memo,total_debit,total_credit,status,source_ref_type,posted_at")
        .eq("id", journalId)
        .maybeSingle();

      const { data: lines } = await db
        .from("journal_lines")
        .select("id,debit,credit,memo,account_id")
        .eq("journal_id", journalId);

      const lineRows: Row[] = lines ?? [];
      const acctIds = [...new Set(lineRows.map((l) => l.account_id).filter(Boolean))];
      const accounts: Row[] = acctIds.length
        ? ((await db.from("chart_of_accounts").select("id,code,name").in("id", acctIds)).data ?? [])
        : [];
      const acctMap = new Map(accounts.map((a) => [a.id, a]));

      return {
        entry: (entry ?? null) as Row | null,
        lines: lineRows.map((l): Row => ({ ...l, account: acctMap.get(l.account_id) })),
      };
    },
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{data?.entry?.number ?? "Journal entry"}</SheetTitle>
          <SheetDescription>
            {data?.entry?.memo ?? "Double-entry detail for this journal entry."}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !data?.entry ? (
          <p className="text-sm text-muted-foreground mt-6">Journal entry not found.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Date</dt>
                <dd>{data.entry.entry_date}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Status</dt>
                <dd>{data.entry.status ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Source</dt>
                <dd>{data.entry.source_ref_type ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Posted at</dt>
                <dd>{data.entry.posted_at ? new Date(data.entry.posted_at).toLocaleString() : "—"}</dd>
              </div>
            </dl>

            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground border-b bg-muted/30">
                    <th className="text-left px-3 py-1.5">Account</th>
                    <th className="text-right px-3 py-1.5 w-24">Debit</th>
                    <th className="text-right px-3 py-1.5 w-24">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
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

            <div className="flex justify-end gap-6 text-sm font-medium">
              <span>Debit: {money(data.entry.total_debit)}</span>
              <span>Credit: {money(data.entry.total_credit)}</span>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
