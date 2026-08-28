import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight,
  Download, Loader2, Percent, Printer, TrendingDown, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

const db = supabase as any;

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

const money = (v: number | null | undefined) =>
  v == null ? "—"
  : (v < 0 ? "(" : "") +
    Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    (v < 0 ? ")" : "");

const dateFmt = (v: string) =>
  new Date(v + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

interface JournalLine {
  id: string;
  journal_id: string;
  account_id: string;
  debit: number;
  credit: number;
  memo: string | null;
  created_at: string;
}

interface JournalEntry {
  id: string;
  number: string | null;
  entry_date: string;
  memo: string | null;
  source_ref_type: string | null;
  source_ref_id: string | null;
  status: string | null;
}

interface TaxLine {
  journal_id: string;
  entry_date: string;
  reference: string | null;
  source_type: string | null;
  source_id: string | null;
  description: string | null;
  vat_type: "output" | "input";
  debit: number;
  credit: number;
  // net contribution: credit − debit for Output (liability increases with credit)
  //                   debit − credit for Input (asset increases with debit)
  net: number;
}

// ─── Period presets (same as P&L) ────────────────────────────────────────────

type Preset = "this_month" | "last_month" | "this_quarter" | "last_quarter" | "this_year" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  this_month:   "This month",
  last_month:   "Last month",
  this_quarter: "This quarter",
  last_quarter: "Last quarter",
  this_year:    "This year",
  custom:       "Custom",
};

function getRange(preset: Preset, customFrom: string, customTo: string) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (preset) {
    case "this_month":   return { from: isoDate(new Date(y,m,1)),       to: isoDate(new Date(y,m+1,0)) };
    case "last_month":   return { from: isoDate(new Date(y,m-1,1)),     to: isoDate(new Date(y,m,0)) };
    case "this_quarter": { const q = Math.floor(m/3)*3; return { from: isoDate(new Date(y,q,1)),   to: isoDate(new Date(y,q+3,0)) }; }
    case "last_quarter": { const q = Math.floor(m/3)*3-3; return { from: isoDate(new Date(y,q,1)), to: isoDate(new Date(y,q+3,0)) }; }
    case "this_year":    return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "custom":       return { from: customFrom, to: customTo };
  }
}

