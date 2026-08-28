import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Download,
  Loader2,
  Printer,
  Scale,
  Search,
  X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  normal_balance: string; // "Debit" | "Credit"
  opening_balance: number;
}

interface TrialBalanceLine {
  account_id: string;
  code: string | null;
  name: string;
  type: string | null;
  normal_balance: string;
  opening_balance: number;
  total_debit: number;   // sum of all posted debit lines
  total_credit: number;  // sum of all posted credit lines
  // Net balance in the account's normal balance direction:
  // For a Debit-normal account:  opening + debits - credits
  // For a Credit-normal account: opening + credits - debits
  net_balance: number;
  // Where the net ends up in the TB columns:
  tb_debit: number;    // > 0 when net is a debit balance
  tb_credit: number;   // > 0 when net is a credit balance
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as any;

// Display order for account types (Assets → Liabilities → Equity → Income → Expense)
const TYPE_ORDER: Record<string, number> = {
  Asset: 0, Liability: 1, Equity: 2, Income: 3, Expense: 4,
};

const TYPE_CLASSES: Record<string, string> = {
  Asset:     "text-blue-600 dark:text-blue-400",
  Liability: "text-red-600 dark:text-red-400",
  Equity:    "text-violet-600 dark:text-violet-400",
  Income:    "text-emerald-600 dark:text-emerald-400",
  Expense:   "text-amber-600 dark:text-amber-400",
};

const TYPE_BG: Record<string, string> = {
  Asset:     "bg-blue-500/8 border-blue-500/15",
  Liability: "bg-red-500/8 border-red-500/15",
  Equity:    "bg-violet-500/8 border-violet-500/15",
  Income:    "bg-emerald-500/8 border-emerald-500/15",
  Expense:   "bg-amber-500/8 border-amber-500/15",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v === 0
    ? "—"
    : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtTotal = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric", month: "long", year: "numeric",
  });

// ─────────────────────────────────────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────────────────────────────────────

