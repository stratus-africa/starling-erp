import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Info, Loader2, RefreshCw, ShieldCheck, X,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

const db = supabase as any;

interface Finding {
  id:               string;
  check_code:       string;
  severity:         "error" | "warning";
  entity_type:      string;
  entity_id:        string | null;
  detail:           string;
  detected_at:      string;
  resolved_at:      string | null;
  resolution_note:  string | null;
}

interface RunSummary {
  run_at:   string;
  errors:   number;
  warnings: number;
  total:    number;
  clean:    boolean;
}

// ─── Check catalogue ─────────────────────────────────────────────────────────

const CHECK_META: Record<string, {
  label: string;
  description: string;
  severity: "error" | "warning";
  howToFix: string;
}> = {
  UNBALANCED_JOURNAL: {
    label: "Unbalanced Journal",
    severity: "error",
    description: "A posted or draft journal entry where total debits ≠ total credits (tolerance ±0.005).",
    howToFix: "Void the journal and re-post with balanced lines. If the imbalance is in a reversal, re-run the void workflow.",
  },
  JOURNAL_NO_LINES: {
    label: "Journal Without Lines",
    severity: "error",
    description: "A posted or draft journal entry that has no debit/credit lines attached.",
    howToFix: "Delete the empty journal header or add the missing lines and re-post.",
  },
  HEADER_TOTAL_MISMATCH: {
    label: "Header Total Mismatch",
    severity: "error",
    description: "The stored total_debit/total_credit on the journal header do not match the sum of its lines.",
    howToFix: "This indicates data corruption. Contact support or use a manual journal correction entry.",
  },
  INVALID_ACCOUNT_REF: {
    label: "Invalid Account Reference",
    severity: "error",
    description: "A journal line references an account UUID that does not exist in this tenant's chart of accounts.",
    howToFix: "This can happen after data migrations. Identify and replace the orphaned account reference.",
  },
  DELETED_ACCOUNT_IN_USE: {
    label: "Deleted Account In Use",
    severity: "error",
    description: "A journal line references an account that has been soft-deleted from the chart of accounts.",
    howToFix: "Restore the account or create a correcting journal that moves the balance to an active account.",
  },
  POSTED_DOC_NO_JOURNAL: {
    label: "Posted Document Without Journal",
    severity: "error",
    description: "An invoice, bill, or payment is marked Posted but has no corresponding journal entry.",
    howToFix: "Re-post the document. If it cannot be re-posted, create a manual journal to record the accounting impact.",
  },
  DUPLICATE_SOURCE_POSTING: {
    label: "Possible Duplicate Posting",
    severity: "warning",
    description: "The same source document has more than the expected number of journal entries (invoices normally generate ≤2: revenue + COGS).",
    howToFix: "Review the journal entries for this document. Void any duplicates.",
  },
  CLOSED_PERIOD_POSTING: {
    label: "Posting Into Closed Period",
    severity: "warning",
    description: "A posted journal entry's date falls within an accounting period that is currently Closed or Locked.",
    howToFix: "If the posting is incorrect, void and re-post in an open period. If correct, this is a historical correction — acknowledge it.",
  },
  NEGATIVE_ASSET_BALANCE: {
    label: "Negative Asset Balance",
    severity: "warning",
    description: "An asset account (debit-normal) has a negative running balance, which may indicate a missing opening balance or incorrect posting.",
    howToFix: "Review the account's journal history. Add an opening balance entry or correct the relevant postings.",
  },
  ORPHANED_JOURNAL_LINE: {
    label: "Orphaned Journal Line",
    severity: "error",
    description: "A journal_lines row references a journal_entries row that no longer exists.",
    howToFix: "This is a referential integrity failure. Contact support to delete the orphaned lines.",
  },
};