function periodLabel(range: { from: string; to: string }) {
  return `${dateFmt(range.from)} – ${dateFmt(range.to)}`;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(lines: TaxLine[], outputTotal: number, inputTotal: number, netVat: number, range: { from: string; to: string }) {
  const rows: string[] = [
    `"VAT Report – ${periodLabel(range)}"`, "",
    `"Output VAT (collected)",,${outputTotal.toFixed(2)}`,
    `"Input VAT (recoverable)",,${inputTotal.toFixed(2)}`,
    `"Net VAT Payable to KRA",,${netVat.toFixed(2)}`,
    "",
    `"Date","Reference","Description","Type","Debit","Credit","Net"`,
    ...lines.map((l) => [
      `"${dateFmt(l.entry_date)}"`,
      `"${l.reference ?? ""}"`,
      `"${(l.description ?? "").replace(/"/g,"\"\"")}"`,
      `"${l.vat_type === "output" ? "Output VAT" : "Input VAT"}"`,
      l.debit.toFixed(2),
      l.credit.toFixed(2),
      l.net.toFixed(2),
    ].join(",")),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `vat-report-${range.from}-to-${range.to}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TaxReportPage() {
  const { tenant } = useAuth();

  const now = new Date();
  const [preset,     setPreset]     = useState<Preset>("this_month");
  const [customFrom, setCustomFrom] = useState(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customTo,   setCustomTo]   = useState(isoDate(now));
  const [showOutput, setShowOutput] = useState(true);
  const [showInput,  setShowInput]  = useState(true);

  const range = useMemo(() => getRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  // ── Fetch VAT account IDs ──────────────────────────────────────────────────
  const { data: vatAccounts } = useQuery({
    queryKey: ["vat_accounts", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 120_000,
    queryFn: async () => {
      const { data } = await db.from("chart_of_accounts")
        .select("id,code,name")
        .is("deleted_at", null)
        .in("code", ["1150","2100"]);
      const rows = (data ?? []) as { id: string; code: string; name: string }[];
      return {
        outputVatId: rows.find((r) => r.code === "2100")?.id ?? null,
        inputVatId:  rows.find((r) => r.code === "1150")?.id ?? null,
        outputName:  rows.find((r) => r.code === "2100")?.name ?? "Output VAT",
        inputName:   rows.find((r) => r.code === "1150")?.name ?? "Input VAT",
      };
    },
  });

  // ── Fetch journal entries in range ────────────────────────────────────────
  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ["tax_report", tenant?.id, range.from, range.to],
    enabled: !!tenant?.id && !!vatAccounts?.outputVatId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!vatAccounts?.outputVatId && !vatAccounts?.inputVatId) return { lines: [] };

      // Step 1: posted journal entries in period
      const { data: headers, error: hErr } = await db
        .from("journal_entries")
        .select("id,number,entry_date,memo,source_ref_type,source_ref_id,status")
        .is("deleted_at", null)
        .eq("status", "Posted")
        .gte("entry_date", range.from)
        .lte("entry_date", range.to);
      if (hErr) throw hErr;

      const entryList = (headers ?? []) as JournalEntry[];
      if (!entryList.length) return { lines: [] };

      const journalIds = entryList.map((e) => e.id);
      const entryMap = new Map<string, JournalEntry>(entryList.map((e) => [e.id, e]));

      // Step 2: journal lines hitting VAT accounts only
      const vatIds = [vatAccounts.outputVatId, vatAccounts.inputVatId].filter(Boolean) as string[];
      const { data: jLines, error: lErr } = await db
        .from("journal_lines")
        .select("id,journal_id,account_id,debit,credit,memo,created_at")
        .in("journal_id", journalIds)
        .in("account_id", vatIds);
      if (lErr) throw lErr;

      const lines: TaxLine[] = ((jLines ?? []) as JournalLine[]).map((l) => {
        const entry = entryMap.get(l.journal_id)!;
        const isOutput = l.account_id === vatAccounts.outputVatId;
        // Output VAT: liability increases with credit → net = credit − debit
        // Input VAT:  asset    increases with debit   → net = debit − credit
        const net = isOutput ? l.credit - l.debit : l.debit - l.credit;
        return {
          journal_id: l.journal_id,
          entry_date: entry.entry_date,
          reference:  entry.number,
          source_type: entry.source_ref_type,
          source_id:   entry.source_ref_id,
          description: l.memo ?? entry.memo,
          vat_type:    isOutput ? "output" : "input",
          debit:       Number(l.debit)  || 0,
          credit:      Number(l.credit) || 0,
          net,
        };
      });

      // Sort by date
      lines.sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.journal_id.localeCompare(b.journal_id));

      return { lines };
    },
  });

  const allLines     = reportData?.lines ?? [];
  const outputLines  = allLines.filter((l) => l.vat_type === "output");
  const inputLines   = allLines.filter((l) => l.vat_type === "input");
  const outputTotal  = outputLines.reduce((s, l) => s + l.net, 0);
  const inputTotal   = inputLines.reduce((s, l)  => s + l.net, 0);
  const netVatPayable = outputTotal - inputTotal; // positive = owe KRA; negative = refund due

  const SOURCE_LABELS: Record<string, string> = {
    invoice: "Invoice", bill: "Bill", credit_note: "Credit Note",
    manual: "Manual Journal", reversal: "Reversal",
    payment_received: "Payment", payment_made: "Payment Made",
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap gap-y-2">
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">VAT Report</h1>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Period presets */}
            <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
              {(Object.keys(PRESET_LABELS) as Preset[]).filter((p) => p !== "custom").map((p) => (
                <button key={p} onClick={() => setPreset(p)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    preset === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {PRESET_LABELS[p]}
                </button>
              ))}
              <button onClick={() => setPreset("custom")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  preset === "custom" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                Custom
              </button>
            </div>

            {preset === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input type="date" className="h-8 w-32 text-xs" value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)} />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" className="h-8 w-32 text-xs" value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            )}

            <Separator orientation="vertical" className="h-5" />

            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => exportCsv(allLines, outputTotal, inputTotal, netVatPayable, range)}
              disabled={allLines.length === 0}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-5 space-y-6">

          {/* ── Print heading ── */}
          <div className="hidden print:block text-center mb-6">
            <p className="text-lg font-bold uppercase tracking-widest">VAT Report</p>
            <p className="text-sm text-muted-foreground mt-1">{periodLabel(range)}</p>
          </div>

          {/* ── Period label ── */}
          <p className="text-xs text-muted-foreground print:hidden">{periodLabel(range)}</p>

          {/* ── Summary cards ── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-red-500" /> Output VAT
              </div>
              <p className="font-mono text-xl font-bold tabular-nums text-red-600 dark:text-red-400">
                {money(outputTotal)}
              </p>
              <p className="text-xs text-muted-foreground">
                {vatAccounts?.outputName ?? "2100 Output VAT"} · collected from customers
              </p>
            </div>

            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5 text-blue-500" /> Input VAT
              </div>
              <p className="font-mono text-xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                {money(inputTotal)}
              </p>
              <p className="text-xs text-muted-foreground">
                {vatAccounts?.inputName ?? "1150 Input VAT"} · paid on purchases
              </p>
            </div>

            <div className={`rounded-lg border p-4 space-y-1 ${
              netVatPayable > 0
                ? "border-amber-500/20 bg-amber-500/6"
                : netVatPayable < 0
                ? "border-emerald-500/20 bg-emerald-500/6"
                : "border-border"
            }`}>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                Net VAT Payable
              </div>
              <p className={`font-mono text-xl font-bold tabular-nums ${
                netVatPayable > 0 ? "text-amber-700 dark:text-amber-400"
                : netVatPayable < 0 ? "text-emerald-700 dark:text-emerald-400"
                : "text-muted-foreground"
              }`}>
                {money(netVatPayable)}
              </p>
              <p className="text-xs text-muted-foreground">
                {netVatPayable > 0
                  ? "Payable to KRA (Output − Input)"
                  : netVatPayable < 0
                  ? "Refund due from KRA"
                  : "No net VAT for this period"}
              </p>
            </div>
          </div>

          {/* ── No VAT accounts warning ── */}
          {!isLoading && !vatAccounts?.outputVatId && !vatAccounts?.inputVatId && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/8 px-4 py-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">VAT control accounts not found.</p>
                <p>Accounts 1150 (Input VAT) and 2100 (Output VAT) are required. Check the Chart of Accounts.</p>
              </div>
            </div>
          )}

          {/* ── Equation ── */}
          {allLines.length > 0 && (
            <div className="flex items-center gap-2 text-xs rounded-md border bg-muted/20 px-4 py-2.5">
              <span className="text-muted-foreground">Output VAT</span>
              <span className="font-mono font-semibold">{money(outputTotal)}</span>
              <span className="text-muted-foreground">−</span>
              <span className="text-muted-foreground">Input VAT</span>
              <span className="font-mono font-semibold">{money(inputTotal)}</span>
              <span className="text-muted-foreground">=</span>
              <span className="text-muted-foreground">Net VAT Payable</span>
              <span className={`font-mono font-bold ${netVatPayable > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                {money(netVatPayable)}
              </span>
            </div>
          )}

          <Separator />

          {/* ── Output VAT section ── */}
          <div>
            <button
              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/40 transition-colors select-none"
              onClick={() => setShowOutput((v) => !v)}
            >
              <div className="flex items-center gap-1.5">
                {showOutput ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-[11px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
                  Output VAT — Collected from Customers
                </span>
                <span className="text-[10px] text-muted-foreground">({outputLines.length} entries)</span>
              </div>
              <span className="font-mono text-sm font-semibold text-red-600 dark:text-red-400">{money(outputTotal)}</span>
            </button>

            {showOutput && (
              <VatLinesTable lines={outputLines} sourceLabels={SOURCE_LABELS} />
            )}
          </div>

          {/* ── Input VAT section ── */}
          <div>
            <button
              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/40 transition-colors select-none"
              onClick={() => setShowInput((v) => !v)}
            >
              <div className="flex items-center gap-1.5">
                {showInput ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                  Input VAT — Paid on Purchases
                </span>
                <span className="text-[10px] text-muted-foreground">({inputLines.length} entries)</span>
              </div>
              <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{money(inputTotal)}</span>
            </button>

            {showInput && (
              <VatLinesTable lines={inputLines} sourceLabels={SOURCE_LABELS} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VatLinesTable({ lines, sourceLabels }: { lines: TaxLine[]; sourceLabels: Record<string,string> }) {
  if (!lines.length) {
    return <p className="px-8 py-4 text-xs text-muted-foreground italic">No transactions in this period.</p>;
  }

  return (
    <div className="mt-1 rounded-md border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr className="border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
            <th className="px-3 py-2 text-left whitespace-nowrap">Reference</th>
            <th className="px-3 py-2 text-left">Description</th>
            <th className="px-3 py-2 text-left w-28">Source</th>
            <th className="px-3 py-2 text-right w-24">Debit</th>
            <th className="px-3 py-2 text-right w-24">Credit</th>
            <th className="px-3 py-2 text-right w-28">Net VAT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.journal_id}-${i}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{dateFmt(l.entry_date)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className="font-mono font-medium text-primary">{l.reference ?? "—"}</span>
              </td>
              <td className="px-3 py-2 max-w-[220px]">
                <span className="truncate block">{l.description ?? "—"}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">
                  {sourceLabels[l.source_type ?? ""] ?? (l.source_type ?? "manual")}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {l.debit > 0 ? money(l.debit) : <span className="text-muted-foreground/30">—</span>}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {l.credit > 0 ? money(l.credit) : <span className="text-muted-foreground/30">—</span>}
              </td>
              <td className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${
                l.net < 0 ? "text-emerald-600 dark:text-emerald-400" : ""
              }`}>
                {money(l.net)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/30">
            <td colSpan={6} className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</td>
            <td className="px-3 py-2 text-right font-mono font-bold tabular-nums">
              {money(lines.reduce((s, l) => s + l.net, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
