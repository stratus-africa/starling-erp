import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle, ArrowDownLeft, ArrowUpRight, CheckCircle2,
  ChevronRight, Landmark, Loader2, Plus, Scale, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string;
  name: string;
  bank: string | null;
  currency: string | null;
  balance: number | null;
  opening_balance: number;
}

interface BankTransaction {
  id: string;
  type: string;
  date: string;
  amount: number;
  payee: string | null;
  description: string | null;
  reference: string | null;
  status: string;
  reconciliation_id: string | null;
}

interface StatementLine {
  id: string;
  statement_date: string;
  description: string | null;
  reference: string | null;
  debit: number;
  credit: number;
  running_balance: number | null;
  matched_txn_id: string | null;
  is_matched: boolean;
}

interface Reconciliation {
  id: string;
  bank_account_id: string;
  period_name: string;
  statement_date: string;
  opening_balance: number;
  statement_balance: number;
  gl_balance: number;
  matched_total: number;
  difference: number;
  status: string;
  notes: string | null;
  reconciled_at: string | null;
}

const db = supabase as any;

const money = (v: number | null | undefined) =>
  v == null ? "—"
  : (v < 0 ? "(" : "") +
    Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    (v < 0 ? ")" : "");

const dateFmt = (v: string) =>
  new Date(v + "T00:00:00").toLocaleDateString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
  });

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

// ─── Main Page ────────────────────────────────────────────────────────────────

