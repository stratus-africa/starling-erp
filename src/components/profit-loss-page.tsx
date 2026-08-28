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
  ChevronRight,
  Download,
  Loader2,
  Printer,
  TrendingUp,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  normal_balance: string;
  opening_balance: number;
}

interface PnlLine {
  account_id: string;
  code: string | null;
  name: string;
  type: string | null;
  // Net contribution to P&L in the intuitive sign:
  //   Income accounts: positive = revenue earned
  //   Expense / COGS accounts: positive = cost incurred
  amount: number;
}

// The five P&L sections. We map account types → section buckets below.
type SectionKey = "revenue" | "cogs" | "gross_profit" | "opex" | "net_profit";

interface Section {
  key: SectionKey;
  label: string;
  lines: PnlLine[];
  total: number;
  isSubtotal: boolean;      // true = computed row, not a data section
  totalLabel: string;
  positiveIsGood: boolean;  // drives colour of the section total
}

// ─────────────────────────────────────────────────────────────────────────────
// Period presets
// ─────────────────────────────────────────────────────────────────────────────

type Preset =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "custom";

interface DateRange { from: string; to: string }

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getRangeForPreset(preset: Preset, customFrom: string, customTo: string): DateRange {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth(); // 0-indexed

  switch (preset) {
    case "this_month":
      return {
        from: isoDate(new Date(y, m, 1)),
        to:   isoDate(new Date(y, m + 1, 0)),
      };
    case "last_month":
      return {
        from: isoDate(new Date(y, m - 1, 1)),
        to:   isoDate(new Date(y, m, 0)),
      };
    case "this_quarter": {
      const qStart = Math.floor(m / 3) * 3;
      return {
        from: isoDate(new Date(y, qStart, 1)),
        to:   isoDate(new Date(y, qStart + 3, 0)),
      };
    }
    case "last_quarter": {
      const qStart = Math.floor(m / 3) * 3 - 3;
      return {
        from: isoDate(new Date(y, qStart, 1)),
        to:   isoDate(new Date(y, qStart + 3, 0)),
      };
    }
    case "this_year":
      return {
        from: `${y}-01-01`,
        to:   `${y}-12-31`,
      };
    case "last_year":
      return {
        from: `${y - 1}-01-01`,
        to:   `${y - 1}-12-31`,
      };
    case "custom":
      return { from: customFrom, to: customTo };
  }
}

