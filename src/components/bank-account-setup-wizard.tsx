import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, ArrowLeft, CheckCircle2, Landmark, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

const CURRENCIES = ["KES", "USD", "EUR", "GBP", "AED", "EGP", "INR", "ZAR"] as const;

export interface WizardGlAccount {
  id: string;
  code: string | null;
  name: string;
}

interface CheckResult {
  key: string;
  label: string;
  detail: string;
  state: "pass" | "warn" | "fail";
}

/** Runs the verification checks for one bank account. Exported so the Banking page can re-verify existing accounts. */
export async function verifyBankAccountConnection(accountId: string, tenantId: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const { data: account, error: acctError } = await db
    .from("bank_accounts")
    .select("id,name,bank,account_number,currency,balance,opening_balance,gl_account_id,status")
    .eq("id", accountId)
    .maybeSingle();

  if (acctError || !account) {
    return [{
      key: "account",
      label: "Bank account saved",
      detail: acctError?.message ?? "The account could not be read back from the database.",
      state: "fail",
    }];
  }

  results.push({
    key: "account",
    label: "Bank account saved",
    detail: `${account.name}${account.bank ? ` · ${account.bank}` : ""}${account.account_number ? ` · ${account.account_number}` : ""}`,
    state: account.status === "Inactive" ? "warn" : "pass",
  });

  if (!account.gl_account_id) {
    results.push({
      key: "ledger",
      label: "Ledger account assigned",
      detail: "No chart of accounts link yet — transactions cannot reach the ledger.",
      state: "fail",
    });
    return results;
  }

  const { data: gl } = await db
    .from("chart_of_accounts")
    .select("id,code,name,type,is_active,allow_manual_posting,currency")
    .eq("id", account.gl_account_id)
    .maybeSingle();

  if (!gl) {
    results.push({
      key: "ledger",
      label: "Ledger account assigned",
      detail: "The linked ledger account no longer exists. Pick another one.",
      state: "fail",
    });
    return results;
  }

  results.push({
    key: "ledger",
    label: "Ledger account assigned",
    detail: `${gl.code ? gl.code + " · " : ""}${gl.name}`,
    state: "pass",
  });

  results.push({
    key: "ledger-usable",
    label: "Ledger account accepts postings",
    detail: !gl.is_active
      ? "The ledger account is inactive — activate it in Chart of Accounts."
      : !gl.allow_manual_posting
        ? "The ledger account does not allow manual postings."
        : "Active and open for postings.",
    state: gl.is_active && gl.allow_manual_posting ? "pass" : "fail",
  });

  if (gl.currency && account.currency && gl.currency !== account.currency) {
    results.push({
      key: "currency",
      label: "Currency matches the ledger",
      detail: `Bank account is ${account.currency}, ledger account is ${gl.currency}.`,
      state: "warn",
    });
  } else {
    results.push({
      key: "currency",
      label: "Currency matches the ledger",
      detail: `${account.currency ?? "—"}`,
      state: "pass",
    });
  }

  const { data: shared } = await db
    .from("bank_accounts")
    .select("id,name")
    .eq("gl_account_id", account.gl_account_id)
    .is("deleted_at", null)
    .neq("id", account.id);

  results.push({
    key: "exclusive",
    label: "Ledger account is used by this account only",
    detail: shared?.length
      ? `Also linked to ${shared.map((s: { name: string }) => s.name).join(", ")} — balances will mix.`
      : "No other bank account shares this ledger account.",
    state: shared?.length ? "warn" : "pass",
  });

  const { data: cashCfg } = await db
    .from("posting_config")
    .select("account_id")
    .eq("tenant_id", tenantId)
    .eq("purpose", "cash")
    .maybeSingle();

  results.push({
    key: "posting-config",
    label: "Cash posting rule configured",
    detail: cashCfg?.account_id
      ? "Payments and receipts have a default cash account."
      : "No default cash account set for this workspace — set one in Accounting settings.",
    state: cashCfg?.account_id ? "pass" : "warn",
  });

  const { count: postedCount } = await db
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("bank_account_id", account.id)
    .eq("status", "Posted");

  const { count: lineCount } = await db
    .from("journal_lines")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.gl_account_id);

  results.push({
    key: "journals",
    label: "Ledger activity reaching the account",
    detail: postedCount
      ? `${postedCount} posted transaction${postedCount === 1 ? "" : "s"}, ${lineCount ?? 0} ledger entr${(lineCount ?? 0) === 1 ? "y" : "ies"}.`
      : "No posted transactions yet — post one to see it flow into the ledger.",
    state: postedCount && !lineCount ? "warn" : "pass",
  });

  return results;
}

function CheckRow({ result }: { result: CheckResult }) {
  const icon =
    result.state === "pass" ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
    : result.state === "warn" ? <AlertCircle className="h-4 w-4 text-amber-500" />
    : <XCircle className="h-4 w-4 text-destructive" />;
  return (
    <div className="flex items-start gap-2.5 rounded-md border px-3 py-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{result.label}</p>
        <p className="text-xs text-muted-foreground">{result.detail}</p>
      </div>
    </div>
  );
}

