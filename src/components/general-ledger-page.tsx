import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const db = supabase as any;
const PAGE_SIZE = 100;

const SOURCE_LABELS: Record<string, string> = {
  manual:           "Manual Journal",
  invoice:          "Invoice",
  bill:             "Bill",
  credit_note:      "Credit Note",
  payment_received: "Payment",
  payment_made:     "Payment Made",
  adjustment:       "Inv. Adjustment",
  transfer:         "Inv. Transfer",
  production_order: "Production",
  shipment:         "Shipment",
  package:          "Package",
  expense:          "Expense",
  reversal:         "Reversal",
};

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  normal_balance: string;
}

interface JournalHeader {
  id: string;
  number: string | null;
  entry_date: string;
  memo: string | null;
  status: string | null;
  source_ref_type: string | null;
  source_ref_id: string | null;
  created_by: string | null;
}

interface RawLine {
  id: string;
  journal_id: string;
  account_id: string;
  debit: number;
  credit: number;
  memo: string | null;
  created_at: string;
}

// A fully resolved ledger row ready for display
interface LedgerRow {
  line_id: string;
  journal_id: string;
  entry_date: string;        // from journal header
  reference: string | null;  // journal number
  description: string | null;// line memo or journal memo
  account_id: string;
  account_code: string | null;
  account_name: string;
  account_type: string | null;
  debit: number;
  credit: number;
  source: string | null;
  source_ref_id: string | null;
  created_by: string | null;
  // computed after sort
  running_balance?: number;
}

