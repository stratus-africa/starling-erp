import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Lock,
  LockOpen,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  period_name: string;
  status: "Open" | "Closed" | "Locked";
  closed_at: string | null;
  closed_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type PeriodStatus = "Open" | "Closed" | "Locked";

// ─── Constants ───────────────────────────────────────────────────────────────

const db = supabase as any;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parsePeriodName(name: string): { year: number; month: number } {
  const [y, m] = name.split("-");
  return { year: parseInt(y, 10), month: parseInt(m, 10) };
}

function monthLabel(name: string): string {
  const { year, month } = parsePeriodName(name);
  return `${MONTHS[month - 1]} ${year}`;
}

function isCurrentPeriod(name: string): boolean {
  const now = new Date();
  const padded = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return name === padded;
}

const STATUS_CONFIG: Record<PeriodStatus, {
  label: string;
  badge: string;
  icon: React.ReactNode;
  description: string;
}> = {
  Open: {
    label: "Open",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    icon: <LockOpen className="h-3.5 w-3.5" />,
    description: "Transactions can be posted into this period.",
  },
  Closed: {
    label: "Closed",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    description: "No new transactions. Reversals must use an open period.",
  },
  Locked: {
    label: "Locked",
    badge: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
    icon: <Lock className="h-3.5 w-3.5" />,
    description: "Immutable. Only admins with period management permission can unlock.",
  },
};

