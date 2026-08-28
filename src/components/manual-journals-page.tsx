import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface JournalEntry {
  id: string;
  number: string | null;
  entry_date: string;
  memo: string | null;
  status: string | null;
  total_debit: number;
  total_credit: number;
  source_ref_type: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const db = supabase as any;
const PAGE_SIZE = 50;

const fmt = (v: string | null | undefined) =>
  !v
    ? "—"
    : new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

const money = (v: number | null | undefined) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const ALL_STATUSES = ["Draft", "Posted", "Voided"];

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "Draft";
  const cfg: Record<string, { cls: string; icon: React.ReactNode }> = {
    Draft: { cls: "bg-muted text-muted-foreground", icon: <MinusCircle className="h-3 w-3" /> },
    Posted: {
      cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    Voided: { cls: "bg-destructive/12 text-destructive", icon: <AlertCircle className="h-3 w-3" /> },
  };
  const { cls, icon } = cfg[s] ?? cfg["Draft"];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {icon}
      {s}
    </span>
  );
}

function BalanceIndicator({ debit, credit }: { debit: number; credit: number }) {
  const balanced = Math.abs(debit - credit) <= 0.005;
  if (debit === 0 && credit === 0) return <span className="text-muted-foreground/40">—</span>;
  return balanced ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Balanced
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
      <AlertCircle className="h-3 w-3" /> Off by {money(Math.abs(debit - credit))}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ManualJournalsPage() {
  const navigate = useNavigate();
  const { can, tenant } = useAuth();
  const qc = useQueryClient();

  const canCreate = can([
    "accounting.journal.create",
    "accounting.create", // legacy fallback
  ]);
  const canPost = can([
    "accounting.journal.post",
    "accounting.post", // legacy fallback
  ]);
  const canVoid = can([
    "accounting.journal.void",
    "accounting.reverse", // legacy fallback
  ]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [voidingRow, setVoidingRow] = useState<JournalEntry | null>(null);

  // ── Fetch ──
  const { data, isLoading } = useQuery({
    queryKey: ["journal_entries", "list", { search, statusFilter, page }],
    queryFn: async () => {
      let q = db
        .from("journal_entries")
        .select("id,number,entry_date,memo,status,total_debit,total_credit,source_ref_type,created_at", {
          count: "exact",
        })
        .is("deleted_at", null)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (search.trim()) q = q.or(`number.ilike.%${search.trim()}%,memo.ilike.%${search.trim()}%`);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as JournalEntry[], count: count ?? 0 };
    },
    staleTime: 15_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Summary counts
  const { data: summary } = useQuery({
    queryKey: ["journal_entries", "summary"],
    queryFn: async () => {
      const { data } = await db
        .from("journal_entries")
        .select("status,total_debit,total_credit")
        .is("deleted_at", null)
        .limit(2000);
      const rows = (data ?? []) as { status: string; total_debit: number; total_credit: number }[];
      const posted = rows.filter((r) => r.status === "Posted");
      return {
        draft: rows.filter((r) => r.status === "Draft").length,
        posted: posted.length,
        voided: rows.filter((r) => r.status === "Voided").length,
        totalPostedDebit: posted.reduce((s, r) => s + Number(r.total_debit), 0),
      };
    },
    staleTime: 30_000,
  });

  // ── Post action ──
  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("post_manual_journal", { _journal_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Journal posted");
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Post failed"),
  });

  // ── Void action ──
  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("void_manual_journal", {
        _journal_id: id,
        _reason: "Voided from journal list",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Journal voided and reversed");
      setVoidingRow(null);
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "Void failed");
      setVoidingRow(null);
    },
  });

  const openJournal = (id: string) => navigate({ to: "/accounting/journals/$id" as any, params: { id } as any });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── Header ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Manual Journals</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-52 pl-8 text-xs"
                placeholder="Search entry # or description…"
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
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {canCreate && (
              <Button size="sm" className="h-8" onClick={() => openJournal("new")}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New Journal
              </Button>
            )}
          </div>
        </div>

        {/* ── Summary strip ── */}
        {summary && (
          <div className="mt-3 flex items-center gap-6 text-xs">
            {[
              { label: "Draft", value: summary.draft, cls: "text-muted-foreground" },
              { label: "Posted", value: summary.posted, cls: "text-emerald-600 dark:text-emerald-400 font-medium" },
              { label: "Voided", value: summary.voided, cls: "text-destructive" },
            ].map((s, i) => (
              <button
                key={s.label}
                className={`flex items-center gap-1.5 ${s.cls} hover:opacity-75 transition-opacity`}
                onClick={() => {
                  setStatusFilter(statusFilter === s.label ? "all" : s.label);
                  setPage(1);
                }}
              >
                <span className="font-mono text-sm font-semibold">{s.value}</span>
                <span>{s.label}</span>
              </button>
            ))}
            <span className="ml-auto text-muted-foreground">
              Total posted volume:{" "}
              <span className="font-mono font-medium text-foreground">{money(summary.totalPostedDebit)}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Entry #</th>
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Date</th>
              <th className="px-4 py-2.5 text-left">Description</th>
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Source</th>
              <th className="px-4 py-2.5 text-right whitespace-nowrap">Total Debits</th>
              <th className="px-4 py-2.5 text-right whitespace-nowrap">Total Credits</th>
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Balance</th>
              <th className="px-4 py-2.5 text-left whitespace-nowrap">Status</th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-xs text-muted-foreground">
                  No journal entries found.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isDraft = row.status === "Draft";
              const isPosted = row.status === "Posted";
              const isVoided = row.status === "Voided";
              const isManual = !row.source_ref_type || row.source_ref_type === "manual";

              return (
                <tr
                  key={row.id}
                  className={`group cursor-pointer border-b transition-colors hover:bg-muted/40 ${isVoided ? "opacity-50" : ""}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
                    openJournal(row.id);
                  }}
                >
                  {/* Entry # */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold text-primary">
                      {row.number ?? <span className="text-muted-foreground italic">No number</span>}
                    </span>
                  </td>

                  {/* Date */}
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{fmt(row.entry_date)}</td>

                  {/* Description */}
                  <td className="px-4 py-2.5 max-w-[280px]">
                    <p className={`truncate text-sm ${isVoided ? "line-through" : "font-medium"}`}>
                      {row.memo ?? <span className="italic text-muted-foreground">No description</span>}
                    </p>
                  </td>

                  {/* Source */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">
                      {row.source_ref_type ?? "manual"}
                    </span>
                  </td>

                  {/* Debits */}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <span className="font-mono text-xs tabular-nums">{money(row.total_debit)}</span>
                  </td>

                  {/* Credits */}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <span className="font-mono text-xs tabular-nums">{money(row.total_credit)}</span>
                  </td>

                  {/* Balance indicator */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <BalanceIndicator debit={row.total_debit} credit={row.total_credit} />
                  </td>

                  {/* Status */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <StatusBadge status={row.status} />
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-2.5 text-right" data-no-nav>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openJournal(row.id)}>Open</DropdownMenuItem>
                        {isDraft && canPost && isManual && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                postMutation.mutate(row.id);
                              }}
                            >
                              Post journal
                            </DropdownMenuItem>
                          </>
                        )}
                        {isPosted && canVoid && isManual && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setVoidingRow(row);
                              }}
                            >
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

      {/* ── Pagination ── */}
      <div className="flex shrink-0 items-center justify-between border-t px-6 py-2 text-xs text-muted-foreground">
        <span>
          {total} entr{total !== 1 ? "ies" : "y"}
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

      {/* ── Void confirmation ── */}
      <AlertDialog open={!!voidingRow} onOpenChange={(o) => !o && setVoidingRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void and reverse journal?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono font-semibold">{voidingRow?.number}</span> will be voided. A balancing reversal
              journal will be created automatically. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => voidingRow && voidMutation.mutate(voidingRow.id)}
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
