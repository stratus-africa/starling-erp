import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle, ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  Building2, CheckCircle2, ChevronLeft, ChevronRight, CreditCard,
  Landmark, Loader2, MinusCircle, MoreHorizontal, Plus, RefreshCw,
  Search, X,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string;
  name: string;
  bank: string | null;
  account_number: string | null;
  currency: string | null;
  balance: number | null;
  opening_balance: number;
  opening_date: string | null;
  gl_account_id: string | null;
  status: string | null;
  notes: string | null;
}

interface BankTransaction {
  id: string;
  bank_account_id: string;
  number: string | null;
  type: string;
  date: string;
  amount: number;
  payee: string | null;
  description: string | null;
  reference: string | null;
  contra_account_id: string | null;
  transfer_to_account_id: string | null;
  status: string;
  posted_at: string | null;
  created_at: string;
}

interface GlAccount { id: string; code: string | null; name: string; }

const TXN_TYPES = ["Deposit","Withdrawal","Fee","Transfer","Receipt","Payment"] as const;
type TxnType = typeof TXN_TYPES[number];

const CURRENCIES = ["USD","EUR","GBP","KES","AED","EGP","INR","ZAR"] as const;
const PAGE_SIZE = 50;
const db = supabase as any;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const money = (v: number | null | undefined, currency = "") =>
  v == null ? "—" : `${currency ? currency + " " : ""}${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateFmt = (v: string) =>
  new Date(v + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

const TYPE_CONFIG: Record<TxnType, { icon: React.ReactNode; color: string; direction: "in" | "out" | "both" }> = {
  Deposit:    { icon: <ArrowDownLeft  className="h-3.5 w-3.5" />, color: "text-emerald-600 dark:text-emerald-400", direction: "in"   },
  Receipt:    { icon: <ArrowDownLeft  className="h-3.5 w-3.5" />, color: "text-emerald-600 dark:text-emerald-400", direction: "in"   },
  Withdrawal: { icon: <ArrowUpRight   className="h-3.5 w-3.5" />, color: "text-red-600 dark:text-red-400",         direction: "out"  },
  Payment:    { icon: <ArrowUpRight   className="h-3.5 w-3.5" />, color: "text-red-600 dark:text-red-400",         direction: "out"  },
  Fee:        { icon: <MinusCircle    className="h-3.5 w-3.5" />, color: "text-amber-600 dark:text-amber-400",     direction: "out"  },
  Transfer:   { icon: <ArrowLeftRight className="h-3.5 w-3.5" />, color: "text-blue-600 dark:text-blue-400",       direction: "both" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    Draft:  "bg-muted text-muted-foreground",
    Posted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    Voided: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg[status] ?? cfg.Draft}`}>
      {status === "Posted" && <CheckCircle2 className="h-3 w-3" />}
      {status === "Voided" && <AlertCircle  className="h-3 w-3" />}
      {status}
    </span>
  );
}

// ─── Transaction entry sheet ──────────────────────────────────────────────────

interface TxnSheetProps {
  open: boolean;
  account: BankAccount;
  accounts: BankAccount[];
  glAccounts: GlAccount[];
  onClose: () => void;
  onSave: (values: Partial<BankTransaction>) => Promise<void>;
  saving: boolean;
}

