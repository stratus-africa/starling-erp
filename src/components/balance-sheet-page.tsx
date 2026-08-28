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
  LayoutList,
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

interface BsLine {
  account_id: string;
  code: string | null;
  name: string;
  type: string | null;
  // Positive = carrying value in the account's natural direction.
  // Assets:      positive = debit balance (what we own)
  // Liabilities: positive = credit balance (what we owe)
  // Equity:      positive = credit balance (owners' stake)
  amount: number;
  isSynthetic?: boolean; // true for Retained Earnings / Current Year Profit
}

type BsSectionKey =
  | "assets"
  | "total_assets"
  | "liabilities"
  | "total_liabilities"
  | "equity"
  | "total_equity"
  | "total_l_e";

interface BsSection {
  key: BsSectionKey;
  label: string;
  lines: BsLine[];
  total: number;
  isSubtotal: boolean;
  totalLabel: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as any;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

const fmtMoney = (v: number): string =>
  Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtSigned = (v: number): string =>
  v < 0 ? `(${fmtMoney(v)})` : v === 0 ? "—" : fmtMoney(v);

function longDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────────────────────────────────────

function exportCsv(sections: BsSection[], asOf: string) {
  const rows: string[] = [`"Balance Sheet"`, `"As of ${longDate(asOf)}"`, ""];
  for (const s of sections) {
    if (s.isSubtotal) {
      rows.push(`"${s.totalLabel}","",${s.total.toFixed(2)}`);
      rows.push("");
      continue;
    }
    rows.push(`"${s.label}"`);
    for (const l of s.lines) {
      rows.push(
        `"${(l.code ?? "").replace(/"/g, '""')}","${l.name.replace(/"/g, '""')}",${l.amount.toFixed(2)}`,
      );
    }
    rows.push(`"${s.totalLabel}","",${s.total.toFixed(2)}`);
    rows.push("");
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `balance-sheet-${asOf}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core aggregation (shared by both the BS balance fetch and the P&L sub-query)
// ─────────────────────────────────────────────────────────────────────────────

async function aggregateLines(
  journalIds: string[],
  acctIds: string[],
): Promise<Map<string, { debit: number; credit: number }>> {
  const result = new Map<string, { debit: number; credit: number }>();
  if (!journalIds.length || !acctIds.length) return result;

  const BATCH = 500;
  for (let i = 0; i < journalIds.length; i += BATCH) {
    const batch = journalIds.slice(i, i + BATCH);
    const { data: lineData, error } = await db
      .from("journal_lines")
      .select("account_id,debit,credit")
      .in("journal_id", batch)
      .in("account_id", acctIds);
    if (error) throw error;

    for (const l of (lineData ?? []) as { account_id: string; debit: number; credit: number }[]) {
      const prev = result.get(l.account_id) ?? { debit: 0, credit: 0 };
      result.set(l.account_id, {
        debit:  prev.debit  + (Number(l.debit)  || 0),
        credit: prev.credit + (Number(l.credit) || 0),
      });
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSections — pure function producing the BS section list
// ─────────────────────────────────────────────────────────────────────────────

function buildSections(
  accounts: Account[],
  bsAgg:    Map<string, { debit: number; credit: number }>,
  currentYearProfit: number,
): BsSection[] {
  const byCode = (a: BsLine, b: BsLine) => (a.code ?? "").localeCompare(b.code ?? "");

  // ── Build a resolved line per account ─────────────────────────────────────
  const assetLines:     BsLine[] = [];
  const liabilityLines: BsLine[] = [];
  const equityLines:    BsLine[] = [];

  for (const acct of accounts) {
    const agg     = bsAgg.get(acct.id) ?? { debit: 0, credit: 0 };
    const opening = Number(acct.opening_balance) || 0;

    // Net balance (in the account's normal direction):
    //   Debit-normal  (Asset, some Expense): opening + debits − credits
    //   Credit-normal (Liability, Equity):   opening + credits − debits
    let amount: number;
    if ((acct.normal_balance ?? "Debit") === "Debit") {
      amount = opening + agg.debit - agg.credit;
    } else {
      amount = opening + agg.credit - agg.debit;
    }

    const line: BsLine = {
      account_id: acct.id,
      code:       acct.code,
      name:       acct.name,
      type:       acct.type,
      amount,
    };

    if (acct.type === "Asset")     assetLines.push(line);
    if (acct.type === "Liability") liabilityLines.push(line);
    if (acct.type === "Equity")    equityLines.push(line);
  }

  // Add synthetic equity lines (computed from P&L, not real accounts)
  // Retained Earnings = prior-period accumulated profit embedded in equity opening balances —
  // we derive it as: (total equity opening balances) minus the chart equity account balances.
  // Simplest correct approach: show Current Year Profit as a synthetic line.
  // Retained Earnings appears only when there is prior-period equity not captured by explicit accounts.
  equityLines.push({
    account_id: "__current_year_profit__",
    code:       null,
    name:       "Current Year Profit",
    type:       "Equity",
    amount:     currentYearProfit,
    isSynthetic: true,
  });

  assetLines.sort(byCode);
  liabilityLines.sort(byCode);
  equityLines.sort(byCode);

  const totalAssets      = assetLines.reduce((s, l) => s + l.amount, 0);
  const totalLiabilities = liabilityLines.reduce((s, l) => s + l.amount, 0);
  const totalEquity      = equityLines.reduce((s, l) => s + l.amount, 0);
  const totalLE          = totalLiabilities + totalEquity;

  const sections: BsSection[] = [
    {
      key:        "assets",
      label:      "Assets",
      lines:      assetLines,
      total:      totalAssets,
      isSubtotal: false,
      totalLabel: "Total Assets",
    },
    {
      key:        "total_assets",
      label:      "",
      lines:      [],
      total:      totalAssets,
      isSubtotal: true,
      totalLabel: "Total Assets",
    },
    {
      key:        "liabilities",
      label:      "Liabilities",
      lines:      liabilityLines,
      total:      totalLiabilities,
      isSubtotal: false,
      totalLabel: "Total Liabilities",
    },
    {
      key:        "equity",
      label:      "Equity",
      lines:      equityLines,
      total:      totalEquity,
      isSubtotal: false,
      totalLabel: "Total Equity",
    },
    {
      key:        "total_equity",
      label:      "",
      lines:      [],
      total:      totalEquity,
      isSubtotal: true,
      totalLabel: "Total Equity",
    },
    {
      key:        "total_l_e",
      label:      "",
      lines:      [],
      total:      totalLE,
      isSubtotal: true,
      totalLabel: "Total Liabilities + Equity",
    },
  ];

  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function BalanceSheetPage() {
  const { tenant } = useAuth();

  const todayIso = isoDate(new Date());
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [asOf,     setAsOf]     = useState(todayIso);
  const [showZero, setShowZero] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setCollapsed((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // ── Data fetch ─────────────────────────────────────────────────────────────
  // Balance Sheet is a point-in-time statement. Steps:
  //
  // A. Fetch all Balance Sheet accounts (Asset, Liability, Equity) from chart_of_accounts
  // B. Fetch all Income/Expense accounts (for P&L sub-query)
  // C. Fetch ALL posted journal entry IDs up to asOf
  // D. Fetch posted entry IDs for THIS FISCAL YEAR up to asOf (for Current Year Profit)
  // E. Aggregate BS lines (step C) for BS accounts → compute asset/liability/equity balances
  // F. Aggregate P&L lines (step D) for income/expense accounts → compute current year profit
  // G. Build sections and check Assets = L + E

  const { data, isLoading, error } = useQuery({
    queryKey: ["balance_sheet", tenant?.id, asOf],
    enabled:  !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      // ── A: BS accounts ──────────────────────────────────────────────────────
      const { data: bsAcctData, error: aErr } = await db
        .from("chart_of_accounts")
        .select("id,code,name,type,normal_balance,opening_balance")
        .is("deleted_at", null)
        .eq("is_active", true)
        .in("type", ["Asset", "Liability", "Equity"])
        .order("code");
      if (aErr) throw aErr;

      const bsAccounts = (bsAcctData ?? []) as Account[];
      const bsAcctIds  = bsAccounts.map((a) => a.id);

      // ── B: P&L accounts ─────────────────────────────────────────────────────
      const { data: plAcctData, error: bErr } = await db
        .from("chart_of_accounts")
        .select("id,code,name,type,normal_balance,opening_balance")
        .is("deleted_at", null)
        .eq("is_active", true)
        .in("type", ["Income", "Expense"])
        .order("code");
      if (bErr) throw bErr;

      const plAccounts = (plAcctData ?? []) as Account[];
      const plAcctIds  = plAccounts.map((a) => a.id);

      // ── C: All posted entry IDs up to asOf (for balance sheet balances) ────
      const { data: allHeaders, error: cErr } = await db
        .from("journal_entries")
        .select("id")
        .is("deleted_at", null)
        .eq("status", "Posted")
        .lte("entry_date", asOf);
      if (cErr) throw cErr;
      const allJournalIds = ((allHeaders ?? []) as { id: string }[]).map((h) => h.id);

      // ── D: Posted entry IDs for current fiscal year up to asOf (for P&L) ──
      const { data: ytdHeaders, error: dErr } = await db
        .from("journal_entries")
        .select("id")
        .is("deleted_at", null)
        .eq("status", "Posted")
        .gte("entry_date", yearStart)
        .lte("entry_date", asOf);
      if (dErr) throw dErr;
      const ytdJournalIds = ((ytdHeaders ?? []) as { id: string }[]).map((h) => h.id);

      // ── E: Aggregate BS account lines (all time up to asOf) ─────────────────
      const bsAgg = await aggregateLines(allJournalIds, bsAcctIds);

      // ── F: Aggregate P&L lines (current fiscal year up to asOf) ────────────
      const plAgg = await aggregateLines(ytdJournalIds, plAcctIds);

      // Compute current year net profit from P&L aggregation
      let currentYearProfit = 0;
      for (const acct of plAccounts) {
        const agg = plAgg.get(acct.id) ?? { debit: 0, credit: 0 };
        if (acct.type === "Income") {
          currentYearProfit += agg.credit - agg.debit;  // credit-normal: profit when credits > debits
        } else {
          currentYearProfit -= agg.debit - agg.credit;  // expense reduces profit
        }
      }

      // ── G: Build sections ───────────────────────────────────────────────────
      return buildSections(bsAccounts, bsAgg, currentYearProfit);
    },
  });

  // ── Derived values ────────────────────────────────────────────────────────
  const allSections = data ?? [];

  const displayedSections = useMemo((): BsSection[] => {
    if (!allSections.length) return [];
    return allSections.map((s) => ({
      ...s,
      lines: showZero ? s.lines : s.lines.filter((l) => l.amount !== 0),
    }));
  }, [allSections, showZero]);

  const totalAssets = displayedSections.find((s) => s.key === "total_assets")?.total ?? 0;
  const totalLE     = displayedSections.find((s) => s.key === "total_l_e")?.total    ?? 0;
  const imbalance   = Math.abs(totalAssets - totalLE);
  const isBalanced  = imbalance <= 0.005;

  const totalLiabilities = displayedSections.find((s) => s.key === "liabilities")?.total ?? 0;
  const totalEquity      = displayedSections.find((s) => s.key === "equity")?.total      ?? 0;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Toolbar ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap gap-y-2">
          <div className="flex items-center gap-2">
            <LayoutList className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Balance Sheet</h1>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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

            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                className="rounded"
                checked={showZero}
                onChange={(e) => setShowZero(e.target.checked)}
              />
              Show zero balances
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
              onClick={() => exportCsv(displayedSections, asOf)}
              disabled={!displayedSections.length}
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
              Failed to load balance sheet: {(error as Error).message}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ── Imbalance warning ── */}
      {!isLoading && !error && totalAssets !== 0 && !isBalanced && (
        <div className="shrink-0 px-6 py-2">
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <AlertDescription className="text-xs">
              <span className="font-semibold">Balance sheet is out of balance.</span>{" "}
              Total Assets ({fmtMoney(totalAssets)}) ≠ Total Liabilities + Equity (
              {fmtMoney(totalLE)}). Difference:{" "}
              <span className="font-mono font-semibold">{fmtMoney(imbalance)}</span>.
              Check for unposted entries or missing equity accounts.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ── Report body ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Computing balance sheet…
          </div>
        ) : !displayedSections.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <LayoutList className="h-8 w-8 opacity-20" />
            <p className="text-sm">No posted account balances as of {longDate(asOf)}.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl px-6 py-6 print:px-8 print:py-8">

            {/* ── Print heading ── */}
            <div className="hidden print:block mb-8 text-center">
              <p className="text-xl font-bold uppercase tracking-widest">Balance Sheet</p>
              <p className="text-sm text-muted-foreground mt-1">As of {longDate(asOf)}</p>
            </div>

            {/* ── As-of label (screen) ── */}
            <p className="text-xs text-muted-foreground mb-5 print:hidden">
              As of {longDate(asOf)}
            </p>

            {/* ── KPI cards ── */}
            <div className="grid grid-cols-3 gap-3 mb-8 print:hidden">
              <KpiCard label="Total Assets"      value={totalAssets}      color="blue" />
              <KpiCard label="Total Liabilities" value={totalLiabilities} color="red"  />
              <KpiCard
                label="Total Equity"
                value={totalEquity}
                color={totalEquity >= 0 ? "emerald" : "red"}
                large
              />
            </div>

            {/* ── Balance check banner ── */}
            {!isLoading && totalAssets !== 0 && (
              <div
                className={`mb-6 flex items-center gap-2 rounded-md border px-3 py-2 text-xs print:hidden ${
                  isBalanced
                    ? "border-emerald-500/20 bg-emerald-500/6 text-emerald-700 dark:text-emerald-300"
                    : "border-destructive/20 bg-destructive/6 text-destructive"
                }`}
              >
                {isBalanced ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-semibold">Balanced.</span>{" "}
                      Assets ({fmtMoney(totalAssets)}) = Liabilities ({fmtMoney(totalLiabilities)})
                      + Equity ({fmtMoney(totalEquity)}).
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-semibold">Out of balance by {fmtMoney(imbalance)}.</span>{" "}
                      Assets ({fmtMoney(totalAssets)}) ≠ L + E ({fmtMoney(totalLE)}).
                    </span>
                  </>
                )}
              </div>
            )}

            {/* ── Statement sections ── */}
            <div className="space-y-0">
              {displayedSections.map((section) => (
                <BsSection
                  key={section.key}
                  section={section}
                  collapsed={collapsed.has(section.key)}
                  onToggle={() => toggle(section.key)}
                />
              ))}
            </div>

            {/* ── Footer ── */}
            <p className="mt-8 text-[11px] text-muted-foreground text-center print:hidden">
              Includes all posted journal entries up to {longDate(asOf)}.
              Current Year Profit computed from {new Date().getFullYear()} activity.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiCard
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
  large = false,
}: {
  label: string;
  value: number;
  color: "blue" | "red" | "emerald";
  large?: boolean;
}) {
  const colorCls: Record<string, string> = {
    blue:    "text-blue-600 dark:text-blue-400",
    red:     "text-red-600 dark:text-red-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
  };
  const bgCls: Record<string, string> = {
    blue:    "bg-blue-500/6 border-blue-500/15",
    red:     "bg-red-500/6 border-red-500/15",
    emerald: "bg-emerald-500/6 border-emerald-500/15",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 ${large ? bgCls[color] : "border-border/60"}`}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
        {label}
      </p>
      <p className={`font-mono font-bold tabular-nums ${large ? "text-xl" : "text-base"} ${colorCls[color]}`}>
        {value < 0 ? "(" : ""}
        {fmtMoney(Math.abs(value))}
        {value < 0 ? ")" : ""}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BsSection — renders one section of the balance sheet
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_COLORS: Record<string, string> = {
  assets:      "text-blue-600 dark:text-blue-400",
  liabilities: "text-red-600 dark:text-red-400",
  equity:      "text-violet-600 dark:text-violet-400",
};

const SECTION_LABELS_MAP: Record<string, string> = {
  assets:      "Assets",
  liabilities: "Liabilities",
  equity:      "Equity",
};

function BsSection({
  section,
  collapsed,
  onToggle,
}: {
  section: BsSection;
  collapsed: boolean;
  onToggle: () => void;
}) {
  // ── Grand total rows (Total Assets / Total Equity / Total L+E) ────────────
  if (section.isSubtotal) {
    const isGrandTotal = section.key === "total_l_e";
    const isAssets     = section.key === "total_assets";

    return (
      <div className={`${isAssets ? "mb-8" : "mb-2"}`}>
        <div className="border-t border-border/60" />
        <div className="flex items-center justify-between px-2 py-2">
          <span
            className={`font-bold tracking-tight ${
              isGrandTotal ? "text-base" : "text-sm"
            }`}
          >
            {section.totalLabel}
          </span>
          <span
            className={`font-mono font-bold tabular-nums ${
              isGrandTotal ? "text-base" : "text-sm"
            }`}
          >
            {fmtSigned(section.total)}
          </span>
        </div>
        {/* Double underline only on grand total */}
        {isGrandTotal && (
          <>
            <div className="border-t border-foreground/30" />
            <div className="border-t border-foreground/30 mt-0.5" />
          </>
        )}
        {/* Single underline on subtotals */}
        {!isGrandTotal && <div className="border-t border-border/40" />}
      </div>
    );
  }

  // ── Regular section (Assets / Liabilities / Equity) ──────────────────────
  const sectionKey = section.key as string;
  const headingColor = SECTION_COLORS[sectionKey] ?? "text-muted-foreground";

  return (
    <div className="mb-1">
      {/* Section heading — collapsible */}
      <button
        className="w-full flex items-center justify-between px-2 py-2 rounded hover:bg-muted/40 transition-colors select-none"
        onClick={onToggle}
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
              collapsed ? "" : "rotate-90"
            }`}
          />
          <span
            className={`text-[11px] font-bold uppercase tracking-widest ${headingColor}`}
          >
            {SECTION_LABELS_MAP[sectionKey] ?? section.label}
          </span>
          {section.lines.length > 0 && (
            <span className="text-[10px] text-muted-foreground/50 ml-0.5">
              ({section.lines.length})
            </span>
          )}
        </div>
        {collapsed && (
          <span className="font-mono text-xs tabular-nums font-medium text-muted-foreground">
            {fmtSigned(section.total)}
          </span>
        )}
      </button>

      {/* Account lines */}
      {!collapsed && (
        <>
          {section.lines.length === 0 ? (
            <p className="px-9 py-2 text-xs text-muted-foreground italic">
              No balances in this category.
            </p>
          ) : (
            <div className="mb-1">
              {section.lines.map((line) => (
                <div
                  key={line.account_id}
                  className="flex items-center justify-between px-9 py-1.5 hover:bg-muted/30 rounded transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {!line.isSynthetic && (
                      <span className="font-mono text-[11px] text-muted-foreground/50 w-10 shrink-0 text-right">
                        {line.code ?? ""}
                      </span>
                    )}
                    {line.isSynthetic && <span className="w-10 shrink-0" />}
                    <span
                      className={`text-sm truncate ${
                        line.isSynthetic ? "italic text-muted-foreground" : ""
                      }`}
                    >
                      {line.name}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-sm tabular-nums shrink-0 ml-4 ${
                      line.amount === 0
                        ? "text-muted-foreground/30"
                        : line.amount < 0
                        ? "text-red-600 dark:text-red-400"
                        : ""
                    }`}
                  >
                    {line.amount === 0
                      ? "—"
                      : line.amount < 0
                      ? `(${fmtMoney(Math.abs(line.amount))})`
                      : fmtMoney(line.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Section subtotal line */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="h-px flex-1 bg-border/40 mr-4" />
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {section.totalLabel}
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {fmtSigned(section.total)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
