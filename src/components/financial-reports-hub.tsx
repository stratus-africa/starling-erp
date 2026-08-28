import { Link } from "@tanstack/react-router";
import {
  BookOpen, LayoutList, Scale, TrendingUp, Percent,
  ArrowRight,
} from "lucide-react";

// ─── Report catalogue ─────────────────────────────────────────────────────────

const REPORTS = [
  {
    title:       "General Ledger",
    description: "Full transaction-level view of every posted journal entry. Filter by account, date range, source module, or posted-by user. Shows running balance per account.",
    url:         "/accounting/ledger",
    icon:        BookOpen,
    color:       "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/15",
    pill:        "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    badge:       "Ledger",
  },
  {
    title:       "Trial Balance",
    description: "Aggregated debit and credit balances for every account as at a chosen date. Verifies that total debits equal total credits before producing financial statements.",
    url:         "/accounting/trial-balance",
    icon:        Scale,
    color:       "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/15",
    pill:        "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    badge:       "Balance",
  },
  {
    title:       "Profit & Loss",
    description: "Income statement showing Revenue, Cost of Goods Sold, Gross Profit, Operating Expenses, and Net Profit for a chosen period. Supports month, quarter, and year presets.",
    url:         "/accounting/profit-loss",
    icon:        TrendingUp,
    color:       "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/15",
    pill:        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    badge:       "P&L",
  },
  {
    title:       "Balance Sheet",
    description: "Point-in-time snapshot of Assets, Liabilities, and Equity. Includes Current Year Profit derived from the P&L. Enforces Assets = Liabilities + Equity.",
    url:         "/accounting/balance-sheet",
    icon:        LayoutList,
    color:       "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/15",
    pill:        "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    badge:       "B/S",
  },
  {
    title:       "VAT Report",
    description: "Output VAT collected from customers vs Input VAT paid on purchases. Net VAT payable to KRA per period. Supports month, quarter, and year presets with transaction drill-down.",
    url:         "/accounting/tax-report",
    icon:        Percent,
    color:       "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/15",
    pill:        "bg-red-500/10 text-red-700 dark:text-red-300",
    badge:       "VAT",
  },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function FinancialReportsHub() {
  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Financial Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live accounting reports drawn directly from posted journal entries.
          All figures update in real time as transactions are posted.
        </p>
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.url}
              to={r.url as never}
              className={`group rounded-xl border p-5 flex flex-col gap-3 bg-card hover:shadow-md transition-all hover:border-primary/30 ${r.color}`}
            >
              {/* Icon + badge row */}
              <div className="flex items-start justify-between">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${r.pill}`}>
                  <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${r.color}`}>
                  {r.badge}
                </span>
              </div>

              {/* Title + description */}
              <div className="flex-1">
                <p className="text-sm font-semibold leading-snug mb-1.5">{r.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
              </div>

              {/* CTA */}
              <div className="flex items-center gap-1 text-xs font-medium text-primary mt-1 group-hover:gap-2 transition-all">
                Open report <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground border-t pt-4">
        All reports include Print and CSV export. Data is sourced from posted journal entries only —
        draft journals do not affect figures.
      </p>
    </div>
  );
}