function TxnSheet({ open, account, accounts, glAccounts, onClose, onSave, saving }: TxnSheetProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [type,        setType]        = useState<TxnType>("Deposit");
  const [date,        setDate]        = useState(today);
  const [amount,      setAmount]      = useState("");
  const [payee,       setPayee]       = useState("");
  const [description, setDescription] = useState("");
  const [reference,   setReference]   = useState("");
  const [contraId,    setContraId]    = useState("");
  const [transferTo,  setTransferTo]  = useState("");

  const reset = () => {
    setType("Deposit"); setDate(today); setAmount(""); setPayee("");
    setDescription(""); setReference(""); setContraId(""); setTransferTo("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) { toast.error("Amount must be greater than zero"); return; }
    if (type === "Transfer" && !transferTo) { toast.error("Select a destination account for transfer"); return; }
    await onSave({
      type,
      date,
      amount: Number(amount),
      payee: payee || null,
      description: description || null,
      reference: reference || null,
      contra_account_id: contraId || null,
      transfer_to_account_id: type === "Transfer" ? (transferTo || null) : null,
    });
    reset();
  };

  const otherAccounts = accounts.filter((a) => a.id !== account.id && a.status !== "Inactive");

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New Transaction</SheetTitle>
          <SheetDescription>{account.name} · {account.bank}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-0 overflow-y-auto">
          <div className="flex-1 space-y-4 px-1 py-3">

            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-xs">Transaction type</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {TXN_TYPES.map((t) => {
                  const cfg = TYPE_CONFIG[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
                        type === t
                          ? "bg-primary/10 border-primary/30 text-primary"
                          : "bg-background hover:bg-muted/40"
                      }`}
                    >
                      <span className={cfg.color}>{cfg.icon}</span>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Date + Amount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" className="h-8 text-xs" value={date}
                  onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Amount ({account.currency ?? "USD"})</Label>
                <Input type="number" step="0.01" min="0.01" className="h-8 text-xs font-mono"
                  placeholder="0.00" value={amount}
                  onChange={(e) => setAmount(e.target.value)} required />
              </div>
            </div>

            {/* Payee */}
            <div className="space-y-1.5">
              <Label className="text-xs">{type === "Receipt" || type === "Deposit" ? "From (payer)" : "To (payee)"}</Label>
              <Input className="h-8 text-xs" placeholder="Payee name…" value={payee}
                onChange={(e) => setPayee(e.target.value)} />
            </div>

            {/* Transfer destination */}
            {type === "Transfer" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Destination account <span className="text-destructive">*</span></Label>
                <Select value={transferTo} onValueChange={setTransferTo}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select account…" /></SelectTrigger>
                  <SelectContent>
                    {otherAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} — {a.bank}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Contra GL account */}
            {type !== "Transfer" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Contra GL account (optional — defaults to {
                  type === "Deposit" || type === "Receipt" ? "Sales Revenue" : "Operating Expenses"
                })</Label>
                <Select value={contraId || "default"} onValueChange={(v) => setContraId(v === "default" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Use default…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use default</SelectItem>
                    <Separator className="my-1" />
                    {glAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="font-mono text-muted-foreground mr-1.5 text-[11px]">{a.code}</span>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            {/* Reference + Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">Reference</Label>
              <Input className="h-8 text-xs font-mono" placeholder="Cheque #, wire ref…" value={reference}
                onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea rows={2} className="text-xs resize-none" placeholder="Optional notes…"
                value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="shrink-0 border-t px-1 pt-3 pb-1 flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Draft
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function BankingPage() {
  const { can, tenant } = useAuth();
  const qc = useQueryClient();

  const canWrite = can(["banking.create", "banking.update"]);
  const canPost  = can(["banking.create", "banking.reconcile"]);
  const canVoid  = can("banking.void");

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [txnSheetOpen,      setTxnSheetOpen]       = useState(false);
  const [search,            setSearch]             = useState("");
  const [typeFilter,        setTypeFilter]         = useState("all");
  const [page,              setPage]               = useState(1);
  const [postingId,         setPostingId]          = useState<string | null>(null);
  const [voidingTxn,        setVoidingTxn]         = useState<BankTransaction | null>(null);

  // ── Accounts ──────────────────────────────────────────────────────────────
  const { data: accounts = [], isLoading: acctLoading } = useQuery<BankAccount[]>({
    queryKey: ["bank_accounts", "list"],
    queryFn: async () => {
      const { data, error } = await db.from("bank_accounts").select("*").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null;

  // ── GL accounts for contra picker ─────────────────────────────────────────
  const { data: glAccounts = [] } = useQuery<GlAccount[]>({
    queryKey: ["chart_of_accounts", "banking-picker"],
    queryFn: async () => {
      const { data } = await db.from("chart_of_accounts").select("id,code,name")
        .is("deleted_at", null).eq("is_active", true)
        .eq("allow_manual_posting", true).order("code");
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // ── Transactions for selected account ─────────────────────────────────────
  const { data: txnData, isLoading: txnLoading } = useQuery({
    queryKey: ["bank_transactions", selectedAccount?.id, { search, typeFilter, page }],
    enabled: !!selectedAccount,
    queryFn: async () => {
      let q = db.from("bank_transactions")
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .eq("bank_account_id", selectedAccount!.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (search.trim())
        q = q.or(`description.ilike.%${search.trim()}%,reference.ilike.%${search.trim()}%,payee.ilike.%${search.trim()}%`);
      if (typeFilter !== "all") q = q.eq("type", typeFilter);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as BankTransaction[], count: count ?? 0 };
    },
    staleTime: 15_000,
  });

  const txns      = txnData?.rows  ?? [];
  const txnTotal  = txnData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(txnTotal / PAGE_SIZE));

  // ── Account summary ───────────────────────────────────────────────────────
  const summary = useMemo(() => {
    if (!txns.length) return null;
    const posted = txns.filter((t) => t.status === "Posted");
    const inflow  = posted.filter((t) => ["Deposit","Receipt"].includes(t.type)).reduce((s, t) => s + Number(t.amount), 0);
    const outflow = posted.filter((t) => ["Withdrawal","Payment","Fee"].includes(t.type)).reduce((s, t) => s + Number(t.amount), 0);
    return { inflow, outflow };
  }, [txns]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bank_transactions"] });
    qc.invalidateQueries({ queryKey: ["bank_accounts", "list"] });
  };

  const createMutation = useMutation({
    mutationFn: async (values: Partial<BankTransaction>) => {
      if (!tenant?.id || !selectedAccount) throw new Error("No account");
      const { error } = await db.from("bank_transactions").insert({
        ...values,
        tenant_id: tenant.id,
        bank_account_id: selectedAccount.id,
        status: "Draft",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Transaction saved"); setTxnSheetOpen(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Save failed"),
  });

  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("post_bank_transaction", { _txn_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Transaction posted"); setPostingId(null); invalidate(); },
    onError: (e: Error) => { toast.error(e.message ?? "Post failed"); setPostingId(null); },
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("void_posted_document", {
        _entity_type: "bank_transaction",
        _entity_id: id,
        _permission: "banking.void",
        _reason: "Bank transaction voided",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Transaction voided"); setVoidingTxn(null); invalidate(); },
    onError: (e: Error) => { toast.error(e.message ?? "Void failed"); setVoidingTxn(null); },
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  if (acctLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading banking…
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Account sidebar ── */}
      <div className="w-64 shrink-0 border-r flex flex-col bg-muted/20">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Bank Accounts</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {accounts.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">No bank accounts yet.</p>
          )}
          {accounts.map((acct) => {
            const isSelected = acct.id === (selectedAccount?.id ?? accounts[0]?.id);
            const bal = acct.balance ?? acct.opening_balance ?? 0;
            return (
              <button
                key={acct.id}
                className={`w-full flex flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b border-border/40 ${
                  isSelected ? "bg-primary/8 border-l-2 border-l-primary" : ""
                }`}
                onClick={() => { setSelectedAccountId(acct.id); setPage(1); }}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-sm font-medium leading-snug truncate">{acct.name}</span>
                  <span className={`font-mono text-xs tabular-nums shrink-0 ${bal < 0 ? "text-destructive" : ""}`}>
                    {money(bal)}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground truncate">
                  {acct.bank} {acct.account_number ? `· ${acct.account_number}` : ""}
                </span>
                <span className="text-[10px] text-muted-foreground/60 font-mono">{acct.currency ?? "USD"}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Transaction ledger ── */}
      {selectedAccount ? (
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Account header */}
          <div className="shrink-0 border-b px-6 py-3 bg-background">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-base font-semibold">{selectedAccount.name}</h1>
                <p className="text-xs text-muted-foreground">
                  {selectedAccount.bank}
                  {selectedAccount.account_number ? ` · ${selectedAccount.account_number}` : ""}
                  {" · "}{selectedAccount.currency ?? "USD"}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {summary && (
                  <>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground">Inflows</p>
                      <p className="font-mono text-sm font-semibold text-emerald-600">
                        {money(summary.inflow, selectedAccount.currency ?? "")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground">Outflows</p>
                      <p className="font-mono text-sm font-semibold text-red-600">
                        {money(summary.outflow, selectedAccount.currency ?? "")}
                      </p>
                    </div>
                  </>
                )}
                <div className="text-right border-l pl-4">
                  <p className="text-[11px] text-muted-foreground">Current Balance</p>
                  <p className={`font-mono text-base font-bold ${(selectedAccount.balance ?? 0) < 0 ? "text-destructive" : ""}`}>
                    {money(selectedAccount.balance ?? selectedAccount.opening_balance, selectedAccount.currency ?? "")}
                  </p>
                </div>
                {canWrite && (
                  <Button size="sm" className="h-8" onClick={() => setTxnSheetOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> New Transaction
                  </Button>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="mt-2 flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-7 w-52 pl-8 text-xs" placeholder="Search payee, ref, description…"
                  value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
                {search && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setSearch("")}><X className="h-3 w-3" /></button>
                )}
              </div>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {TXN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-7 w-7 px-0"
                onClick={() => qc.invalidateQueries({ queryKey: ["bank_transactions"] })}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 text-left w-28 whitespace-nowrap">Date</th>
                  <th className="px-4 py-2.5 text-left w-28 whitespace-nowrap">Type</th>
                  <th className="px-4 py-2.5 text-left">Payee / Description</th>
                  <th className="px-4 py-2.5 text-left w-32 whitespace-nowrap">Reference</th>
                  <th className="px-4 py-2.5 text-right w-32 whitespace-nowrap">Money In</th>
                  <th className="px-4 py-2.5 text-right w-32 whitespace-nowrap">Money Out</th>
                  <th className="px-4 py-2.5 text-left w-24 whitespace-nowrap">Status</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {txnLoading && (
                  <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td></tr>
                )}
                {!txnLoading && txns.length === 0 && (
                  <tr><td colSpan={8} className="py-16 text-center text-xs text-muted-foreground">
                    No transactions yet. Add a deposit, withdrawal, or fee.
                  </td></tr>
                )}
                {txns.map((txn) => {
                  const cfg = TYPE_CONFIG[txn.type as TxnType] ?? TYPE_CONFIG.Deposit;
                  const isIn  = cfg.direction === "in";
                  const isOut = cfg.direction === "out";
                  return (
                    <tr key={txn.id} className={`group border-b transition-colors hover:bg-muted/30 ${txn.status === "Voided" ? "opacity-40" : ""}`}>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{dateFmt(txn.date)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                          {cfg.icon} {txn.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 max-w-[260px]">
                        <p className={`text-sm font-medium truncate ${txn.status === "Voided" ? "line-through" : ""}`}>
                          {txn.payee ?? txn.description ?? <span className="text-muted-foreground italic">—</span>}
                        </p>
                        {txn.description && txn.payee && (
                          <p className="text-xs text-muted-foreground truncate">{txn.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs text-muted-foreground">{txn.reference ?? "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {isIn && <span className="font-mono text-sm tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{money(txn.amount)}</span>}
                        {!isIn && <span className="text-muted-foreground/25 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {isOut && <span className="font-mono text-sm tabular-nums font-medium text-red-600 dark:text-red-400">({money(txn.amount)})</span>}
                        {cfg.direction === "both" && <span className="font-mono text-sm tabular-nums font-medium text-blue-600">{money(txn.amount)}</span>}
                        {isIn && <span className="text-muted-foreground/25 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={txn.status} /></td>
                      <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {txn.status === "Draft" && canPost && (
                              <DropdownMenuItem onClick={() => postMutation.mutate(txn.id)}>
                                Post transaction
                              </DropdownMenuItem>
                            )}
                            {txn.status === "Posted" && canVoid && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => setVoidingTxn(txn)}>
                                  Void &amp; reverse
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex shrink-0 items-center justify-between border-t px-6 py-2 text-xs text-muted-foreground">
            <span>{txnTotal} transaction{txnTotal !== 1 ? "s" : ""} · page {page} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Building2 className="h-8 w-8 opacity-20" />
          <p className="text-sm">No bank accounts. Add one via Chart of Accounts or the account settings.</p>
        </div>
      )}

      {/* Transaction sheet */}
      {selectedAccount && (
        <TxnSheet
          open={txnSheetOpen}
          account={selectedAccount}
          accounts={accounts}
          glAccounts={glAccounts}
          onClose={() => setTxnSheetOpen(false)}
          onSave={(v) => createMutation.mutateAsync(v)}
          saving={createMutation.isPending}
        />
      )}

      {/* Void confirm */}
      <AlertDialog open={!!voidingTxn} onOpenChange={(o) => !o && setVoidingTxn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void and reverse transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              The {voidingTxn?.type.toLowerCase()} of{" "}
              <span className="font-mono font-semibold">{money(voidingTxn?.amount ?? 0, selectedAccount?.currency ?? "")}</span>
              {voidingTxn?.payee ? ` to ${voidingTxn.payee}` : ""} will be permanently voided.
              A reversal journal with every debit and credit swapped will be created in the current period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => voidingTxn && voidMutation.mutate(voidingTxn.id)}
              disabled={voidMutation.isPending}
            >
              {voidMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Void &amp; reverse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
