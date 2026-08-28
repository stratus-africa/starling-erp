import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Pencil,
  Trash2,
  X,
  Info,
} from "lucide-react";
import { toast } from "sonner";

// ─── Constants ──────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

const CURRENCIES = ["USD", "EUR", "GBP", "KES", "AED", "EGP", "INR", "ZAR"] as const;

const PAGE_SIZE = 50;

/** System account purpose → code + description */
const SYSTEM_MAPPINGS = [
  { purpose: "Cash", code: "1000", description: "Primary cash and cash-equivalent account" },
  { purpose: "Accounts Receivable", code: "1100", description: "Amounts owed by customers" },
  { purpose: "Inventory", code: "1200", description: "Stock held for sale" },
  { purpose: "Work in Progress", code: "1300", description: "Partially completed production costs" },
  { purpose: "Accounts Payable", code: "2000", description: "Amounts owed to suppliers" },
  { purpose: "Equity", code: "3000", description: "Owner / shareholder equity" },
  { purpose: "Sales Revenue", code: "4000", description: "Revenue from primary business operations" },
  { purpose: "Cost of Goods Sold", code: "5000", description: "Direct cost of products sold" },
  { purpose: "Operating Expenses", code: "6000", description: "Overhead and indirect operating costs" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  tenant_id: string;
  code: string | null;
  name: string;
  type: string | null;
  parent_id: string | null;
  normal_balance: "Debit" | "Credit";
  is_active: boolean;
  is_system: boolean;
  description: string | null;
  opening_balance: number;
  balance: number | null;
  currency: string | null;
  allow_manual_posting: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type AccountForm = Omit<Account, "id" | "tenant_id" | "created_at" | "updated_at" | "deleted_at">;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const db = supabase as any;

const money = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Given an account type, return tailwind classes for the badge */
function typeBadgeClass(type: string | null): string {
  switch (type) {
    case "Asset":
      return "bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/20";
    case "Liability":
      return "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/20";
    case "Equity":
      return "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/20";
    case "Income":
      return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
    case "Expense":
      return "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Derive normal_balance from type */
function defaultNormalBalance(type: string): "Debit" | "Credit" {
  return type === "Asset" || type === "Expense" ? "Debit" : "Credit";
}

const emptyForm = (): AccountForm => ({
  code: "",
  name: "",
  type: "Asset",
  parent_id: null,
  normal_balance: "Debit",
  is_active: true,
  is_system: false,
  description: "",
  opening_balance: 0,
  balance: null,
  currency: null,
  allow_manual_posting: true,
});

// ─── Account Editor Sheet ─────────────────────────────────────────────────────

interface EditorSheetProps {
  open: boolean;
  account: Account | null; // null = create mode
  accounts: Account[]; // for parent FK select
  onClose: () => void;
  onSave: (values: AccountForm, id?: string) => Promise<void>;
  saving: boolean;
}

function EditorSheet({ open, account, accounts, onClose, onSave, saving }: EditorSheetProps) {
  const isEdit = account != null;
  const [form, setForm] = useState<AccountForm>(() =>
    isEdit
      ? {
          code: account.code ?? "",
          name: account.name,
          type: account.type ?? "Asset",
          parent_id: account.parent_id,
          normal_balance: account.normal_balance ?? "Debit",
          is_active: account.is_active ?? true,
          is_system: account.is_system ?? false,
          description: account.description ?? "",
          opening_balance: account.opening_balance ?? 0,
          balance: account.balance,
          currency: account.currency,
          allow_manual_posting: account.allow_manual_posting ?? true,
        }
      : emptyForm(),
  );

  // Re-initialise when the account prop changes
  const prevId = account?.id;
  useMemo(() => {
    if (isEdit) {
      setForm({
        code: account.code ?? "",
        name: account.name,
        type: account.type ?? "Asset",
        parent_id: account.parent_id,
        normal_balance: account.normal_balance ?? "Debit",
        is_active: account.is_active ?? true,
        is_system: account.is_system ?? false,
        description: account.description ?? "",
        opening_balance: account.opening_balance ?? 0,
        balance: account.balance,
        currency: account.currency,
        allow_manual_posting: account.allow_manual_posting ?? true,
      });
    } else {
      setForm(emptyForm());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevId, open]);

  const set = <K extends keyof AccountForm>(k: K, v: AccountForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleTypeChange = (t: string) => {
    set("type", t);
    set("normal_balance", defaultNormalBalance(t));
  };

  const parentOptions = accounts.filter((a) => a.id !== account?.id && !a.deleted_at);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Account name is required");
      return;
    }
    await onSave(form, account?.id);
  };

  const isSystemAccount = isEdit && account.is_system;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden sm:max-w-lg">
        <SheetHeader className="shrink-0 pr-2">
          <SheetTitle>{isEdit ? "Edit Account" : "New Account"}</SheetTitle>
          <SheetDescription>
            {isEdit ? `${account.code ?? ""} · ${account.name}` : "Add a new account to the chart of accounts."}
          </SheetDescription>
        </SheetHeader>

        {isSystemAccount && (
          <div className="mx-1 mt-1 flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This is a system account used by the posting engine. The code and type are locked to prevent breaking
              posted journals.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
          <div className="flex-1 space-y-5 px-1 py-3">
            {/* ── Identity ── */}
            <section>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Identity</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="code" className="text-xs">
                    Account Code
                  </Label>
                  <Input
                    id="code"
                    value={form.code ?? ""}
                    onChange={(e) => set("code", e.target.value)}
                    placeholder="e.g. 1000"
                    disabled={isSystemAccount}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency" className="text-xs">
                    Currency
                  </Label>
                  <Select
                    value={form.currency ?? "default"}
                    onValueChange={(v) => set("currency", v === "default" ? null : v)}
                  >
                    <SelectTrigger id="currency" className="text-xs">
                      <SelectValue placeholder="Tenant default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Tenant default</SelectItem>
                      <Separator className="my-1" />
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                <Label htmlFor="name" className="text-xs">
                  Account Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Accounts Receivable"
                  required
                />
              </div>
            </section>

            <Separator />

            {/* ── Classification ── */}
            <section>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Classification
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="type" className="text-xs">
                    Account Type <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.type ?? "Asset"} onValueChange={handleTypeChange} disabled={isSystemAccount}>
                    <SelectTrigger id="type" className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="normal_balance" className="text-xs">
                    Normal Balance
                  </Label>
                  <Select
                    value={form.normal_balance}
                    onValueChange={(v) => set("normal_balance", v as "Debit" | "Credit")}
                  >
                    <SelectTrigger id="normal_balance" className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Debit">Debit</SelectItem>
                      <SelectItem value="Credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                <Label htmlFor="parent_id" className="text-xs">
                  Parent Account
                </Label>
                <Select
                  value={form.parent_id ?? "none"}
                  onValueChange={(v) => set("parent_id", v === "none" ? null : v)}
                >
                  <SelectTrigger id="parent_id" className="text-xs">
                    <SelectValue placeholder="None (top-level)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (top-level)</SelectItem>
                    <Separator className="my-1" />
                    {parentOptions.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="font-mono text-xs text-muted-foreground mr-1.5">{a.code}</span>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            <Separator />

            {/* ── Balances ── */}
            <section>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Balances</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="opening_balance" className="text-xs">
                    Opening Balance
                  </Label>
                  <Input
                    id="opening_balance"
                    type="number"
                    step="0.01"
                    value={form.opening_balance ?? 0}
                    onChange={(e) => set("opening_balance", Number(e.target.value))}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="balance" className="text-xs">
                    Current Balance
                  </Label>
                  <Input
                    id="balance"
                    type="number"
                    step="0.01"
                    value={form.balance ?? ""}
                    onChange={(e) => set("balance", e.target.value === "" ? null : Number(e.target.value))}
                    className="font-mono"
                    placeholder="Computed from journals"
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* ── Settings ── */}
            <section>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Settings</p>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Active</p>
                    <p className="text-xs text-muted-foreground">Inactive accounts are hidden from selectors.</p>
                  </div>
                  <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Allow manual posting</p>
                    <p className="text-xs text-muted-foreground">
                      When off, this account can only receive automated entries.
                    </p>
                  </div>
                  <Switch checked={form.allow_manual_posting} onCheckedChange={(v) => set("allow_manual_posting", v)} />
                </div>

                {!isEdit && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">System account</p>
                      <p className="text-xs text-muted-foreground">
                        Mark if this account is required by the posting engine.
                      </p>
                    </div>
                    <Switch checked={form.is_system} onCheckedChange={(v) => set("is_system", v)} />
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* ── Description ── */}
            <section>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Description
              </p>
              <Textarea
                id="description"
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Optional notes about this account's purpose…"
                rows={3}
                className="text-sm resize-none"
              />
            </section>
          </div>

          {/* ── Footer ── */}
          <div className="shrink-0 border-t px-1 pt-3 pb-1 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save changes" : "Create account"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── System Accounts Mapping Panel ──────────────────────────────────────────

function SystemMappingsInfo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setOpen(true)}>
              <ShieldCheck className="h-3.5 w-3.5" />
              System mappings
            </Button>
          </TooltipTrigger>
          <TooltipContent>View system account purpose → code mappings</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>System Account Mappings</SheetTitle>
            <SheetDescription>
              These accounts are reserved by the posting engine. Changing their codes will break automated journal
              entries.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left">Purpose</th>
                  <th className="px-3 py-2 text-left font-mono">Code</th>
                </tr>
              </thead>
              <tbody>
                {SYSTEM_MAPPINGS.map((m, i) => (
                  <tr key={m.code} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{m.purpose}</p>
                      <p className="text-xs text-muted-foreground">{m.description}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-primary">{m.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            System accounts are protected from deletion. To reassign a purpose, add a new account then update the
            posting configuration.
          </p>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function ChartOfAccountsPage() {
  const { can, tenant } = useAuth();
  const qc = useQueryClient();

  const canWrite = can([
    "accounting.accounts.create",
    "accounting.accounts.update",
    "accounting.create", // legacy fallback
    "accounting.update", // legacy fallback
  ]);

  // ── Filters ──
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // ── Fetch ──
  const { data, isLoading } = useQuery({
    queryKey: ["chart_of_accounts", "list", { search, typeFilter, statusFilter, page }],
    queryFn: async () => {
      let q = db
        .from("chart_of_accounts")
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("code", { ascending: true })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (search.trim()) q = q.or(`name.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%`);
      if (typeFilter !== "all") q = q.eq("type", typeFilter);
      if (statusFilter === "active") q = q.eq("is_active", true);
      if (statusFilter === "inactive") q = q.eq("is_active", false);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Account[], count: count ?? 0 };
    },
    staleTime: 15_000,
  });

  // All accounts (for parent FK options, unbounded)
  const { data: allAccounts = [] } = useQuery({
    queryKey: ["chart_of_accounts", "all"],
    queryFn: async () => {
      const { data } = await db
        .from("chart_of_accounts")
        .select("id,code,name,type,is_active")
        .is("deleted_at", null)
        .order("code");
      return (data ?? []) as Account[];
    },
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Parent name lookup (for table display)
  const parentMap = useMemo(() => new Map(allAccounts.map((a) => [a.id, a])), [allAccounts]);

  // ── Type summary counts ──
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of allAccounts) c[a.type ?? "—"] = (c[a.type ?? "—"] ?? 0) + 1;
    return c;
  }, [allAccounts]);

  // ── Mutations ──
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["chart_of_accounts"] });
  };

  const createMutation = useMutation({
    mutationFn: async (values: AccountForm) => {
      if (!tenant?.id) throw new Error("No tenant");
      const { error } = await db.from("chart_of_accounts").insert({ ...values, tenant_id: tenant.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account created");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Create failed"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: AccountForm }) => {
      const { error } = await db
        .from("chart_of_accounts")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("chart_of_accounts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Delete failed"),
  });

  // ── Sheet / dialog state ──
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);

  const openCreate = () => {
    setEditingAccount(null);
    setSheetOpen(true);
  };
  const openEdit = (a: Account) => {
    setEditingAccount(a);
    setSheetOpen(true);
  };
  const closeSheet = () => {
    setSheetOpen(false);
    setEditingAccount(null);
  };

  const handleSave = async (values: AccountForm, id?: string) => {
    if (id) {
      await updateMutation.mutateAsync({ id, values });
    } else {
      await createMutation.mutateAsync(values);
    }
    closeSheet();
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── Header ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Chart of Accounts</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-52 pl-8 text-xs"
                placeholder="Search code or name…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
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
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <Filter className="mr-1.5 h-3 w-3 text-muted-foreground" />
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                    {typeCounts[t] != null && (
                      <span className="ml-1 text-muted-foreground text-[10px]">({typeCounts[t]})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <SystemMappingsInfo />

            {canWrite && (
              <Button size="sm" className="h-8" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New Account
              </Button>
            )}
          </div>
        </div>

        {/* ── Type summary bar ── */}
        <div className="mt-3 flex items-center gap-4">
          {ACCOUNT_TYPES.map((t) => (
            <button
              key={t}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80 ${
                typeFilter === t ? typeBadgeClass(t) + " ring-1 ring-current/30" : "bg-muted/30 text-muted-foreground"
              }`}
              onClick={() => {
                setTypeFilter(typeFilter === t ? "all" : t);
                setPage(1);
              }}
            >
              {t}
              <span className="font-mono">{typeCounts[t] ?? 0}</span>
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{allAccounts.length} total accounts</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Code</th>
              <th className="px-4 py-2.5 text-left">Account Name</th>
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Type</th>
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Parent</th>
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Normal Bal.</th>
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Currency</th>
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Manual Post</th>
              <th className="px-4 py-2.5 text-right whitespace-nowrap">Balance</th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-16 text-center text-xs text-muted-foreground">
                  No accounts found.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const parent = row.parent_id ? parentMap.get(row.parent_id) : null;
              const isSystem = row.is_system;
              const isInactive = !row.is_active;

              return (
                <tr
                  key={row.id}
                  className={`group border-b transition-colors hover:bg-muted/40 ${isInactive ? "opacity-50" : ""}`}
                >
                  {/* Code */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-primary">{row.code ?? "—"}</span>
                      {isSystem && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <ShieldCheck className="h-3 w-3 text-amber-500 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs">
                              System account — used by the posting engine
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </td>

                  {/* Name */}
                  <td className="px-4 py-2.5 max-w-[220px]">
                    <p className="font-medium leading-snug">{row.name}</p>
                    {row.description && <p className="truncate text-xs text-muted-foreground">{row.description}</p>}
                  </td>

                  {/* Type badge */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${typeBadgeClass(row.type)}`}
                    >
                      {row.type ?? "—"}
                    </span>
                  </td>

                  {/* Parent */}
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                    {parent ? (
                      <span>
                        <span className="font-mono text-primary mr-1">{parent.code}</span>
                        {parent.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>

                  {/* Normal balance */}
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                    <span
                      className={`font-medium ${
                        row.normal_balance === "Debit"
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {row.normal_balance}
                    </span>
                  </td>

                  {/* Currency */}
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                    {row.currency ?? <span className="text-muted-foreground/50">Default</span>}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        row.is_active
                          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>

                  {/* Allow manual posting */}
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                    {row.allow_manual_posting ? (
                      <span className="text-muted-foreground">Yes</span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground/60">
                        <Lock className="h-3 w-3" /> Auto only
                      </span>
                    )}
                  </td>

                  {/* Balance */}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <span className="font-mono text-xs tabular-nums">
                      {row.balance != null ? money(row.balance) : "—"}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    {canWrite && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(row)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                          {!isSystem && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeletingAccount(row)}>
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="flex shrink-0 items-center justify-between border-t px-6 py-2 text-xs text-muted-foreground">
        <span>
          {total} account{total !== 1 ? "s" : ""}
          {total > 0 ? ` · page ${page} of ${totalPages}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Editor Sheet ── */}
      <EditorSheet
        open={sheetOpen}
        account={editingAccount}
        accounts={allAccounts}
        onClose={closeSheet}
        onSave={handleSave}
        saving={saving}
      />

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deletingAccount} onOpenChange={(o) => !o && setDeletingAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono font-semibold">{deletingAccount?.code}</span> {deletingAccount?.name} will be
              soft-deleted. This cannot be undone if there are journal lines posted against this account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingAccount) {
                  deleteMutation.mutate(deletingAccount.id);
                  setDeletingAccount(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