interface Filters {
  accountId:  string;
  dateFrom:   string;
  dateTo:     string;
  reference:  string;
  source:     string;
  postedBy:   string;
  accountType:string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const money = (v: number) =>
  v === 0
    ? "—"
    : Math.abs(v).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const balanceFmt = (v: number) =>
  v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const dateFmt = (v: string) =>
  new Date(v).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

function emptyFilters(): Filters {
  return {
    accountId:   "",
    dateFrom:    "",
    dateTo:      "",
    reference:   "",
    source:      "",
    postedBy:    "",
    accountType: "",
  };
}

function hasActiveFilters(f: Filters) {
  return Object.values(f).some((v) => v !== "");
}

// ─── Running balance computation ─────────────────────────────────────────────
// For a single-account view, running balance accumulates from the first row.
// For multi-account view, it resets per account alphabetically.

function withRunningBalances(rows: LedgerRow[], singleAccount: boolean): LedgerRow[] {
  if (singleAccount) {
    let bal = 0;
    return rows.map((r) => {
      bal += r.debit - r.credit;
      return { ...r, running_balance: bal };
    });
  }
  // Multi-account: group by account_id, compute per-account running balance
  const perAccount = new Map<string, number>();
  return rows.map((r) => {
    const prev = perAccount.get(r.account_id) ?? 0;
    const next = prev + r.debit - r.credit;
    perAccount.set(r.account_id, next);
    return { ...r, running_balance: next };
  });
}

// ─── Account picker ───────────────────────────────────────────────────────────

function AccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(s) ||
        (a.code ?? "").toLowerCase().includes(s),
    );
  }, [accounts, q]);

  const selected = accounts.find((a) => a.id === value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex h-8 w-full items-center justify-between rounded-md border bg-background px-3 text-xs hover:bg-muted/40 transition-colors"
        >
          {selected ? (
            <span>
              <span className="font-mono text-muted-foreground mr-1.5">{selected.code}</span>
              {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">All accounts</span>
          )}
          <ChevronRight className="h-3 w-3 text-muted-foreground rotate-90" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 pl-7 text-xs"
              placeholder="Search accounts…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <button
            className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted/60 text-muted-foreground"
            onClick={() => { onChange(""); setQ(""); }}
          >
            All accounts
          </button>
          <Separator className="my-1" />
          {filtered.map((a) => (
            <button
              key={a.id}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60 ${
                a.id === value ? "bg-muted font-medium" : ""
              }`}
              onClick={() => { onChange(a.id); setQ(""); }}
            >
              <span className="font-mono text-muted-foreground w-10 shrink-0 text-right">
                {a.code}
              </span>
              <span className="truncate">{a.name}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              No accounts found.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  accounts,
  onApply,
  onClear,
}: {
  filters: Filters;
  accounts: Account[];
  onApply: (f: Filters) => void;
  onClear: () => void;
}) {
  const [local, setLocal] = useState<Filters>(filters);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setLocal((f) => ({ ...f, [k]: v }));

  // Keep local in sync when external filters clear
  useMemo(() => setLocal(filters), [filters]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Filters
      </p>

      {/* Account */}
      <div className="space-y-1">
        <Label className="text-xs">Account</Label>
        <AccountPicker
          accounts={accounts}
          value={local.accountId}
          onChange={(v) => set("accountId", v)}
        />
      </div>

      {/* Account type */}
      <div className="space-y-1">
        <Label className="text-xs">Account Type</Label>
        <Select
          value={local.accountType || "all"}
          onValueChange={(v) => set("accountType", v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Date from</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={local.dateFrom}
            onChange={(e) => set("dateFrom", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Date to</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={local.dateTo}
            onChange={(e) => set("dateTo", e.target.value)}
          />
        </div>
      </div>

      {/* Reference */}
      <div className="space-y-1">
        <Label className="text-xs">Reference</Label>
        <Input
          className="h-8 text-xs"
          placeholder="e.g. JV-2026-0001"
          value={local.reference}
          onChange={(e) => set("reference", e.target.value)}
        />
      </div>

      {/* Source module */}
      <div className="space-y-1">
        <Label className="text-xs">Source module</Label>
        <Select
          value={local.source || "all"}
          onValueChange={(v) => set("source", v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {Object.entries(SOURCE_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Posted by */}
      <div className="space-y-1">
        <Label className="text-xs">Posted by (email)</Label>
        <Input
          className="h-8 text-xs"
          placeholder="user@example.com"
          value={local.postedBy}
          onChange={(e) => set("postedBy", e.target.value)}
        />
      </div>

      <Separator />

      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => onApply(local)}
        >
          Apply
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => { setLocal(emptyFilters()); onClear(); }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

// ─── Export helper ────────────────────────────────────────────────────────────

function exportToCsv(rows: LedgerRow[]) {
  const header = [
    "Date","Reference","Description","Account Code","Account Name",
    "Account Type","Debit","Credit","Running Balance","Source",
  ].join(",");
  const body = rows.map((r) =>
    [
      r.entry_date,
      r.reference ?? "",
      `"${(r.description ?? "").replace(/"/g, '""')}"`,
      r.account_code ?? "",
      `"${r.account_name.replace(/"/g, '""')}"`,
      r.account_type ?? "",
      r.debit || "",
      r.credit || "",
      r.running_balance?.toFixed(2) ?? "",
      SOURCE_LABELS[r.source ?? ""] ?? (r.source ?? ""),
    ].join(","),
  );
  const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url,
    download: `general-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Summary stats strip ──────────────────────────────────────────────────────

function SummaryStrip({ rows }: { rows: LedgerRow[] }) {
  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const netBalance  = totalDebit - totalCredit;

  return (
    <div className="flex items-center gap-6 px-6 py-2 border-b bg-muted/20 text-xs">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-muted-foreground">Total Debits</span>
        <span className="font-mono font-semibold tabular-nums">
          {totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-muted-foreground">Total Credits</span>
        <span className="font-mono font-semibold tabular-nums">
          {totalCredit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Minus className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Net</span>
        <span
          className={`font-mono font-semibold tabular-nums ${
            netBalance > 0
              ? "text-blue-600 dark:text-blue-400"
              : netBalance < 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          }`}
        >
          {netBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <span className="ml-auto text-muted-foreground">
        {rows.length.toLocaleString()} line{rows.length !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function GeneralLedgerPage() {
  const { tenant } = useAuth();

  const [filters,     setFilters]     = useState<Filters>(emptyFilters);
  const [pendingFilters, setPending]  = useState<Filters>(emptyFilters);
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [search,      setSearch]      = useState("");
  const [page,        setPage]        = useState(1);

  const applyFilters = useCallback((f: Filters) => {
    setFilters(f);
    setPage(1);
    setFilterOpen(false);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(emptyFilters());
    setPage(1);
    setFilterOpen(false);
  }, []);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // ── Load all accounts for the picker ──
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["chart_of_accounts", "gl-picker"],
    queryFn: async () => {
      const { data, error } = await db
        .from("chart_of_accounts")
        .select("id,code,name,type,normal_balance")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
    staleTime: 60_000,
  });

  // ── Load profiles (for "posted by" display) ──
  const { data: profiles = [] } = useQuery<{ id: string; email: string; full_name: string | null }[]>({
    queryKey: ["profiles", "gl-lookup"],
    queryFn: async () => {
      const { data } = await db.from("profiles").select("id,email,full_name").limit(500);
      return data ?? [];
    },
    staleTime: 120_000,
  });
  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  // ── Main ledger query ──
  // Strategy:
  //   1. Query journal_entries with status=Posted + optional date/reference/source filters
  //   2. For those entries, query journal_lines with optional account filter
  //   3. Resolve accounts in batch
  //   4. Stitch into LedgerRow[], sort by entry_date ASC then journal number
  //   5. Compute running balance per account
  const { data: ledgerData, isLoading, isFetching } = useQuery({
    queryKey: ["general_ledger", filters, search, page],
    queryFn: async () => {
      if (!tenant?.id) return { rows: [], totalLines: 0, totalPages: 1 };

      // ── Step 1: fetch posted journal headers (with filters) ──
      let hq = db
        .from("journal_entries")
        .select("id,number,entry_date,memo,status,source_ref_type,source_ref_id,created_by")
        .is("deleted_at", null)
        .eq("status", "Posted")
        .order("entry_date", { ascending: true })
        .order("number",     { ascending: true });

      if (filters.dateFrom)  hq = hq.gte("entry_date", filters.dateFrom);
      if (filters.dateTo)    hq = hq.lte("entry_date", filters.dateTo);
      if (filters.reference) hq = hq.ilike("number", `%${filters.reference.trim()}%`);
      if (filters.source)    hq = hq.eq("source_ref_type", filters.source);

      const { data: headers, error: hErr } = await hq.limit(2000);
      if (hErr) throw hErr;

      if (!headers?.length) return { rows: [], totalLines: 0, totalPages: 1 };

      const headerList = headers as JournalHeader[];
      const journalIds = headerList.map((h) => h.id);
      const headerMap  = new Map(headerList.map((h) => [h.id, h]));

      // ── Step 2: fetch journal lines for those headers ──
      let lq = db
        .from("journal_lines")
        .select("id,journal_id,account_id,debit,credit,memo,created_at")
        .in("journal_id", journalIds)
        .order("created_at", { ascending: true });

      if (filters.accountId) lq = lq.eq("account_id", filters.accountId);

      const { data: rawLines, error: lErr } = await lq;
      if (lErr) throw lErr;

      const lines = (rawLines ?? []) as RawLine[];
      if (!lines.length) return { rows: [], totalLines: 0, totalPages: 1 };

      // ── Step 3: resolve accounts ──
      const acctIds = [...new Set(lines.map((l) => l.account_id))];
      const { data: acctData } = await db
        .from("chart_of_accounts")
        .select("id,code,name,type,normal_balance")
        .in("id", acctIds);
      const acctMap = new Map<string, Account>(
        ((acctData ?? []) as Account[]).map((a) => [a.id, a]),
      );

      // ── Step 4: stitch into LedgerRow[] ──
      let resolved: LedgerRow[] = lines
        .map((l): LedgerRow | null => {
          const header  = headerMap.get(l.journal_id);
          const account = acctMap.get(l.account_id);
          if (!header || !account) return null;
          return {
            line_id:      l.id,
            journal_id:   l.journal_id,
            entry_date:   header.entry_date,
            reference:    header.number,
            description:  l.memo || header.memo,
            account_id:   l.account_id,
            account_code: account.code,
            account_name: account.name,
            account_type: account.type,
            debit:        Number(l.debit)  || 0,
            credit:       Number(l.credit) || 0,
            source:       header.source_ref_type,
            source_ref_id:header.source_ref_id,
            created_by:   header.created_by,
          };
        })
        .filter(Boolean) as LedgerRow[];

      // ── Client-side filters (reference search, posted-by, account type, free text) ──
      if (filters.postedBy) {
        const pb = filters.postedBy.toLowerCase();
        const matchIds = profiles
          .filter((p) => p.email.toLowerCase().includes(pb))
          .map((p) => p.id);
        resolved = resolved.filter((r) => r.created_by && matchIds.includes(r.created_by));
      }

      if (filters.accountType) {
        resolved = resolved.filter((r) => r.account_type === filters.accountType);
      }

      if (search.trim()) {
        const s = search.toLowerCase();
        resolved = resolved.filter(
          (r) =>
            r.account_name.toLowerCase().includes(s) ||
            (r.account_code ?? "").toLowerCase().includes(s) ||
            (r.reference ?? "").toLowerCase().includes(s) ||
            (r.description ?? "").toLowerCase().includes(s),
        );
      }

      // Sort: account_code ASC, then entry_date ASC, then line id ASC
      resolved.sort((a, b) => {
        const codeCmp = (a.account_code ?? "").localeCompare(b.account_code ?? "");
        if (codeCmp !== 0) return codeCmp;
        const dateCmp = a.entry_date.localeCompare(b.entry_date);
        if (dateCmp !== 0) return dateCmp;
        return a.line_id.localeCompare(b.line_id);
      });

      // ── Step 5: running balance ──
      const singleAccount = !!filters.accountId;
      resolved = withRunningBalances(resolved, singleAccount);

      const totalLines = resolved.length;
      const totalPages = Math.max(1, Math.ceil(totalLines / PAGE_SIZE));
      const paged = resolved.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

      return { rows: paged, allRows: resolved, totalLines, totalPages };
    },
    enabled: !!tenant?.id,
    staleTime: 30_000,
  });

  const rows       = ledgerData?.rows       ?? [];
  const allRows    = ledgerData?.allRows    ?? [];
  const totalLines = ledgerData?.totalLines ?? 0;
  const totalPages = ledgerData?.totalPages ?? 1;

  const isSingleAccount = !!filters.accountId;
  const selectedAccount = accounts.find((a) => a.id === filters.accountId);

  // ── Account header banner (single-account mode) ──
  const typeBadge = (type: string | null | undefined) => {
    const map: Record<string, string> = {
      Asset:     "bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/20",
      Liability: "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/20",
      Equity:    "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/20",
      Income:    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
      Expense:   "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/20",
    };
    return map[type ?? ""] ?? "bg-muted text-muted-foreground";
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Page header ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">General Ledger</h1>
            {isFetching && !isLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Inline search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-52 pl-8 text-xs"
                placeholder="Search account, reference…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
              {search && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setSearch(""); setPage(1); }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filter panel */}
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs relative">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="end">
                <FilterPanel
                  filters={filters}
                  accounts={accounts}
                  onApply={applyFilters}
                  onClear={clearFilters}
                />
              </PopoverContent>
            </Popover>

            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={clearFilters}
              >
                <X className="mr-1 h-3 w-3" /> Clear filters
              </Button>
            )}

            {/* Export */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => exportToCsv(allRows)}
              disabled={allRows.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {filters.accountId && selectedAccount && (
              <FilterChip
                label={`Account: ${selectedAccount.code} ${selectedAccount.name}`}
                onRemove={() => applyFilters({ ...filters, accountId: "" })}
              />
            )}
            {filters.accountType && (
              <FilterChip
                label={`Type: ${filters.accountType}`}
                onRemove={() => applyFilters({ ...filters, accountType: "" })}
              />
            )}
            {filters.dateFrom && (
              <FilterChip
                label={`From: ${filters.dateFrom}`}
                onRemove={() => applyFilters({ ...filters, dateFrom: "" })}
              />
            )}
            {filters.dateTo && (
              <FilterChip
                label={`To: ${filters.dateTo}`}
                onRemove={() => applyFilters({ ...filters, dateTo: "" })}
              />
            )}
            {filters.reference && (
              <FilterChip
                label={`Ref: ${filters.reference}`}
                onRemove={() => applyFilters({ ...filters, reference: "" })}
              />
            )}
            {filters.source && (
              <FilterChip
                label={`Source: ${SOURCE_LABELS[filters.source] ?? filters.source}`}
                onRemove={() => applyFilters({ ...filters, source: "" })}
              />
            )}
            {filters.postedBy && (
              <FilterChip
                label={`Posted by: ${filters.postedBy}`}
                onRemove={() => applyFilters({ ...filters, postedBy: "" })}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Single-account banner ── */}
      {isSingleAccount && selectedAccount && (
        <div className="shrink-0 border-b bg-muted/20 px-6 py-2.5 flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-primary">
            {selectedAccount.code}
          </span>
          <span className="font-semibold">{selectedAccount.name}</span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${typeBadge(selectedAccount.type)}`}
          >
            {selectedAccount.type}
          </span>
        </div>
      )}

      {/* ── Summary strip (all rows, not just current page) ── */}
      {allRows.length > 0 && <SummaryStrip rows={allRows} />}

      {/* ── Ledger table ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading ledger…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <BookOpen className="h-8 w-8 opacity-30" />
            <p className="text-sm">No ledger entries match the current filters.</p>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
              <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 text-left whitespace-nowrap">Date</th>
                <th className="px-4 py-2.5 text-left whitespace-nowrap">Reference</th>
                <th className="px-4 py-2.5 text-left">Description</th>
                {!isSingleAccount && (
                  <th className="px-4 py-2.5 text-left whitespace-nowrap">Account</th>
                )}
                <th className="px-4 py-2.5 text-left whitespace-nowrap">Source</th>
                <th className="px-4 py-2.5 text-right whitespace-nowrap w-32">Debit</th>
                <th className="px-4 py-2.5 text-right whitespace-nowrap w-32">Credit</th>
                <th className="px-4 py-2.5 text-right whitespace-nowrap w-36">Running Balance</th>
                <th className="px-4 py-2.5 text-left whitespace-nowrap">Posted by</th>
              </tr>
            </thead>
            <tbody>
              {/* Account group headers for multi-account view */}
              {renderRows(rows, isSingleAccount, profileMap, SOURCE_LABELS)}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalLines > PAGE_SIZE && (
        <div className="flex shrink-0 items-center justify-between border-t px-6 py-2 text-xs text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalLines)} of{" "}
            {totalLines.toLocaleString()} lines
            {totalLines > 2000 ? " (first 2,000 journal entries loaded)" : ""}
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
            <span className="px-2 tabular-nums">
              {page} / {totalPages}
            </span>
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
      )}
    </div>
  );
}