export function BankAccountChecklist({ results }: { results: CheckResult[] }) {
  return (
    <div className="space-y-2">
      {results.map((result) => <CheckRow key={result.key} result={result} />)}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  glAccounts: WizardGlAccount[];
  onCreated?: (accountId: string) => void;
}

export function BankAccountSetupWizard({ open, onClose, glAccounts, onCreated }: Props) {
  const { tenant, user } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState(1);
  const [accountId, setAccountId] = useState<string | null>(null);

  // Step 1
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10));

  // Step 2
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [glAccountId, setGlAccountId] = useState("");
  const [newGlCode, setNewGlCode] = useState("");
  const [newGlName, setNewGlName] = useState("");

  const reset = () => {
    setStep(1); setAccountId(null);
    setName(""); setBank(""); setAccountNumber(""); setCurrency("KES");
    setOpeningBalance("0"); setOpeningDate(new Date().toISOString().slice(0, 10));
    setMode("existing"); setGlAccountId(""); setNewGlCode(""); setNewGlName("");
  };

  const close = () => { reset(); onClose(); };

  const createAccount = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No workspace selected");
      const { data, error } = await db.from("bank_accounts").insert({
        tenant_id: tenant.id,
        created_by: user?.id ?? null,
        name: name.trim(),
        bank: bank.trim() || null,
        account_number: accountNumber.trim() || null,
        currency,
        opening_balance: Number(openingBalance) || 0,
        balance: Number(openingBalance) || 0,
        opening_date: openingDate || null,
        status: "Active",
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      setAccountId(id);
      setStep(2);
      qc.invalidateQueries({ queryKey: ["bank_accounts", "list"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Could not create the bank account"),
  });

  const assignLedger = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || !accountId) throw new Error("No account");
      let targetId = glAccountId;
      if (mode === "new") {
        if (!newGlName.trim()) throw new Error("Give the ledger account a name");
        const { data, error } = await db.from("chart_of_accounts").insert({
          tenant_id: tenant.id,
          created_by: user?.id ?? null,
          code: newGlCode.trim() || null,
          name: newGlName.trim(),
          type: "Asset",
          normal_balance: "Debit",
          currency,
          is_active: true,
          allow_manual_posting: true,
          opening_balance: Number(openingBalance) || 0,
        }).select("id").single();
        if (error) throw error;
        targetId = data.id as string;
      }
      if (!targetId) throw new Error("Choose a ledger account");
      const { error: linkError } = await db.from("bank_accounts")
        .update({ gl_account_id: targetId })
        .eq("id", accountId)
        .eq("tenant_id", tenant.id);
      if (linkError) throw linkError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts", "list"] });
      qc.invalidateQueries({ queryKey: ["chart_of_accounts"] });
      setStep(3);
    },
    onError: (e: Error) => toast.error(e.message ?? "Could not link the ledger account"),
  });

  const checks = useQuery({
    queryKey: ["bank-account-verify", accountId],
    enabled: open && step === 3 && !!accountId && !!tenant?.id,
    queryFn: () => verifyBankAccountConnection(accountId!, tenant!.id),
  });

  const failed = (checks.data ?? []).some((r) => r.state === "fail");

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            Set up a bank account
          </DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {step === 1 ? "account details" : step === 2 ? "ledger account" : "verify the connection"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Account name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main current account" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="KCB" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Account number</Label>
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Opening balance</Label>
                <Input type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Opening date</Label>
                <Input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 py-2">
            <div className="flex gap-1.5">
              <Button type="button" variant={mode === "existing" ? "default" : "outline"} size="sm" onClick={() => setMode("existing")}>
                Use an existing ledger account
              </Button>
              <Button type="button" variant={mode === "new" ? "default" : "outline"} size="sm" onClick={() => setMode("new")}>
                Create a new one
              </Button>
            </div>

            {mode === "existing" ? (
              <div className="space-y-1.5">
                <Label>Ledger account</Label>
                <Select value={glAccountId} onValueChange={setGlAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select an account" /></SelectTrigger>
                  <SelectContent>
                    {glAccounts.map((gl) => (
                      <SelectItem key={gl.id} value={gl.id}>{gl.code ? `${gl.code} · ` : ""}{gl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {glAccounts.length === 0 && (
                  <p className="text-xs text-muted-foreground">No postable accounts found — create one instead.</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label>Code</Label>
                  <Input value={newGlCode} onChange={(e) => setNewGlCode(e.target.value)} placeholder="1010" />
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={newGlName} onChange={(e) => setNewGlName(e.target.value)} placeholder={bank ? `${bank} — ${name}` : "Bank — current account"} />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  Created as an asset account in {currency}, open for postings.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 py-2">
            {checks.isFetching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking the connection…
              </div>
            )}
            {!checks.isFetching && <BankAccountChecklist results={checks.data ?? []} />}
            {!checks.isFetching && (
              <Badge variant="outline" className={failed ? "border-destructive/30 text-destructive" : "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"}>
                {failed ? "Needs attention" : "Connection verified"}
              </Badge>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {step > 1 && step < 3 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
              </Button>
            )}
            {step === 3 && (
              <Button variant="outline" size="sm" onClick={() => checks.refetch()} disabled={checks.isFetching}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Re-run checks
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>{step === 3 ? "Close" : "Cancel"}</Button>
            {step === 1 && (
              <Button onClick={() => { if (!name.trim()) { toast.error("Account name is required"); return; } createAccount.mutate(); }} disabled={createAccount.isPending}>
                {createAccount.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Create account
              </Button>
            )}
            {step === 2 && (
              <Button onClick={() => assignLedger.mutate()} disabled={assignLedger.isPending}>
                {assignLedger.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Assign &amp; verify
              </Button>
            )}
            {step === 3 && !failed && (
              <Button onClick={() => { const id = accountId; close(); if (id) onCreated?.(id); }}>Open account</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