export function BankReconciliationPage() {
  const { can, tenant } = useAuth();
  const qc = useQueryClient();

  const canReconcile = can(["banking.reconcile", "accounting.reconciliation.manage"]);

  // ── Filters ──
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [period,             setPeriod]            = useState(defaultPeriod);
  const [statementBalance,   setStatementBalance]  = useState("");
  const [statementDate,      setStatementDate]     = useState(isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [notes,              setNotes]             = useState("");

  // Statement line entry form
  const [lineDate,    setLineDate]    = useState(isoDate(now));
  const [lineDesc,    setLineDesc]    = useState("");
  const [lineRef,     setLineRef]     = useState("");
  const [lineDebit,   setLineDebit]   = useState("");
  const [lineCredit,  setLineCredit]  = useState("");
  const [addingLine,  setAddingLine]  = useState(false);

  // ── Accounts ──────────────────────────────────────────────────────────────
  const { data: accounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank_accounts", "reconciliation"],
    queryFn: async () => {
      const { data } = await db.from("bank_accounts").select("*").is("deleted_at", null).order("name");
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;

  // ── Current reconciliation session ────────────────────────────────────────
  const { data: recon, isLoading: reconLoading } = useQuery<Reconciliation | null>({
    queryKey: ["bank_reconciliation", selectedAccountId, period],
    enabled: !!selectedAccountId && !!period,
    staleTime: 15_000,
    queryFn: async () => {
      const { data } = await db.from("bank_reconciliations")
        .select("*")
        .eq("bank_account_id", selectedAccountId)
        .eq("period_name", period)
        .maybeSingle();
      return data ?? null;
    },
  });

  // ── Unreconciled bank transactions ────────────────────────────────────────
  const periodStart = `${period}-01`;
  const periodEnd   = isoDate(new Date(parseInt(period.split("-")[0]), parseInt(period.split("-")[1]), 0));

  const { data: unmatched = [] } = useQuery<BankTransaction[]>({
    queryKey: ["bank_transactions", "unmatched", selectedAccountId, period],
    enabled: !!selectedAccountId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data } = await db.from("bank_transactions")
        .select("*")
        .is("deleted_at", null)
        .eq("bank_account_id", selectedAccountId)
        .eq("status", "Posted")
        .is("reconciliation_id", null)
        .gte("date", periodStart)
        .lte("date", periodEnd)
        .order("date", { ascending: true });
      return data ?? [];
    },
  });

  // ── Statement lines for this session ──────────────────────────────────────
  const { data: stmtLines = [] } = useQuery<StatementLine[]>({
    queryKey: ["bank_statement_lines", selectedAccountId, period],
    enabled: !!selectedAccountId,
    staleTime: 15_000,
    queryFn: async () => {
      if (!recon?.id) return [];
      const { data } = await db.from("bank_statement_lines")
        .select("*")
        .eq("reconciliation_id", recon.id)
        .order("statement_date", { ascending: true });
      return data ?? [];
    },
  });

  // ── Computed values ───────────────────────────────────────────────────────
  const stmtBal = parseFloat(statementBalance || "0") || (recon?.statement_balance ?? 0);
  const glBal   = selectedAccount
    ? (selectedAccount.balance ?? selectedAccount.opening_balance ?? 0)
    : 0;

  const matchedTxnIds   = new Set(stmtLines.filter((l) => l.is_matched && l.matched_txn_id).map((l) => l.matched_txn_id!));
  const unmatchedTxns   = unmatched.filter((t) => !matchedTxnIds.has(t.id));
  const matchedTxns     = unmatched.filter((t) =>  matchedTxnIds.has(t.id));

  const matchedStmt     = stmtLines.filter((l) => l.is_matched);
  const unmatchedStmt   = stmtLines.filter((l) => !l.is_matched);

  const totalMatchedAmt = matchedTxns.reduce((s, t) => {
    const cfg: Record<string, number> = { Deposit:1, Receipt:1, Withdrawal:-1, Payment:-1, Fee:-1, Transfer:0 };
    return s + (cfg[t.type] ?? 0) * Number(t.amount);
  }, 0);

  const difference = stmtBal - glBal;
  const isBalanced = Math.abs(difference) <= 0.005;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bank_reconciliation", selectedAccountId, period] });
    qc.invalidateQueries({ queryKey: ["bank_transactions", "unmatched", selectedAccountId, period] });
    qc.invalidateQueries({ queryKey: ["bank_statement_lines", selectedAccountId, period] });
  };

  // Create / upsert reconciliation session
  const upsertReconMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || !selectedAccountId) throw new Error("No account");
      const payload = {
        tenant_id:         tenant.id,
        bank_account_id:   selectedAccountId,
        period_name:       period,
        statement_date:    statementDate,
        statement_balance: parseFloat(statementBalance) || 0,
        gl_balance:        glBal,
        status:            "In Progress",
        notes:             notes || null,
      };
      const { data, error } = await db.from("bank_reconciliations")
        .upsert(payload, { onConflict: "tenant_id,bank_account_id,period_name" })
        .select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => { toast.success("Session saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Add statement line
  const addLineMutation = useMutation({
    mutationFn: async () => {
      if (!recon?.id && !selectedAccountId) throw new Error("Save session first");
      let reconId = recon?.id;
      if (!reconId) reconId = await upsertReconMutation.mutateAsync();

      const { error } = await db.from("bank_statement_lines").insert({
        tenant_id:        tenant!.id,
        bank_account_id:  selectedAccountId,
        reconciliation_id: reconId,
        statement_date:   lineDate,
        description:      lineDesc || null,
        reference:        lineRef  || null,
        debit:            parseFloat(lineDebit)  || 0,
        credit:           parseFloat(lineCredit) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Statement line added");
      setLineDesc(""); setLineRef(""); setLineDebit(""); setLineCredit("");
      setAddingLine(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Match a statement line to a bank transaction
  const matchMutation = useMutation({
    mutationFn: async ({ lineId, txnId }: { lineId: string; txnId: string }) => {
      const { error: e1 } = await db.from("bank_statement_lines").update({
        matched_txn_id: txnId, is_matched: true,
      }).eq("id", lineId);
      if (e1) throw e1;
      const { error: e2 } = await db.from("bank_transactions").update({
        reconciliation_id: recon?.id,
      }).eq("id", txnId);
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("Line matched"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const unmatchMutation = useMutation({
    mutationFn: async ({ lineId, txnId }: { lineId: string; txnId: string }) => {
      const { error: e1 } = await db.from("bank_statement_lines").update({
        matched_txn_id: null, is_matched: false,
      }).eq("id", lineId);
      if (e1) throw e1;
      const { error: e2 } = await db.from("bank_transactions").update({
        reconciliation_id: null,
      }).eq("id", txnId);
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("Match cleared"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Delete statement line
  const deleteLineMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("bank_statement_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Line removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Finalise reconciliation
  const finaliseMutation = useMutation({
    mutationFn: async () => {
      if (!recon?.id) throw new Error("No reconciliation session");
      if (!isBalanced) throw new Error("Difference must be zero before finalising");
      const { error } = await db.from("bank_reconciliations").update({
        status: "Reconciled",
        reconciled_at: new Date().toISOString(),
        reconciled_by: (await db.auth.getUser()).data.user?.id,
        statement_balance: stmtBal,
        gl_balance: glBal,
        matched_total: totalMatchedAmt,
      }).eq("id", recon.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Period reconciled"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const isReconciled = recon?.status === "Reconciled";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap gap-y-2">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Bank Reconciliation</h1>
            {reconLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Account selector */}
            <Select value={selectedAccountId || "none"} onValueChange={(v) => setSelectedAccountId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 w-52 text-xs">
                <Landmark className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Select account…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select account…</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Period */}
            <Input
              type="month"
              className="h-8 w-36 text-xs"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
        </div>
      </div>

      {!selectedAccountId ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Landmark className="h-8 w-8 opacity-20" />
          <p className="text-sm">Select a bank account to begin reconciliation.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-6 py-4 space-y-6">

            {/* ── Balance panel ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Statement balance input */}
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Statement Balance</p>
                <Input
                  type="number"
                  step="0.01"
                  className="h-9 font-mono text-base"
                  value={statementBalance || (recon?.statement_balance?.toString() ?? "")}
                  onChange={(e) => setStatementBalance(e.target.value)}
                  disabled={isReconciled || !canReconcile}
                  placeholder="Enter bank statement balance…"
                />
                <div className="space-y-1">
                  <Label className="text-xs">Statement date</Label>
                  <Input type="date" className="h-8 text-xs" value={statementDate}
                    onChange={(e) => setStatementDate(e.target.value)}
                    disabled={isReconciled || !canReconcile} />
                </div>
              </div>

              {/* GL balance (computed) */}
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">System GL Balance</p>
                <p className="font-mono text-2xl font-bold tabular-nums">{money(glBal)}</p>
                <p className="text-xs text-muted-foreground">
                  Current balance in {selectedAccount?.name ?? "account"} as at today.
                </p>
              </div>

              {/* Difference */}
              <div className={`rounded-lg border p-4 space-y-2 ${isBalanced ? "border-emerald-500/20 bg-emerald-500/6" : "border-destructive/20 bg-destructive/6"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Difference</p>
                <p className={`font-mono text-2xl font-bold tabular-nums ${isBalanced ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                  {money(difference)}
                </p>
                <div className="flex items-center gap-1.5 text-xs">
                  {isBalanced ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /><span className="text-emerald-700 dark:text-emerald-300 font-medium">Balanced — ready to finalise</span></>
                  ) : (
                    <><AlertCircle className="h-3.5 w-3.5 text-destructive" /><span className="text-destructive">Difference must be zero before finalising</span></>
                  )}
                </div>
              </div>
            </div>

            {/* Save / finalise */}
            {canReconcile && !isReconciled && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8"
                  onClick={() => upsertReconMutation.mutateAsync()}
                  disabled={!selectedAccountId || !statementBalance || upsertReconMutation.isPending}>
                  {upsertReconMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Save session
                </Button>
                <Button size="sm" className="h-8"
                  onClick={() => finaliseMutation.mutate()}
                  disabled={!isBalanced || !recon?.id || finaliseMutation.isPending}>
                  {finaliseMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Finalise reconciliation
                </Button>
                {recon && (
                  <div className="ml-auto">
                    <Label className="text-xs mr-2">Notes</Label>
                    <Input className="h-8 w-64 text-xs" placeholder="Optional reconciliation notes…"
                      value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {isReconciled && (
              <Alert className="border-emerald-500/20 bg-emerald-500/6">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="text-emerald-700 dark:text-emerald-300 text-xs">
                  This period was reconciled on {recon?.reconciled_at ? dateFmt(recon.reconciled_at.slice(0,10)) : "—"}.
                  Statement balance {money(recon?.statement_balance)} = GL balance {money(recon?.gl_balance)}.
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            {/* ── Two-column match workspace ── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

              {/* ── Left: Statement lines ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Bank Statement Lines</h2>
                  {canReconcile && !isReconciled && recon?.id && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => setAddingLine((v) => !v)}>
                      <Plus className="h-3 w-3" />
                      Add line
                    </Button>
                  )}
                </div>

                {/* Add line form */}
                {addingLine && (
                  <div className="mb-3 rounded-md border bg-muted/20 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Date</Label>
                        <Input type="date" className="h-7 text-xs" value={lineDate}
                          onChange={(e) => setLineDate(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Reference</Label>
                        <Input className="h-7 text-xs font-mono" value={lineRef}
                          onChange={(e) => setLineRef(e.target.value)} placeholder="Ref #" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input className="h-7 text-xs" value={lineDesc}
                        onChange={(e) => setLineDesc(e.target.value)} placeholder="Transaction description…" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Debit (money out)</Label>
                        <Input type="number" step="0.01" className="h-7 text-xs font-mono" value={lineDebit}
                          onChange={(e) => setLineDebit(e.target.value)} placeholder="0.00" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Credit (money in)</Label>
                        <Input type="number" step="0.01" className="h-7 text-xs font-mono" value={lineCredit}
                          onChange={(e) => setLineCredit(e.target.value)} placeholder="0.00" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => addLineMutation.mutate()}
                        disabled={addLineMutation.isPending}>
                        {addLineMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Add
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => setAddingLine(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr className="border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right w-24">Debit</th>
                        <th className="px-3 py-2 text-right w-24">Credit</th>
                        <th className="px-2 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {stmtLines.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          No statement lines yet. Add lines from your bank statement.
                        </td></tr>
                      )}
                      {stmtLines.map((line) => (
                        <tr key={line.id}
                          className={`border-b transition-colors ${line.is_matched ? "bg-emerald-500/5" : "hover:bg-muted/30"}`}>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {dateFmt(line.statement_date)}
                          </td>
                          <td className="px-3 py-2 max-w-[160px]">
                            <p className="truncate">{line.description ?? "—"}</p>
                            {line.reference && <p className="font-mono text-muted-foreground text-[10px]">{line.reference}</p>}
                            {line.is_matched && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Matched
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-red-600">
                            {line.debit > 0 ? money(line.debit) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-600">
                            {line.credit > 0 ? money(line.credit) : "—"}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {!isReconciled && canReconcile && (
                              <button className="text-muted-foreground hover:text-destructive transition-colors"
                                onClick={() => {
                                  if (line.is_matched && line.matched_txn_id) {
                                    unmatchMutation.mutate({ lineId: line.id, txnId: line.matched_txn_id });
                                  } else {
                                    deleteLineMutation.mutate(line.id);
                                  }
                                }}>
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Right: Unreconciled GL transactions ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Unreconciled Transactions</h2>
                  <span className="text-xs text-muted-foreground">{unmatchedTxns.length} unmatched</span>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr className="border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Type / Payee</th>
                        <th className="px-3 py-2 text-right w-24">Amount</th>
                        <th className="px-2 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedTxns.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                          {unmatched.length > 0 ? "All transactions matched." : "No posted transactions in this period."}
                        </td></tr>
                      )}
                      {unmatchedTxns.map((txn) => {
                        const isIn = ["Deposit","Receipt"].includes(txn.type);
                        // Find an unmatched statement line to suggest a match
                        const candidate = unmatchedStmt.find((l) => {
                          const amt = Number(txn.amount);
                          return isIn ? Math.abs(l.credit - amt) < 0.01 : Math.abs(l.debit - amt) < 0.01;
                        });
                        return (
                          <tr key={txn.id} className="border-b hover:bg-muted/30 transition-colors group">
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                              {dateFmt(txn.date)}
                            </td>
                            <td className="px-3 py-2 max-w-[160px]">
                              <p className="font-medium">{txn.type}</p>
                              <p className="text-muted-foreground truncate">{txn.payee ?? txn.description ?? "—"}</p>
                              {txn.reference && <p className="font-mono text-[10px] text-muted-foreground">{txn.reference}</p>}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono tabular-nums ${isIn ? "text-emerald-600" : "text-red-600"}`}>
                              {isIn ? "+" : "-"}{money(txn.amount)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {!isReconciled && canReconcile && recon?.id && candidate && (
                                <button
                                  title={`Match with statement line: ${candidate.description ?? ""}`}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary/80"
                                  onClick={() => matchMutation.mutate({ lineId: candidate.id, txnId: txn.id })}
                                >
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Matched section */}
                {matchedTxns.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                      Matched ({matchedTxns.length})
                    </h3>
                    <div className="rounded-md border bg-emerald-500/5 overflow-hidden">
                      <table className="w-full text-xs">
                        <tbody>
                          {matchedTxns.map((txn) => {
                            const isIn = ["Deposit","Receipt"].includes(txn.type);
                            const matchedLine = matchedStmt.find((l) => l.matched_txn_id === txn.id);
                            return (
                              <tr key={txn.id} className="border-b border-border/30 last:border-0">
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{dateFmt(txn.date)}</td>
                                <td className="px-3 py-2">
                                  <p className="font-medium">{txn.type}</p>
                                  <p className="text-muted-foreground truncate">{txn.payee ?? "—"}</p>
                                </td>
                                <td className={`px-3 py-2 text-right font-mono tabular-nums ${isIn ? "text-emerald-600" : "text-red-600"}`}>
                                  {isIn ? "+" : "-"}{money(txn.amount)}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  {!isReconciled && canReconcile && matchedLine && (
                                    <button
                                      title="Unmatch"
                                      className="text-muted-foreground hover:text-destructive transition-colors"
                                      onClick={() => unmatchMutation.mutate({ lineId: matchedLine.id, txnId: txn.id })}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Reconciliation summary ── */}
            <div className="rounded-md border overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Reconciliation Summary
              </div>
              <div className="grid grid-cols-2 divide-x text-sm">
                <div className="px-4 py-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Statement balance</span>
                    <span className="font-mono tabular-nums">{money(stmtBal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unmatched statement items</span>
                    <span className="font-mono tabular-nums text-amber-600">{unmatchedStmt.length}</span>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GL balance</span>
                    <span className="font-mono tabular-nums">{money(glBal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unmatched GL transactions</span>
                    <span className="font-mono tabular-nums text-amber-600">{unmatchedTxns.length}</span>
                  </div>
                </div>
              </div>
              <div className={`flex items-center justify-between px-4 py-2.5 border-t font-semibold text-sm ${
                isBalanced ? "bg-emerald-500/8 text-emerald-700 dark:text-emerald-300" : "bg-destructive/8 text-destructive"
              }`}>
                <span>Difference (Statement − GL)</span>
                <span className="font-mono tabular-nums">{money(difference)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