// ─── Row rendering (extracted to keep main component readable) ────────────────

function renderRows(
  rows: LedgerRow[],
  isSingleAccount: boolean,
  profileMap: Map<string, { email: string; full_name: string | null }>,
  sourceLabels: Record<string, string>,
) {
  const elements: React.ReactNode[] = [];
  let lastAccountId: string | null = null;

  for (const r of rows) {
    // Account group header break (multi-account mode)
    if (!isSingleAccount && r.account_id !== lastAccountId) {
      lastAccountId = r.account_id;
      elements.push(
        <tr key={`grp-${r.account_id}`} className="bg-muted/30 border-t-2">
          <td
            colSpan={9}
            className="px-4 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide"
          >
            <span className="font-mono text-primary mr-2">{r.account_code}</span>
            {r.account_name}
            {r.account_type && (
              <span className="ml-2 font-normal normal-case">{r.account_type}</span>
            )}
          </td>
        </tr>,
      );
    }

    const poster = r.created_by ? profileMap.get(r.created_by) : null;
    const posterLabel = poster
      ? poster.full_name ?? poster.email
      : "—";

    const balVal = r.running_balance ?? 0;
    const balPos = balVal >= 0;

    elements.push(
      <tr
        key={r.line_id}
        className="group border-b transition-colors hover:bg-muted/30"
      >
        {/* Date */}
        <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
          {dateFmt(r.entry_date)}
        </td>

        {/* Reference */}
        <td className="px-4 py-2 whitespace-nowrap">
          <span className="font-mono text-xs font-medium text-primary">
            {r.reference ?? <span className="text-muted-foreground/50 italic font-normal">—</span>}
          </span>
        </td>

        {/* Description */}
        <td className="px-4 py-2 max-w-[240px]">
          <span className="truncate block text-xs text-foreground">
            {r.description ?? <span className="text-muted-foreground italic">—</span>}
          </span>
        </td>

        {/* Account (multi-account mode only) */}
        {!isSingleAccount && (
          <td className="px-4 py-2 whitespace-nowrap">
            <span className="font-mono text-xs text-muted-foreground mr-1.5">
              {r.account_code}
            </span>
            <span className="text-xs">{r.account_name}</span>
          </td>
        )}

        {/* Source */}
        <td className="px-4 py-2 whitespace-nowrap">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wide">
            {sourceLabels[r.source ?? ""] ?? (r.source ?? "manual")}
          </span>
        </td>

        {/* Debit */}
        <td className="px-4 py-2 text-right whitespace-nowrap">
          {r.debit > 0 ? (
            <span className="font-mono text-xs tabular-nums font-medium text-blue-700 dark:text-blue-300">
              {money(r.debit)}
            </span>
          ) : (
            <span className="text-muted-foreground/30 text-xs">—</span>
          )}
        </td>

        {/* Credit */}
        <td className="px-4 py-2 text-right whitespace-nowrap">
          {r.credit > 0 ? (
            <span className="font-mono text-xs tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
              {money(r.credit)}
            </span>
          ) : (
            <span className="text-muted-foreground/30 text-xs">—</span>
          )}
        </td>

        {/* Running balance */}
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <span
            className={`font-mono text-xs tabular-nums font-semibold ${
              balVal === 0
                ? "text-muted-foreground"
                : balPos
                ? "text-blue-700 dark:text-blue-300"
                : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {r.running_balance != null ? balanceFmt(Math.abs(balVal)) : "—"}
            {r.running_balance != null && balVal !== 0 && (
              <span className="ml-1 text-[10px] font-normal opacity-60">
                {balPos ? "Dr" : "Cr"}
              </span>
            )}
          </span>
        </td>

        {/* Posted by */}
        <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground max-w-[140px]">
          <span className="truncate block" title={posterLabel}>
            {posterLabel}
          </span>
        </td>
      </tr>,
    );
  }

  return elements;
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
      {label}
      <button
        onClick={onRemove}
        className="hover:text-foreground transition-colors"
        aria-label={`Remove filter: ${label}`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}
