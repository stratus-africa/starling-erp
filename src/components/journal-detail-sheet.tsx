/**
 * JournalDetailSheet
 *
 * Full traceability panel for a single journal entry.
 * Shows:
 *   - Journal number, date, status, memo
 *   - Source document (type + number) with a live link back to the originating document
 *   - Party name (customer / supplier / etc.) resolved from the source document
 *   - Created by / posted at
 *   - Balanced debit/credit line table with account codes
 *   - Voided badge + link to reversal journal if applicable
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  ArrowUpRight,
  BookMarked,
  CheckCircle2,
  Clock,
  Loader2,
  MinusCircle,
  RotateCcw,
  User,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JournalEntry {
  id: string;
  number: string | null;
  entry_date: string;
  memo: string | null;
  status: string | null;
  total_debit: number;
  total_credit: number;
  source_ref_type: string | null;
  source_ref_id: string | null;
  created_by: string | null;
  posted_at: string | null;
  created_at: string;
}

interface JournalLine {
  id: string;
  account_id: string;
  debit: number;
  credit: number;
  memo: string | null;
  account?: { id: string; code: string | null; name: string };
}

// ─── Source document catalogue ────────────────────────────────────────────────
// Maps source_ref_type → {label, route, numberField, partyField, partyTable}

const SOURCE_CATALOG: Record<
  string,
  {
    label: string;
    route: (id: string, num: string | null) => string;
    table: string;
    numberField: string;
    partyField: string | null;
    partyTable: string | null;
    partyLabel: string;
  }
> = {
  invoice: {
    label: "Sales Invoice",
    table: "invoices",
    numberField: "number",
    route: (id) => `/sales/invoices/${id}`,
    partyField: "customer_id",
    partyTable: "customers",
    partyLabel: "Customer",
  },
  bill: {
    label: "Supplier Bill",
    table: "bills",
    numberField: "number",
    route: (id) => `/purchasing/bills/${id}`,
    partyField: "supplier_id",
    partyTable: "suppliers",
    partyLabel: "Supplier",
  },
  credit_note: {
    label: "Credit Note",
    table: "credit_notes",
    numberField: "number",
    route: (id) => `/sales/credit-notes/${id}`,
    partyField: "customer_id",
    partyTable: "customers",
    partyLabel: "Customer",
  },
  expense: {
    label: "Expense",
    table: "expenses",
    numberField: "number",
    route: (id) => `/purchasing/expenses/${id}`,
    partyField: "supplier_id",
    partyTable: "suppliers",
    partyLabel: "Supplier",
  },
  payment_received: {
    label: "Payment Received",
    table: "payments_received",
    numberField: "number",
    route: (id) => `/sales/payments`,
    partyField: "customer_id",
    partyTable: "customers",
    partyLabel: "Customer",
  },
  payment_made: {
    label: "Payment Made",
    table: "payments_made",
    numberField: "number",
    route: (id) => `/purchasing/payments`,
    partyField: "supplier_id",
    partyTable: "suppliers",
    partyLabel: "Supplier",
  },
  adjustment: {
    label: "Inventory Adjustment",
    table: "inventory_adjustments",
    numberField: "number",
    route: (id) => `/inventory/adjustments`,
    partyField: null,
    partyTable: null,
    partyLabel: "",
  },
  transfer: {
    label: "Inventory Transfer",
    table: "inventory_transfers",
    numberField: "number",
    route: (id) => `/inventory/transfers`,
    partyField: null,
    partyTable: null,
    partyLabel: "",
  },
  production_order: {
    label: "Production Order",
    table: "production_orders",
    numberField: "number",
    route: (id) => `/manufacturing/orders`,
    partyField: null,
    partyTable: null,
    partyLabel: "",
  },
  bank_deposit: {
    label: "Bank Deposit",
    table: "bank_transactions",
    numberField: "number",
    route: (id) => `/accounting/banking`,
    partyField: null,
    partyTable: null,
    partyLabel: "",
  },
  bank_withdrawal: {
    label: "Bank Withdrawal",
    table: "bank_transactions",
    numberField: "number",
    route: (id) => `/accounting/banking`,
    partyField: null,
    partyTable: null,
    partyLabel: "",
  },
  manual: {
    label: "Manual Journal",
    table: "journal_entries",
    numberField: "number",
    route: (id) => `/accounting/journals`,
    partyField: null,
    partyTable: null,
    partyLabel: "",
  },
  reversal: {
    label: "Reversal",
    table: "journal_entries",
    numberField: "number",
    route: (id) => `/accounting/journals`,
    partyField: null,
    partyTable: null,
    partyLabel: "",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const db = supabase as any;

const money = (v: number) =>
  Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dtFmt = (v: string | null | undefined) =>
  !v
    ? "—"
    : new Date(v).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

const dateFmt = (v: string) =>
  new Date(v + "T00:00:00").toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

// ─── Component ────────────────────────────────────────────────────────────────

export function JournalDetailSheet({
  journalId,
  open,
  onClose,
}: {
  journalId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  // ── Fetch the journal entry ──────────────────────────────────────────────
  const { data: entry, isLoading: entryLoading } = useQuery<JournalEntry | null>({
    queryKey: ["journal_entry_detail", journalId],
    enabled: open && !!journalId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("journal_entries")
        .select(
          "id,number,entry_date,memo,status,total_debit,total_credit,source_ref_type,source_ref_id,created_by,posted_at,created_at",
        )
        .eq("id", journalId!)
        .single();
      if (error) throw error;
      return data as JournalEntry;
    },
  });

  // ── Fetch journal lines + resolve accounts ───────────────────────────────
  const { data: lines = [], isLoading: linesLoading } = useQuery<JournalLine[]>({
    queryKey: ["journal_lines_detail", journalId],
    enabled: open && !!journalId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: rawLines, error } = await db
        .from("journal_lines")
        .select("id,account_id,debit,credit,memo")
        .eq("journal_id", journalId!);
      if (error) throw error;

      const rows = (rawLines ?? []) as JournalLine[];
      if (!rows.length) return [];

      const acctIds = [...new Set(rows.map((l) => l.account_id))];
      const { data: accts } = await db.from("chart_of_accounts").select("id,code,name").in("id", acctIds);
      const acctMap = new Map<string, { id: string; code: string | null; name: string }>(
        ((accts ?? []) as { id: string; code: string | null; name: string }[]).map((a) => [a.id, a]),
      );

      return rows.map((l) => ({ ...l, account: acctMap.get(l.account_id) }));
    },
  });

  // ── Resolve source document ──────────────────────────────────────────────
  const sourceType = entry?.source_ref_type ?? null;
  const sourceId = entry?.source_ref_id ?? null;
  const sourceCfg = sourceType ? (SOURCE_CATALOG[sourceType] ?? null) : null;

  const { data: sourceDoc } = useQuery<{ number: string | null; partyId: string | null } | null>({
    queryKey: ["journal_source_doc", sourceType, sourceId],
    enabled: open && !!sourceId && !!sourceCfg && sourceCfg.table !== "journal_entries",
    staleTime: 60_000,
    queryFn: async () => {
      if (!sourceCfg || !sourceId) return null;
      const fields = [sourceCfg.numberField, sourceCfg.partyField].filter(Boolean).join(",");
      const { data } = await db.from(sourceCfg.table).select(fields).eq("id", sourceId).maybeSingle();
      if (!data) return null;
      return {
        number: data[sourceCfg.numberField] as string | null,
        partyId: sourceCfg.partyField ? (data[sourceCfg.partyField] as string | null) : null,
      };
    },
  });

  // ── Resolve party name ───────────────────────────────────────────────────
  const { data: partyName } = useQuery<string | null>({
    queryKey: ["journal_party", sourceCfg?.partyTable, sourceDoc?.partyId],
    enabled: open && !!sourceDoc?.partyId && !!sourceCfg?.partyTable,
    staleTime: 120_000,
    queryFn: async () => {
      if (!sourceCfg?.partyTable || !sourceDoc?.partyId) return null;
      const { data } = await db.from(sourceCfg.partyTable).select("name").eq("id", sourceDoc.partyId).maybeSingle();
      return (data?.name as string) ?? null;
    },
  });

  // ── Resolve created_by profile ───────────────────────────────────────────
  const { data: poster } = useQuery<{ full_name: string | null; email: string } | null>({
    queryKey: ["profile_lookup", entry?.created_by],
    enabled: open && !!entry?.created_by,
    staleTime: 120_000,
    queryFn: async () => {
      const { data } = await db.from("profiles").select("full_name,email").eq("id", entry!.created_by!).maybeSingle();
      return data ?? null;
    },
  });

  // ── Look up reversal journal (if this entry was voided) ──────────────────
  const { data: reversalJournal } = useQuery<{ id: string; number: string | null } | null>({
    queryKey: ["reversal_journal", journalId],
    enabled: open && entry?.status === "Voided",
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await db
        .from("journal_entries")
        .select("id,number")
        .eq("source_ref_type", "reversal")
        .eq("source_ref_id", journalId!)
        .maybeSingle();
      return data ?? null;
    },
  });

  const isLoading = entryLoading || linesLoading;
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.005;

  const sourceLabel = sourceCfg?.label ?? sourceType ?? "Unknown";
  const sourceRoute = sourceCfg && sourceId ? sourceCfg.route(sourceId, sourceDoc?.number ?? null) : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden sm:max-w-lg">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-muted-foreground" />
            {entry?.number ?? "Journal Entry"}
          </SheetTitle>
          <SheetDescription>
            {entry?.entry_date ? dateFmt(entry.entry_date) : "—"}
            {" · "}
            {entry?.memo ?? "No description"}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : !entry ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Journal entry not found.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-5 px-1 py-3">
            {/* ── Status banner ── */}
            {entry.status === "Voided" && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>This journal has been voided.</span>
                {reversalJournal && (
                  <span className="ml-auto font-normal">
                    Reversal: <span className="font-mono font-semibold">{reversalJournal.number}</span>
                  </span>
                )}
              </div>
            )}
            {entry.status === "Posted" && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Posted to the general ledger
              </div>
            )}
            {entry.status === "Draft" && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <MinusCircle className="h-3.5 w-3.5 shrink-0" />
                Draft — not yet posted to the GL
              </div>
            )}

            {/* ── Metadata grid ── */}
            <section className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
              <MetaField label="Journal #">
                <span className="font-mono font-semibold text-primary">{entry.number ?? "—"}</span>
              </MetaField>

              <MetaField label="Date">
                <span>{dateFmt(entry.entry_date)}</span>
              </MetaField>

              <MetaField label="Source">
                {sourceId && sourceRoute ? (
                  <Link
                    to={sourceRoute as never}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    onClick={onClose}
                  >
                    {sourceLabel}
                    {sourceDoc?.number && <span className="font-mono"> {sourceDoc.number}</span>}
                    <ArrowUpRight className="h-3 w-3 opacity-60" />
                  </Link>
                ) : (
                  <span className="text-muted-foreground capitalize">{sourceLabel}</span>
                )}
              </MetaField>

              {sourceCfg?.partyLabel && partyName && (
                <MetaField label={sourceCfg.partyLabel}>
                  <span className="font-medium">{partyName}</span>
                </MetaField>
              )}

              <MetaField label="Created">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {dtFmt(entry.created_at)}
                </span>
              </MetaField>

              {entry.posted_at && (
                <MetaField label="Posted">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    {dtFmt(entry.posted_at)}
                  </span>
                </MetaField>
              )}

              <MetaField label="Posted by">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  {poster ? (poster.full_name ?? poster.email) : "—"}
                </span>
              </MetaField>

              {entry.status === "Voided" && reversalJournal && (
                <MetaField label="Reversal journal">
                  <span className="font-mono font-semibold text-destructive">{reversalJournal.number}</span>
                </MetaField>
              )}
            </section>

            <Separator />

            {/* ── Journal lines ── */}
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Journal Lines
              </p>

              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No lines found.</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr className="border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left">Account</th>
                        <th className="px-3 py-2 text-left max-w-[120px]">Memo</th>
                        <th className="px-3 py-2 text-right w-24">Debit</th>
                        <th className="px-3 py-2 text-right w-24">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <span className="font-mono text-muted-foreground mr-1.5">{line.account?.code ?? "?"}</span>
                            <span className="font-medium">{line.account?.name ?? "Unknown"}</span>
                          </td>
                          <td className="px-3 py-2 max-w-[120px]">
                            <span className="truncate block text-muted-foreground">{line.memo ?? "—"}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {Number(line.debit) > 0 ? (
                              <span className="text-blue-700 dark:text-blue-300 font-medium">{money(line.debit)}</span>
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {Number(line.credit) > 0 ? (
                              <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                                {money(line.credit)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Totals */}
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td
                          colSpan={2}
                          className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          Total
                          {!isBalanced && <span className="ml-2 text-destructive">⚠ Unbalanced</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-blue-700 dark:text-blue-300">
                          {money(totalDebit)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                          {money(totalCredit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            {/* ── Source document reversal note ── */}
            {sourceType === "reversal" && entry.source_ref_id && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <RotateCcw className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">This is a reversal journal.</p>
                  <p className="font-normal mt-0.5">
                    It was automatically created to cancel the original journal entry. Every debit and credit has been
                    swapped from the original.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── MetaField helper ─────────────────────────────────────────────────────────

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