function exportCsv(lines: TrialBalanceLine[], asOf: string, totalDebit: number, totalCredit: number) {
  const header = ["Code", "Account Name", "Type", "Debit", "Credit"].join(",");
  const body = lines.map((l) =>
    [
      l.code ?? "",
      `"${l.name.replace(/"/g, '""')}"`,
      l.type ?? "",
      l.tb_debit > 0 ? l.tb_debit.toFixed(2) : "",
      l.tb_credit > 0 ? l.tb_credit.toFixed(2) : "",
    ].join(","),
  );
  const totals = ["TOTAL", "", "", totalDebit.toFixed(2), totalCredit.toFixed(2)].join(",");
  const blob = new Blob(
    [["Trial Balance – " + asOf, header, ...body, totals].join("\n")],
    { type: "text/csv" },
  );
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `trial-balance-${asOf}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function TrialBalancePage() {
  const { tenant } = useAuth();

  // Default "as of" date = today
  const todayIso = new Date().toISOString().slice(0, 10);
  const [asOf,       setAsOf]       = useState(todayIso);
  const [search,     setSearch]     = useState("");
  const [showZero,   setShowZero]   = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [groupByType,setGroupByType]= useState(true);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  // Strategy:
  // 1. Load all chart_of_accounts for the tenant
  // 2. Load all journal_lines that are part of *posted* journal_entries
  //    with entry_date ≤ asOf
  // 3. Aggregate line debits/credits per account_id
  // 4. Merge with opening_balance from chart_of_accounts
  // 5. Compute net balance → split into TB debit / TB credit columns

  const { data, isLoading, error } = useQuery({
    queryKey: ["trial_balance", tenant?.id, asOf],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      // ── Step 1: all active accounts ──────────────────────────────────────
      const { data: acctData, error: aErr } = await db
        .from("chart_of_accounts")
        .select("id,code,name,type,normal_balance,opening_balance")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code");
      if (aErr) throw aErr;

      const accounts = (acctData ?? []) as Account[];
      if (!accounts.length) return [];

      const acctMap = new Map<string, Account>(accounts.map((a) => [a.id, a]));

      // ── Step 2: posted journal entries up to asOf ────────────────────────
      const { data: headerData, error: hErr } = await db
        .from("journal_entries")
        .select("id")
        .is("deleted_at", null)
        .eq("status", "Posted")
        .lte("entry_date", asOf);
      if (hErr) throw hErr;

      const journalIds = ((headerData ?? []) as { id: string }[]).map((h) => h.id);

      // ── Step 3: aggregate lines ──────────────────────────────────────────
      const aggregated = new Map<string, { debit: number; credit: number }>();

      if (journalIds.length) {
        // Fetch in batches of 500 to stay under Supabase URL length limits
        const BATCH = 500;
        for (let i = 0; i < journalIds.length; i += BATCH) {
          const batch = journalIds.slice(i, i + BATCH);
          const { data: lineData, error: lErr } = await db
            .from("journal_lines")
            .select("account_id,debit,credit")
            .in("journal_id", batch);
          if (lErr) throw lErr;

          for (const l of (lineData ?? []) as { account_id: string; debit: number; credit: number }[]) {
            const prev = aggregated.get(l.account_id) ?? { debit: 0, credit: 0 };
            aggregated.set(l.account_id, {
              debit:  prev.debit  + (Number(l.debit)  || 0),
              credit: prev.credit + (Number(l.credit) || 0),
            });
          }
        }
      }

      // ── Step 4 & 5: build trial balance lines ────────────────────────────
      const lines: TrialBalanceLine[] = [];

      for (const acct of accounts) {
        const agg = aggregated.get(acct.id) ?? { debit: 0, credit: 0 };
        const opening = Number(acct.opening_balance) || 0;

        // Net balance from journal activity
        const journalNet = agg.debit - agg.credit; // positive = net debit activity

        // Combine opening balance (always treated as in the normal balance direction)
        // For a Debit-normal account:  net = opening + (debits - credits)
        // For a Credit-normal account: net = opening - (debits - credits) = opening + (credits - debits)
        let netBalance: number;
        if ((acct.normal_balance ?? "Debit") === "Debit") {
          netBalance = opening + journalNet;
        } else {
          netBalance = opening - journalNet;
        }

        // Place net in the correct TB column
        // Debit-normal: positive net → debit column, negative net → credit column (unusual)
        // Credit-normal: positive net → credit column, negative net → debit column (unusual)
        let tb_debit  = 0;
        let tb_credit = 0;

        if ((acct.normal_balance ?? "Debit") === "Debit") {
          if (netBalance >= 0) tb_debit  = netBalance;
          else                 tb_credit = Math.abs(netBalance); // contra situation
        } else {
          if (netBalance >= 0) tb_credit = netBalance;
          else                 tb_debit  = Math.abs(netBalance); // contra situation
        }

        lines.push({
          account_id:     acct.id,
          code:           acct.code,
          name:           acct.name,
          type:           acct.type,
          normal_balance: acct.normal_balance ?? "Debit",
          opening_balance: opening,
          total_debit:    agg.debit,
          total_credit:   agg.credit,
          net_balance:    netBalance,
          tb_debit,
          tb_credit,
        });
      }

      // Sort: type order → code
      lines.sort((a, b) => {
        const ta = TYPE_ORDER[a.type ?? ""] ?? 9;
        const tb = TYPE_ORDER[b.type ?? ""] ?? 9;
        if (ta !== tb) return ta - tb;
        return (a.code ?? "").localeCompare(b.code ?? "");
      });

      return lines;
    },
  });

  const allLines = data ?? [];

  // ── Apply search / type / zero-balance filter ──────────────────────────────
  const displayed = useMemo(() => {
    let rows = allLines;
    if (!showZero) rows = rows.filter((r) => r.tb_debit !== 0 || r.tb_credit !== 0);
    if (typeFilter !== "all") rows = rows.filter((r) => r.type === typeFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          (r.code ?? "").toLowerCase().includes(s),
      );
    }
    return rows;
  }, [allLines, showZero, typeFilter, search]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalDebit  = displayed.reduce((s, r) => s + r.tb_debit,  0);
  const totalCredit = displayed.reduce((s, r) => s + r.tb_credit, 0);
  const imbalance   = Math.abs(totalDebit - totalCredit);
  const isBalanced  = imbalance <= 0.005;

  // ── Group by type ──────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    if (!groupByType) return null;
    const map = new Map<string, TrialBalanceLine[]>();
    for (const row of displayed) {
      const key = row.type ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    // Return in type order
    return [...map.entries()].sort(
      ([a], [b]) => (TYPE_ORDER[a] ?? 9) - (TYPE_ORDER[b] ?? 9),
    );
  }, [displayed, groupByType]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Toolbar ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Trial Balance</h1>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          <div className="flex items-center gap-2">
            {/* As-of date */}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">As of</Label>
              <Input
                type="date"
                className="h-8 w-36 text-xs"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>

            <Separator orientation="vertical" className="h-5" />

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-44 pl-8 text-xs"
                placeholder="Search account…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch("")}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Type filter */}
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All types</option>
              <option value="Asset">Asset</option>
              <option value="Liability">Liability</option>
              <option value="Equity">Equity</option>
              <option value="Income">Income</option>
              <option value="Expense">Expense</option>
            </select>

            {/* Options */}
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                className="rounded"
                checked={showZero}
                onChange={(e) => setShowZero(e.target.checked)}
              />
              Show zero balances
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                className="rounded"
                checked={groupByType}
                onChange={(e) => setGroupByType(e.target.checked)}
              />
              Group by type
            </label>

            <Separator orientation="vertical" className="h-5" />

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => exportCsv(displayed, asOf, totalDebit, totalCredit)}
              disabled={displayed.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="shrink-0 px-6 py-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load trial balance: {(error as Error).message}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ── Imbalance warning ── */}
      {!isLoading && !error && displayed.length > 0 && !isBalanced && (
        <div className="shrink-0 px-6 py-2">
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <AlertDescription className="text-xs">
              <span className="font-semibold">Trial balance is out of balance.</span>{" "}
              Total debits ({fmtTotal(totalDebit)}) ≠ total credits ({fmtTotal(totalCredit)}).
              Difference:{" "}
              <span className="font-mono font-semibold">
                {fmtTotal(imbalance)}
              </span>
              . Review recent journal entries for unbalanced postings.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ── Report body (scrollable) ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Computing trial balance…
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Scale className="h-8 w-8 opacity-20" />
            <p className="text-sm">No accounts with posted activity as of {dateFmt(asOf)}.</p>
          </div>
        ) : (
          <div className="print:p-8">
            {/* ── Report heading (visible on print) ── */}
            <div className="hidden print:block mb-6 text-center">
              <p className="text-lg font-bold uppercase tracking-widest">Trial Balance</p>
              <p className="text-sm text-muted-foreground mt-0.5">{dateFmt(asOf)}</p>
            </div>

            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur print:bg-transparent print:static">
                <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-2.5 text-left w-20">Code</th>
                  <th className="px-4 py-2.5 text-left">Account Name</th>
                  <th className="px-4 py-2.5 text-left w-24">Type</th>
                  <th className="px-6 py-2.5 text-right w-36 whitespace-nowrap">Debit</th>
                  <th className="px-6 py-2.5 text-right w-36 whitespace-nowrap">Credit</th>
                  <th className="px-4 py-2.5 text-left w-28 whitespace-nowrap text-muted-foreground/60">Normal Bal.</th>
                </tr>
              </thead>

              <tbody>
                {groupByType && grouped
                  ? grouped.map(([type, rows]) => {
                      const groupDebit  = rows.reduce((s, r) => s + r.tb_debit,  0);
                      const groupCredit = rows.reduce((s, r) => s + r.tb_credit, 0);
                      return (
                        <TypeGroup
                          key={type}
                          type={type}
                          rows={rows}
                          groupDebit={groupDebit}
                          groupCredit={groupCredit}
                        />
                      );
                    })
                  : displayed.map((row) => <AccountRow key={row.account_id} row={row} />)
                }
              </tbody>

              {/* ── Grand total ── */}
              <tfoot>
                <tr className="border-t-2 border-foreground/20">
                  <td colSpan={3} />
                  <td className="px-6 py-2.5 border-t-0" colSpan={2}>
                    <div className="h-px bg-border mb-2" />
                  </td>
                  <td />
                </tr>
                <tr>
                  <td className="px-6 pb-4" />
                  <td className="px-4 pb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      TOTAL
                    </span>
                  </td>
                  <td />
                  <td className="px-6 pb-4 text-right">
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {fmtTotal(totalDebit)}
                    </span>
                  </td>
                  <td className="px-6 pb-4 text-right">
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {fmtTotal(totalCredit)}
                    </span>
                  </td>
                  <td className="px-4 pb-4">
                    {isBalanced ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Balanced
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Off by {fmtTotal(imbalance)}
                      </span>
                    )}
                  </td>
                </tr>
                {/* Double underline rule */}
                <tr>
                  <td colSpan={3} />
                  <td className="px-6 pt-0" colSpan={2}>
                    <div className="h-px bg-border" />
                    <div className="h-px bg-border mt-0.5" />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>

            {/* ── Balance status footer ── */}
            <div className="mt-4 px-6 pb-6 flex items-center justify-between text-xs text-muted-foreground print:hidden">
              <span>
                {displayed.length} account{displayed.length !== 1 ? "s" : ""}
                {!showZero && allLines.length > displayed.length && (
                  <> · {allLines.length - displayed.length} zero-balance accounts hidden</>
                )}
              </span>
              <span>As of {dateFmt(asOf)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function AccountRow({ row, indent = false }: { row: TrialBalanceLine; indent?: boolean }) {
  const isContra =
    (row.normal_balance === "Debit"   && row.tb_credit > 0) ||
    (row.normal_balance === "Credit"  && row.tb_debit  > 0);

  return (
    <tr className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
      {/* Code */}
      <td className={`px-6 py-2 whitespace-nowrap ${indent ? "pl-10" : ""}`}>
        <span className="font-mono text-xs text-muted-foreground">{row.code ?? "—"}</span>
      </td>

      {/* Name */}
      <td className="px-4 py-2">
        <span className={`text-sm ${isContra ? "italic text-muted-foreground" : "font-medium"}`}>
          {row.name}
        </span>
        {isContra && (
          <span className="ml-2 text-[10px] text-amber-500 font-medium">contra</span>
        )}
      </td>

      {/* Type */}
      <td className="px-4 py-2">
        <span
          className={`text-[11px] font-medium ${TYPE_CLASSES[row.type ?? ""] ?? "text-muted-foreground"}`}
        >
          {row.type}
        </span>
      </td>

      {/* Debit */}
      <td className="px-6 py-2 text-right whitespace-nowrap">
        {row.tb_debit > 0 ? (
          <span className="font-mono text-xs tabular-nums font-medium">
            {fmt(row.tb_debit)}
          </span>
        ) : (
          <span className="text-muted-foreground/25 text-xs select-none">—</span>
        )}
      </td>

      {/* Credit */}
      <td className="px-6 py-2 text-right whitespace-nowrap">
        {row.tb_credit > 0 ? (
          <span className="font-mono text-xs tabular-nums font-medium">
            {fmt(row.tb_credit)}
          </span>
        ) : (
          <span className="text-muted-foreground/25 text-xs select-none">—</span>
        )}
      </td>

      {/* Normal balance indicator */}
      <td className="px-4 py-2">
        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">
          {row.normal_balance}
        </span>
      </td>
    </tr>
  );
}

function TypeGroup({
  type,
  rows,
  groupDebit,
  groupCredit,
}: {
  type: string;
  rows: TrialBalanceLine[];
  groupDebit: number;
  groupCredit: number;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Group header row */}
      <tr
        className={`border-t cursor-pointer select-none ${TYPE_BG[type] ?? "bg-muted/10"} hover:opacity-80 transition-opacity`}
        onClick={() => setCollapsed((c) => !c)}
      >
        <td className="px-6 py-1.5" />
        <td className="px-4 py-1.5" colSpan={2}>
          <div className="flex items-center gap-1.5">
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform text-muted-foreground ${
                collapsed ? "" : "rotate-90"
              }`}
            />
            <span
              className={`text-[11px] font-bold uppercase tracking-widest ${
                TYPE_CLASSES[type] ?? "text-muted-foreground"
              }`}
            >
              {type}
            </span>
            <span className="text-[10px] text-muted-foreground ml-1">
              ({rows.length} account{rows.length !== 1 ? "s" : ""})
            </span>
          </div>
        </td>
        {/* Group subtotals */}
        <td className="px-6 py-1.5 text-right">
          {groupDebit > 0 && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground font-medium">
              {fmtTotal(groupDebit)}
            </span>
          )}
        </td>
        <td className="px-6 py-1.5 text-right">
          {groupCredit > 0 && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground font-medium">
              {fmtTotal(groupCredit)}
            </span>
          )}
        </td>
        <td className="px-4 py-1.5" />
      </tr>

      {/* Account rows */}
      {!collapsed &&
        rows.map((row) => <AccountRow key={row.account_id} row={row} indent />)}

      {/* Group subtotal underline */}
      {!collapsed && (
        <tr className="border-b">
          <td colSpan={3} />
          <td className="px-6 pb-1">
            <div className="h-px bg-border/60" />
          </td>
          <td className="px-6 pb-1">
            <div className="h-px bg-border/60" />
          </td>
          <td />
        </tr>
      )}
    </>
  );
}