const SEVERITY_CONFIG = {
  error:   { icon: AlertCircle,   cls: "text-destructive",                               bg: "bg-destructive/8 border-destructive/20",    label: "Error" },
  warning: { icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400",              bg: "bg-amber-500/8 border-amber-500/20",         label: "Warning" },
};

const ENTITY_LABELS: Record<string, string> = {
  journal_entry: "Journal",
  journal_line:  "Journal Line",
  invoice:       "Invoice",
  bill:          "Bill",
  credit_note:   "Credit Note",
  expense:       "Expense",
  payment_received: "Payment Received",
  payment_made:     "Payment Made",
  chart_of_account: "Account",
  adjustment:    "Adjustment",
};

function dateFmt(v: string) {
  return new Date(v).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Finding row ─────────────────────────────────────────────────────────────

function FindingRow({
  finding,
  onAcknowledge,
}: {
  finding: Finding;
  onAcknowledge: (f: Finding) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = CHECK_META[finding.check_code];
  const sev  = SEVERITY_CONFIG[finding.severity];
  const SevIcon = sev.icon;

  return (
    <div className={`rounded-md border mb-2 overflow-hidden ${sev.bg}`}>
      <button
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-black/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <SevIcon className={`h-4 w-4 mt-0.5 shrink-0 ${sev.cls}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{meta?.label ?? finding.check_code}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide ${sev.cls}`}>
              {sev.label}
            </span>
            <span className="text-[11px] rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">
              {ENTITY_LABELS[finding.entity_type] ?? finding.entity_type}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-1">
            {finding.detail}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {dateFmt(finding.detected_at)}
          </span>
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-current/10 bg-background/60">
          {/* Full detail */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Detail</p>
            <p className="text-xs font-mono bg-muted/40 rounded px-3 py-2 leading-relaxed">
              {finding.detail}
            </p>
          </div>

          {/* What this check means */}
          {meta && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">What this means</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
            </div>
          )}

          {/* How to fix */}
          {meta && (
            <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground">How to fix: </span>
                {meta.howToFix}
              </div>
            </div>
          )}

          {/* Entity ID */}
          {finding.entity_id && (
            <p className="text-[10px] font-mono text-muted-foreground/60">
              {ENTITY_LABELS[finding.entity_type] ?? finding.entity_type} ID: {finding.entity_id}
            </p>
          )}

          {/* Acknowledge */}
          <div className="flex justify-end pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={(e) => { e.stopPropagation(); onAcknowledge(finding); }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Acknowledge
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Check group ─────────────────────────────────────────────────────────────

function CheckGroup({
  code,
  findings,
  onAcknowledge,
}: {
  code: string;
  findings: Finding[];
  onAcknowledge: (f: Finding) => void;
}) {
  const [open, setOpen] = useState(true);
  const meta = CHECK_META[code];
  const hasErrors   = findings.some((f) => f.severity === "error");
  const sev = hasErrors ? SEVERITY_CONFIG.error : SEVERITY_CONFIG.warning;
  const SevIcon = sev.icon;

  return (
    <div className="mb-4">
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 transition-colors select-none"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <SevIcon className={`h-3.5 w-3.5 ${sev.cls}`} />
        <span className="text-xs font-semibold">{meta?.label ?? code}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold border ${sev.bg} ${sev.cls}`}>
          {findings.length}
        </span>
      </button>
      {open && (
        <div className="mt-1 pl-6">
          {findings.map((f) => (
            <FindingRow key={f.id} finding={f} onAcknowledge={onAcknowledge} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AccountingIntegrityPage() {
  const { can } = useAuth();
  const qc = useQueryClient();

  const canRun = can(["accounting.view", "accounting.read"]);

  const [lastRun,    setLastRun]    = useState<RunSummary | null>(null);
  const [running,    setRunning]    = useState(false);
  const [ackFinding, setAckFinding] = useState<Finding | null>(null);
  const [ackNote,    setAckNote]    = useState("");
  const [showClean,  setShowClean]  = useState(false);

  // ── Load persisted findings ────────────────────────────────────────────────
  const { data: findings = [], isLoading, refetch } = useQuery<Finding[]>({
    queryKey: ["accounting_integrity_findings"],
    queryFn: async () => {
      const { data, error } = await db
        .from("accounting_integrity_findings")
        .select("*")
        .is("resolved_at", null)
        .order("severity", { ascending: true }) // errors first
        .order("check_code", { ascending: true })
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // ── Run checks ────────────────────────────────────────────────────────────
  const runMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("run_accounting_integrity_checks");
      if (error) throw error;
      return data as RunSummary;
    },
    onSuccess: (summary) => {
      setLastRun(summary);
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["accounting_integrity_findings"] });
      if (summary.clean) {
        toast.success("All checks passed — GL is clean");
      } else {
        toast.error(`${summary.errors} error${summary.errors !== 1 ? "s" : ""}, ${summary.warnings} warning${summary.warnings !== 1 ? "s" : ""} found`);
      }
    },
    onError: (e: Error) => {
      setRunning(false);
      toast.error(e.message ?? "Integrity check failed");
    },
  });

  const handleRun = () => { setRunning(true); runMutation.mutate(); };

  // ── Acknowledge ───────────────────────────────────────────────────────────
  const ackMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await db.rpc("acknowledge_integrity_finding", {
        _finding_id: id,
        _note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Finding acknowledged");
      setAckFinding(null);
      setAckNote("");
      qc.invalidateQueries({ queryKey: ["accounting_integrity_findings"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to acknowledge"),
  });

  // ── Group by check_code ────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of findings) {
      if (!map.has(f.check_code)) map.set(f.check_code, []);
      map.get(f.check_code)!.push(f);
    }
    // Sort: errors before warnings, then alphabetically
    return [...map.entries()].sort(([codeA, rowsA], [codeB, rowsB]) => {
      const sevA = rowsA.some((r) => r.severity === "error") ? 0 : 1;
      const sevB = rowsB.some((r) => r.severity === "error") ? 0 : 1;
      return sevA !== sevB ? sevA - sevB : codeA.localeCompare(codeB);
    });
  }, [findings]);

  const errorCount   = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const isClean      = findings.length === 0 && lastRun !== null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap gap-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Accounting Integrity</h1>
            {(isLoading || running) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          <div className="flex items-center gap-2">
            {/* Summary pills */}
            {!isLoading && findings.length > 0 && (
              <>
                {errorCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border bg-destructive/10 px-2.5 py-0.5 text-[11px] font-semibold text-destructive border-destructive/20">
                    <AlertCircle className="h-3 w-3" /> {errorCount} error{errorCount !== 1 ? "s" : ""}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 border-amber-500/20">
                    <AlertTriangle className="h-3 w-3" /> {warningCount} warning{warningCount !== 1 ? "s" : ""}
                  </span>
                )}
              </>
            )}
            {isClean && (
              <span className="inline-flex items-center gap-1 rounded-full border bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3" /> Clean
              </span>
            )}

            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>

            <Button size="sm" className="h-8 gap-1.5 text-xs"
              onClick={handleRun}
              disabled={running || !canRun}>
              {running
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Running…</>
                : <><ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Run checks</>
              }
            </Button>
          </div>
        </div>

        {/* Last run meta */}
        {lastRun && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last run: {dateFmt(lastRun.run_at)} ·{" "}
            {lastRun.clean
              ? <span className="text-emerald-600 font-medium">all checks passed</span>
              : <span>{lastRun.errors} error{lastRun.errors !== 1 ? "s" : ""}, {lastRun.warnings} warning{lastRun.warnings !== 1 ? "s" : ""}</span>
            }
          </p>
        )}
      </div>

      {/* ── Body ── */}
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">

        {/* First-run prompt */}
        {!isLoading && findings.length === 0 && lastRun === null && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <ShieldCheck className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium">No checks run yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Click <strong>Run checks</strong> to scan the GL for integrity issues.
                The scan typically completes in under 5 seconds.
              </p>
            </div>
            <Button size="sm" onClick={handleRun} disabled={running || !canRun}>
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Run now
            </Button>
          </div>
        )}

        {/* Clean state */}
        {isClean && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                GL is clean — all {Object.keys(CHECK_META).length} checks passed
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                No integrity issues detected. Run again after posting activity.
              </p>
            </div>
          </div>
        )}

        {/* Check catalogue (shown when no active findings, for reference) */}
        {!isClean && findings.length === 0 && lastRun === null && (
          <div className="mt-6 rounded-md border overflow-hidden">
            <div className="bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Checks performed
            </div>
            <div className="divide-y">
              {Object.entries(CHECK_META).map(([code, meta]) => {
                const sev = SEVERITY_CONFIG[meta.severity];
                const SevIcon = sev.icon;
                return (
                  <div key={code} className="flex items-start gap-3 px-4 py-3">
                    <SevIcon className={`h-4 w-4 mt-0.5 shrink-0 ${sev.cls}`} />
                    <div>
                      <p className="text-xs font-semibold">{meta.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Findings grouped by check */}
        {grouped.length > 0 && (
          <div className="space-y-0">
            {grouped.map(([code, rows]) => (
              <CheckGroup
                key={code}
                code={code}
                findings={rows}
                onAcknowledge={(f) => { setAckFinding(f); setAckNote(""); }}
              />
            ))}
          </div>
        )}

        {/* Check catalogue at bottom when findings exist */}
        {grouped.length > 0 && (
          <div className="mt-6">
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowClean((v) => !v)}
            >
              {showClean ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Show all {Object.keys(CHECK_META).length} check definitions
            </button>
            {showClean && (
              <div className="mt-2 rounded-md border overflow-hidden">
                <div className="divide-y">
                  {Object.entries(CHECK_META).map(([code, meta]) => {
                    const active = findings.some((f) => f.check_code === code);
                    const sev = SEVERITY_CONFIG[meta.severity];
                    const SevIcon = sev.icon;
                    return (
                      <div key={code} className={`flex items-start gap-3 px-4 py-3 ${active ? "" : "opacity-40"}`}>
                        {active
                          ? <SevIcon className={`h-4 w-4 mt-0.5 shrink-0 ${sev.cls}`} />
                          : <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                        }
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold">{meta.label}</p>
                            {active && (
                              <span className={`text-[10px] font-bold uppercase tracking-wide ${sev.cls}`}>
                                {findings.filter((f) => f.check_code === code).length} found
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Acknowledge dialog ── */}
      <AlertDialog open={!!ackFinding} onOpenChange={(o) => !o && setAckFinding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Acknowledge finding?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="text-sm">
                <span className="font-semibold">{CHECK_META[ackFinding?.check_code ?? ""]?.label ?? ackFinding?.check_code}</span>
                {" "}will be marked as acknowledged and removed from the active findings list.
                It will reappear on the next run if the underlying issue is still present.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium">Resolution note (optional)</label>
                <Textarea
                  rows={2}
                  className="text-xs resize-none"
                  placeholder="Explain why this finding is acknowledged or how it was resolved…"
                  value={ackNote}
                  onChange={(e) => setAckNote(e.target.value)}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAckFinding(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => ackFinding && ackMutation.mutate({ id: ackFinding.id, note: ackNote })}
              disabled={ackMutation.isPending}
            >
              {ackMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Acknowledge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