const PRESET_LABELS: Record<Preset, string> = {
  this_month:   "This month",
  last_month:   "Last month",
  this_quarter: "This quarter",
  last_quarter: "Last quarter",
  this_year:    "This year",
  last_year:    "Last year",
  custom:       "Custom range",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as any;

/** Format a monetary amount, parentheses for negative (cost convention). */
function fmtAmt(v: number, parenthesesForNegative = false): string {
  if (v === 0) return "—";
  const abs = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (parenthesesForNegative && v < 0) return `(${abs})`;
  return v < 0 ? `(${abs})` : abs;
}

function fmtTotal(v: number): string {
  return Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function periodLabel(range: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  const from = new Date(range.from + "T00:00:00").toLocaleDateString(undefined, opts);
  const to   = new Date(range.to   + "T00:00:00").toLocaleDateString(undefined, opts);
  return `${from} – ${to}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────────────────────────────────────

function exportCsv(sections: Section[], range: DateRange) {
  const rows: string[] = [`"Profit & Loss"`, `"${periodLabel(range)}"`, ""];
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
  const a    = Object.assign(document.createElement("a"), {
    href: url,
    download: `profit-loss-${range.from}-to-${range.to}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ProfitLossPage() {
  const { tenant } = useAuth();

  const [preset,     setPreset]     = useState<Preset>("this_month");
  const [customFrom, setCustomFrom] = useState(isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo,   setCustomTo]   = useState(isoDate(new Date()));
  const [showZero,   setShowZero]   = useState(false);
  const [collapsed,  setCollapsed]  = useState<Set<string>>(new Set());

  const range = useMemo(
    () => getRangeForPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const toggleSection = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // ── Data fetch ─────────────────────────────────────────────────────────────
  // 1. All Income + Expense accounts
  // 2. Posted journal entries in [range.from, range.to]
  // 3. Journal lines for those entries, restricted to Income/Expense accounts
  // 4. Aggregate per account, compute P&L contribution
  // 5. Classify into revenue / cogs / opex buckets

  const { data: sections, isLoading, error } = useQuery<Section[]>({
    queryKey: ["profit_loss", tenant?.id, range.from, range.to],
    enabled:  !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      // ── Step 1: Income & Expense accounts ─────────────────────────────────
      const { data: acctData, error: aErr } = await db
        .from("chart_of_accounts")
        .select("id,code,name,type,normal_balance,opening_balance")
        .is("deleted_at", null)
        .eq("is_active", true)
        .in("type", ["Income", "Expense"])
        .order("code");
      if (aErr) throw aErr;

      const accounts = (acctData ?? []) as Account[];
      const acctMap  = new Map<string, Account>(accounts.map((a) => [a.id, a]));
      const acctIds  = accounts.map((a) => a.id);

      if (!acctIds.length) return buildSections([], [], new Map());

      // ── Step 2: posted journal entries in period ───────────────────────────
      const { data: headerData, error: hErr } = await db
        .from("journal_entries")
        .select("id")
        .is("deleted_at", null)
        .eq("status", "Posted")
        .gte("entry_date", range.from)
        .lte("entry_date", range.to);
      if (hErr) throw hErr;

      const journalIds = ((headerData ?? []) as { id: string }[]).map((h) => h.id);

      // ── Step 3 & 4: aggregate lines ────────────────────────────────────────
      const aggregated = new Map<string, { debit: number; credit: number }>();

      if (journalIds.length) {
        const BATCH = 500;
        for (let i = 0; i < journalIds.length; i += BATCH) {
          const batch = journalIds.slice(i, i + BATCH);
          const { data: lineData, error: lErr } = await db
            .from("journal_lines")
            .select("account_id,debit,credit")
            .in("journal_id", batch)
            .in("account_id", acctIds);
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

      return buildSections(accounts, acctIds, aggregated);
    },
  });

  // ── Apply zero-balance filter ──────────────────────────────────────────────
  const displayedSections = useMemo(() => {
    if (!sections) return [];
    if (showZero) return sections;
    return sections.map((s) => ({
      ...s,
      lines: s.lines.filter((l) => l.amount !== 0),
    }));
  }, [sections, showZero]);

  const grossProfit = displayedSections.find((s) => s.key === "gross_profit")?.total ?? 0;
  const netProfit   = displayedSections.find((s) => s.key === "net_profit")?.total   ?? 0;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Toolbar ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap gap-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Profit &amp; Loss</h1>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Period presets */}
            <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
              {(Object.keys(PRESET_LABELS) as Preset[])
                .filter((p) => p !== "custom")
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => setPreset(p)}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      preset === p
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {PRESET_LABELS[p]}
                  </button>
                ))}
              <button
                onClick={() => setPreset("custom")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  preset === "custom"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Custom
              </button>
            </div>

            {/* Custom range inputs */}
            {preset === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  className="h-8 w-32 text-xs"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  className="h-8 w-32 text-xs"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            )}

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
              onClick={() => displayedSections.length && exportCsv(displayedSections, range)}
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
              Failed to load P&amp;L: {(error as Error).message}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ── Report body ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Computing P&amp;L…
          </div>
        ) : !displayedSections.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <TrendingUp className="h-8 w-8 opacity-20" />
            <p className="text-sm">No posted income or expense activity in this period.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-6 py-6 print:px-8 print:py-8">

            {/* ── Print heading ── */}
            <div className="hidden print:block mb-8 text-center">
              <p className="text-xl font-bold uppercase tracking-widest">Profit &amp; Loss</p>
              <p className="text-sm text-muted-foreground mt-1">{periodLabel(range)}</p>
            </div>

            {/* ── Period label (screen) ── */}
            <p className="text-xs text-muted-foreground mb-6 print:hidden">{periodLabel(range)}</p>

            {/* ── KPI bar ── */}
            <div className="grid grid-cols-3 gap-3 mb-8 print:hidden">
              <KpiCard
                label="Revenue"
                value={displayedSections.find((s) => s.key === "revenue")?.total ?? 0}
                color="emerald"
              />
              <KpiCard
                label="Gross Profit"
                value={grossProfit}
                color={grossProfit >= 0 ? "emerald" : "red"}
              />
              <KpiCard
                label="Net Profit"
                value={netProfit}
                color={netProfit >= 0 ? "emerald" : "red"}
                large
              />
            </div>

            {/* ── Statement ── */}
            <div className="space-y-0">
              {displayedSections.map((section) => (
                <ReportSection
                  key={section.key}
                  section={section}
                  collapsed={collapsed.has(section.key)}
                  onToggle={() => toggleSection(section.key)}
                />
              ))}
            </div>

            {/* ── Footer ── */}
            <p className="mt-8 text-[11px] text-muted-foreground text-center print:hidden">
              Includes all posted journal entries from {periodLabel(range)}.
              Figures in functional currency.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSections — pure function that assembles the P&L structure
// ─────────────────────────────────────────────────────────────────────────────

function buildSections(
  accounts: Account[],
  _acctIds: string[],
  aggregated: Map<string, { debit: number; credit: number }>,
): Section[] {
  const pnlLines: PnlLine[] = accounts.map((acct) => {
    const agg    = aggregated.get(acct.id) ?? { debit: 0, credit: 0 };
    const isIncome = acct.type === "Income";

    // Income accounts are credit-normal:
    //   net income = credits - debits  (positive = earned revenue)
    // Expense accounts are debit-normal:
    //   net expense = debits - credits (positive = cost incurred)
    const amount = isIncome
      ? agg.credit - agg.debit
      : agg.debit  - agg.credit;

    return {
      account_id: acct.id,
      code:       acct.code,
      name:       acct.name,
      type:       acct.type,
      amount,
    };
  });

  // ── Classify into buckets ─────────────────────────────────────────────────
  // Revenue:  all Income accounts
  // COGS:     Expense accounts whose code starts with 5 (5xxx)
  // OpEx:     all other Expense accounts (6xxx, 7xxx, etc.)
  const revenue = pnlLines.filter((l) => l.type === "Income");
  const cogs    = pnlLines.filter(
    (l) => l.type === "Expense" && (l.code ?? "").startsWith("5"),
  );
  const opex    = pnlLines.filter(
    (l) => l.type === "Expense" && !(l.code ?? "").startsWith("5"),
  );

  const totalRevenue = revenue.reduce((s, l) => s + l.amount, 0);
  const totalCogs    = cogs.reduce((s, l) => s + l.amount, 0);
  const grossProfit  = totalRevenue - totalCogs;
  const totalOpex    = opex.reduce((s, l) => s + l.amount, 0);
  const netProfit    = grossProfit - totalOpex;

  // Sort each group by code
  const byCode = (a: PnlLine, b: PnlLine) =>
    (a.code ?? "").localeCompare(b.code ?? "");

  const sections: Section[] = [
    {
      key:           "revenue",
      label:         "Revenue",
      lines:         [...revenue].sort(byCode),
      total:         totalRevenue,
      isSubtotal:    false,
      totalLabel:    "Total Revenue",
      positiveIsGood: true,
    },
    {
      key:           "cogs",
      label:         "Cost of Goods Sold",
      lines:         [...cogs].sort(byCode),
      total:         totalCogs,
      isSubtotal:    false,
      totalLabel:    "Total COGS",
      positiveIsGood: false,
    },
    {
      key:           "gross_profit",
      label:         "Gross Profit",
      lines:         [],
      total:         grossProfit,
      isSubtotal:    true,
      totalLabel:    "Gross Profit",
      positiveIsGood: true,
    },
    {
      key:           "opex",
      label:         "Operating Expenses",
      lines:         [...opex].sort(byCode),
      total:         totalOpex,
      isSubtotal:    false,
      totalLabel:    "Total Operating Expenses",
      positiveIsGood: false,
    },
    {
      key:           "net_profit",
      label:         "Net Profit",
      lines:         [],
      total:         netProfit,
      isSubtotal:    true,
      totalLabel:    "Net Profit",
      positiveIsGood: true,
    },
  ];

  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
  large = false,
}: {
  label: string;
  value: number;
  color: "emerald" | "red";
  large?: boolean;
}) {
  const colorCls =
    color === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";
  const bgCls =
    color === "emerald"
      ? "bg-emerald-500/6 border-emerald-500/15"
      : "bg-red-500/6 border-red-500/15";

  return (
    <div className={`rounded-lg border px-4 py-3 ${large ? bgCls : "border-border/60"}`}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
        {label}
      </p>
      <p className={`font-mono font-bold tabular-nums ${large ? "text-xl" : "text-base"} ${colorCls}`}>
        {value < 0 ? "(" : ""}
        {Math.abs(value).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
        {value < 0 ? ")" : ""}
      </p>
    </div>
  );
}

function ReportSection({
  section,
  collapsed,
  onToggle,
}: {
  section: Section;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const isPositive = section.total >= 0;
  const isGood     = section.positiveIsGood ? isPositive : !isPositive;
  const totalColor = isGood
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-red-700 dark:text-red-400";

  // ── Subtotal row (Gross Profit / Net Profit) ──────────────────────────────
  if (section.isSubtotal) {
    return (
      <div className="mt-1 mb-4">
        {/* Single rule above */}
        <div className="border-t border-border/60 mx-0" />
        <div className="flex items-center justify-between px-2 py-2.5">
          <span className="text-sm font-bold tracking-tight">{section.totalLabel}</span>
          <div className="flex items-center gap-3">
            {/* Amount */}
            <span className={`font-mono text-base font-bold tabular-nums ${totalColor}`}>
              {section.total < 0 ? "(" : ""}
              {fmtTotal(section.total)}
              {section.total < 0 ? ")" : ""}
            </span>
          </div>
        </div>
        {/* Double rule below */}
        <div className="border-t border-border mx-0" />
        <div className="border-t border-border mx-0 mt-0.5" />
      </div>
    );
  }

  // ── Normal section (Revenue / COGS / OpEx) ────────────────────────────────
  return (
    <div className="mb-2">
      {/* Section header */}
      <button
        className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/40 transition-colors group select-none"
        onClick={onToggle}
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
              collapsed ? "" : "rotate-90"
            }`}
          />
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {section.label}
          </span>
          {section.lines.length > 0 && (
            <span className="text-[10px] text-muted-foreground/50 ml-0.5">
              ({section.lines.length})
            </span>
          )}
        </div>
        {/* Show subtotal when collapsed */}
        {collapsed && (
          <span className={`font-mono text-xs tabular-nums font-medium ${totalColor}`}>
            {section.total < 0 ? "(" : ""}
            {fmtTotal(section.total)}
            {section.total < 0 ? ")" : ""}
          </span>
        )}
      </button>

      {/* Account lines */}
      {!collapsed && (
        <>
          {section.lines.length === 0 ? (
            <p className="px-8 py-2 text-xs text-muted-foreground italic">
              No activity in this period.
            </p>
          ) : (
            <div className="mb-1">
              {section.lines.map((line) => (
                <div
                  key={line.account_id}
                  className="flex items-center justify-between px-8 py-1.5 group/row hover:bg-muted/30 rounded transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[11px] text-muted-foreground/60 w-10 shrink-0 text-right">
                      {line.code ?? ""}
                    </span>
                    <span className="text-sm truncate">{line.name}</span>
                  </div>
                  <span
                    className={`font-mono text-sm tabular-nums shrink-0 ml-4 ${
                      line.amount === 0
                        ? "text-muted-foreground/30"
                        : line.amount < 0
                        ? "text-red-600 dark:text-red-400 italic"
                        : "text-foreground"
                    }`}
                  >
                    {line.amount < 0
                      ? `(${fmtTotal(Math.abs(line.amount))})`
                      : line.amount === 0
                      ? "—"
                      : fmtTotal(line.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Section total */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="h-px flex-1 bg-border/50 mr-4" />
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {section.totalLabel}
              </span>
              <span className={`font-mono text-sm font-semibold tabular-nums ${totalColor}`}>
                {section.total < 0 ? "(" : ""}
                {fmtTotal(section.total)}
                {section.total < 0 ? ")" : ""}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