function StatusBadge({ status }: { status: PeriodStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badge}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Confirm dialog for destructive status changes ───────────────────────────

interface ConfirmDialogProps {
  period: Period | null;
  targetStatus: PeriodStatus | null;
  notes: string;
  onNotesChange: (v: string) => void;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ period, targetStatus, notes, onNotesChange, saving, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!period || !targetStatus) return null;

  const isDestructive = targetStatus === "Closed" || targetStatus === "Locked";
  const titleMap: Record<PeriodStatus, string> = {
    Open:   `Re-open ${monthLabel(period.period_name)}?`,
    Closed: `Close ${monthLabel(period.period_name)}?`,
    Locked: `Lock ${monthLabel(period.period_name)}?`,
  };
  const descMap: Record<PeriodStatus, string> = {
    Open:   "This will allow new transactions to be posted into this period. Ensure prior-period reports have been reviewed before re-opening.",
    Closed: "No new transactions or postings will be accepted in this period. Reversals of historical entries must be recorded in an open period. This can be re-opened.",
    Locked: "This period will be permanently immutable. No transactions, postings, or reversals will be allowed. Only a user with period management permission can unlock it.",
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titleMap[targetStatus]}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>{descMap[targetStatus]}</p>
            {isDestructive && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Notes (optional)</label>
                <Textarea
                  rows={2}
                  placeholder="Reason for closing / locking this period…"
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  className="text-xs resize-none"
                />
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={saving}
            className={isDestructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {targetStatus === "Open" ? "Re-open period" : targetStatus === "Closed" ? "Close period" : "Lock period"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AccountingPeriodsPage() {
  const { can, tenant } = useAuth();
  const qc = useQueryClient();

  const canManage = can(["accounting.periods.manage", "accounting.post"]);

  // Display a rolling 2-year window centred on the current year
  const today = new Date();
  const [displayYear, setDisplayYear] = useState(today.getFullYear());

  // Confirm dialog state
  const [confirmPeriod,    setConfirmPeriod]    = useState<Period | null>(null);
  const [confirmStatus,    setConfirmStatus]    = useState<PeriodStatus | null>(null);
  const [confirmNotes,     setConfirmNotes]     = useState("");

  // ── Fetch all periods ──────────────────────────────────────────────────────
  const { data: allPeriods = [], isLoading, refetch } = useQuery<Period[]>({
    queryKey: ["accounting_periods", tenant?.id],
    enabled:  !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("accounting_periods")
        .select("*")
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Period[];
    },
  });

  // ── Filter to display year ─────────────────────────────────────────────────
  const yearPeriods = useMemo(() => {
    const byMonth = new Map<string, Period>();
    for (const p of allPeriods) byMonth.set(p.period_name, p);

    // Build all 12 months for the display year, including months with no row yet
    return Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      const name  = `${displayYear}-${month}`;
      return byMonth.get(name) ?? null; // null = not provisioned yet
    });
  }, [allPeriods, displayYear]);

  // ── Summary counts ─────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { Open: 0, Closed: 0, Locked: 0 };
    for (const p of allPeriods) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [allPeriods]);

  // ── Mutation ───────────────────────────────────────────────────────────────
  const manageMutation = useMutation({
    mutationFn: async ({
      year, month, status, notes,
    }: {
      year: number; month: number; status: PeriodStatus; notes?: string;
    }) => {
      const { error } = await db.rpc("manage_accounting_period", {
        _year:       year,
        _month:      month,
        _new_status: status,
        _notes:      notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(`Period ${vars.year}-${String(vars.month).padStart(2,"0")} set to ${vars.status}`);
      qc.invalidateQueries({ queryKey: ["accounting_periods"] });
      setConfirmPeriod(null);
      setConfirmStatus(null);
      setConfirmNotes("");
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "Failed to update period");
      setConfirmPeriod(null);
      setConfirmStatus(null);
    },
  });

  const requestChange = (period: Period | null, year: number, month: number, status: PeriodStatus) => {
    // For provisioning a new Open period no confirmation needed
    if (!period && status === "Open") {
      manageMutation.mutate({ year, month, status });
      return;
    }
    // Synthetic period object for unprovisioned months
    const target: Period = period ?? {
      id: "", tenant_id: "", period_start: "", period_end: "",
      period_name: `${year}-${String(month).padStart(2,"0")}`,
      status: "Open", closed_at: null, closed_by: null,
      locked_at: null, locked_by: null, notes: null,
      created_at: "", updated_at: "",
    };
    setConfirmPeriod(target);
    setConfirmStatus(status);
    setConfirmNotes("");
  };

  const handleConfirm = () => {
    if (!confirmPeriod || !confirmStatus) return;
    const { year, month } = parsePeriodName(confirmPeriod.period_name);
    manageMutation.mutate({ year, month, status: confirmStatus, notes: confirmNotes || undefined });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Accounting Periods</h1>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2">
            {/* Summary pills */}
            {(["Open","Closed","Locked"] as PeriodStatus[]).map((s) => (
              <span
                key={s}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_CONFIG[s].badge}`}
              >
                {STATUS_CONFIG[s].icon}
                {counts[s]} {s}
              </span>
            ))}
            <Button
              variant="outline" size="sm" className="h-8 w-8 px-0"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Read-only notice ── */}
      {!canManage && (
        <div className="shrink-0 px-6 py-2">
          <Alert className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              You have read-only access to accounting periods. Contact an accountant or admin to open, close, or lock a period.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ── Info banner ── */}
      <div className="shrink-0 border-b bg-muted/20 px-6 py-3">
        <div className="grid grid-cols-3 gap-4 text-xs">
          {(["Open","Closed","Locked"] as PeriodStatus[]).map((s) => (
            <div key={s} className="flex items-start gap-2">
              <span className={`mt-0.5 inline-flex rounded-full border p-1 ${STATUS_CONFIG[s].badge}`}>
                {STATUS_CONFIG[s].icon}
              </span>
              <div>
                <p className="font-semibold">{STATUS_CONFIG[s].label}</p>
                <p className="text-muted-foreground leading-snug">{STATUS_CONFIG[s].description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Year navigator + grid ── */}
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {/* Year nav */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline" size="sm" className="h-8 w-8 px-0"
              onClick={() => setDisplayYear((y) => y - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <h2 className="text-lg font-bold tabular-nums w-12 text-center">{displayYear}</h2>
            <Button
              variant="outline" size="sm" className="h-8 w-8 px-0"
              onClick={() => setDisplayYear((y) => y + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => setDisplayYear(today.getFullYear())}
          >
            Jump to current year
          </button>
        </div>

        {/* Period grid — 12 cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {yearPeriods.map((period, idx) => {
            const month      = idx + 1;
            const monthName  = `${displayYear}-${String(month).padStart(2,"0")}`;
            const isCurrent  = isCurrentPeriod(monthName);
            const status: PeriodStatus = period?.status ?? "Open";
            const provisioned = period !== null;
            const cfg        = STATUS_CONFIG[status];

            return (
              <div
                key={monthName}
                className={`relative rounded-lg border bg-card p-4 flex flex-col gap-3 transition-shadow hover:shadow-sm ${
                  isCurrent ? "ring-2 ring-primary/30" : ""
                } ${!provisioned ? "opacity-60 border-dashed" : ""}`}
              >
                {/* Current period indicator */}
                {isCurrent && (
                  <span className="absolute right-3 top-3 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">
                    Current
                  </span>
                )}

                {/* Month heading */}
                <div>
                  <p className="text-sm font-semibold">{MONTHS[idx]} {displayYear}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{monthName}</p>
                </div>

                {/* Status */}
                <div>
                  <StatusBadge status={status} />
                  {period?.notes && (
                    <p className="mt-1 text-[11px] text-muted-foreground italic line-clamp-2">
                      {period.notes}
                    </p>
                  )}
                  {period?.closed_at && status !== "Open" && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {status === "Locked" ? "Locked" : "Closed"}{" "}
                      {new Date(period.closed_at).toLocaleDateString(undefined, {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </p>
                  )}
                </div>

                {/* Actions */}
                {canManage && (
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                    {status !== "Open" && status !== "Locked" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => requestChange(period, displayYear, month, "Open")}
                        disabled={manageMutation.isPending}
                      >
                        <LockOpen className="h-3 w-3" /> Re-open
                      </Button>
                    )}
                    {status === "Open" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 text-amber-700 border-amber-500/30 hover:bg-amber-500/10"
                        onClick={() => requestChange(period, displayYear, month, "Closed")}
                        disabled={manageMutation.isPending}
                      >
                        <ShieldAlert className="h-3 w-3" /> Close
                      </Button>
                    )}
                    {status !== "Locked" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => requestChange(period, displayYear, month, "Locked")}
                        disabled={manageMutation.isPending}
                      >
                        <Lock className="h-3 w-3" /> Lock
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Enforcement note */}
        <div className="mt-6 rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">What period enforcement blocks</p>
          <ul className="list-disc list-inside space-y-0.5 leading-relaxed">
            <li>Posting invoices, bills, credit notes, or payments into a closed or locked period</li>
            <li>Creating manual journal entries with a date in a closed or locked period</li>
            <li>Inventory adjustments and production orders that generate journals</li>
            <li>All reversals — the reversal journal must use today's date (an open period)</li>
          </ul>
          <p className="pt-1">
            Enforcement is applied at the database level inside the posting engine, so it cannot be bypassed by the UI or API.
          </p>
        </div>
      </div>

      {/* ── Confirm dialog ── */}
      <ConfirmDialog
        period={confirmPeriod}
        targetStatus={confirmStatus}
        notes={confirmNotes}
        onNotesChange={setConfirmNotes}
        saving={manageMutation.isPending}
        onConfirm={handleConfirm}
        onCancel={() => { setConfirmPeriod(null); setConfirmStatus(null); setConfirmNotes(""); }}
      />
    </div>
  );
}
