/**
 * Super Admin — Gap Tracking Workspace
 *
 * Route: /super-admin/gaps
 * Imports findings from GAPS_AUDIT.md, links each to its route and calling
 * component, and tracks ownership, priority, status and verification notes.
 */

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Download, Loader2, RefreshCw, Search } from "lucide-react";

import gapAuditMarkdown from "../../../GAPS_AUDIT.md?raw";
import { parseGapAudit, type GapCategory } from "@/lib/gap-audit-import";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { db } from "@/lib/typed-db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/super-admin/gaps")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.settingsView}>
      <GapTrackingContent />
    </PermissionGuard>
  ),
  head: () => ({
    meta: [
      { title: "Gap Tracking | AURORA Super Admin" },
      { name: "description", content: "Track audited product gaps: route, component, owner, priority, status and verification notes." },
      { property: "og:title", content: "Gap Tracking | AURORA Super Admin" },
      { property: "og:description", content: "Track audited product gaps with ownership, priority, status and verification notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface GapRow {
  id: string;
  code: string;
  section: string;
  category: GapCategory;
  title: string;
  route: string | null;
  component: string | null;
  observed_behavior: string | null;
  owner: string | null;
  priority: string;
  status: string;
  verification_notes: string | null;
  updated_at: string;
}

const CATEGORY_LABELS: Record<GapCategory, string> = {
  missing_action: "Missing backend action",
  unreachable_page: "Unreachable page",
  broken_button: "Broken / inert button",
  duplicate_route: "Duplicate route",
  other: "Other",
};

const PRIORITIES = ["critical", "high", "medium", "low"] as const;
const STATUSES = ["open", "in_progress", "blocked", "fixed", "verified", "wont_fix"] as const;

const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-600",
  in_progress: "bg-blue-500/15 text-blue-600",
  blocked: "bg-red-500/15 text-red-600",
  fixed: "bg-emerald-500/15 text-emerald-600",
  verified: "bg-emerald-600/20 text-emerald-700",
  wont_fix: "bg-muted text-muted-foreground",
};

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());

function GapTrackingContent() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const parsed = useMemo(() => parseGapAudit(gapAuditMarkdown), []);

  const { data: rows = [], isLoading } = useQuery<GapRow[]>({
    queryKey: ["platform-gap-findings"],
    queryFn: async () => {
      const { data, error } = await db
        .from("platform_gap_findings")
        .select("*")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as GapRow[];
    },
  });

  const importFindings = useMutation({
    mutationFn: async () => {
      const payload = parsed.map((finding) => ({
        code: finding.code,
        section: finding.section,
        category: finding.category,
        title: finding.title.slice(0, 300),
        route: finding.route,
        component: finding.component,
        observed_behavior: finding.observed_behavior,
        source_document: "GAPS_AUDIT.md",
      }));
      const { error } = await db
        .from("platform_gap_findings")
        .upsert(payload, { onConflict: "code", ignoreDuplicates: true });
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["platform-gap-findings"] });
      toast.success(`Imported ${count} findings from GAPS_AUDIT.md. Existing tracking was kept.`);
    },
    onError: (error: any) => toast.error(error?.message ?? "Import failed."),
  });

  const updateRow = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<GapRow> }) => {
      const { error } = await db.from("platform_gap_findings").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-gap-findings"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not save the change."),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (!needle) return true;
      return [row.title, row.route, row.component, row.owner, row.section, row.observed_behavior]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [rows, search, statusFilter, categoryFilter]);

  const counts = useMemo(() => {
    const open = rows.filter((r) => r.status === "open").length;
    const active = rows.filter((r) => r.status === "in_progress" || r.status === "blocked").length;
    const done = rows.filter((r) => r.status === "fixed" || r.status === "verified").length;
    const unowned = rows.filter((r) => !r.owner).length;
    return { open, active, done, unowned };
  }, [rows]);

  const exportCsv = () => {
    const header = ["Code", "Category", "Title", "Route", "Component", "Owner", "Priority", "Status", "Verification notes"];
    const lines = filtered.map((row) =>
      [row.code, CATEGORY_LABELS[row.category], row.title, row.route ?? "", row.component ?? "", row.owner ?? "", row.priority, row.status, row.verification_notes ?? ""]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "gap-tracking.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList className="h-5 w-5" /> Gap Tracking
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Findings imported from GAPS_AUDIT.md ({parsed.length} in the document), each linked to its route and calling
            component with ownership, priority, status and verification notes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => importFindings.mutate()} disabled={importFindings.isPending}>
            {importFindings.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Import from audit
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Open", value: counts.open },
          { label: "In progress / blocked", value: counts.active },
          { label: "Fixed / verified", value: counts.done },
          { label: "No owner", value: counts.unowned },
        ].map((card) => (
          <Card key={card.label} className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold">{card.value}</div>
          </Card>
        ))}
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, route, component or owner"
            className="pl-8"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(Object.keys(CATEGORY_LABELS) as GapCategory[]).map((key) => (
              <SelectItem key={key} value={key}>{CATEGORY_LABELS[key]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((status) => (
              <SelectItem key={status} value={status}>{label(status)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading findings…
        </div>
      ) : rows.length === 0 ? (
        <Card className="py-16 text-center text-sm text-muted-foreground">
          Nothing tracked yet. Use “Import from audit” to load the {parsed.length} findings documented in GAPS_AUDIT.md.
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((row) => (
            <Card key={row.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.title}</span>
                    <Badge variant="outline">{CATEGORY_LABELS[row.category]}</Badge>
                    <Badge className={STATUS_TONE[row.status] ?? ""}>{label(row.status)}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.section}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={row.priority}
                    onValueChange={(priority) => updateRow.mutate({ id: row.id, patch: { priority } })}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>{label(priority)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={row.status}
                    onValueChange={(status) => updateRow.mutate({ id: row.id, patch: { status } })}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>{label(status)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Route: </span>
                    <span className="font-mono">{row.route ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Calling component: </span>
                    <span className="font-mono">{row.component ?? "—"}</span>
                  </div>
                  {row.observed_behavior && (
                    <p className="pt-1 text-muted-foreground">{row.observed_behavior}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Input
                    className="h-8 text-xs"
                    defaultValue={row.owner ?? ""}
                    placeholder="Owner (name or email)"
                    onBlur={(event) => {
                      const owner = event.target.value.trim() || null;
                      if (owner !== (row.owner ?? null)) updateRow.mutate({ id: row.id, patch: { owner } });
                    }}
                  />
                  <Textarea
                    className="min-h-16 text-xs"
                    defaultValue={row.verification_notes ?? ""}
                    placeholder="Verification notes — how this was checked and the result"
                    onBlur={(event) => {
                      const notes = event.target.value.trim() || null;
                      if (notes !== (row.verification_notes ?? null))
                        updateRow.mutate({ id: row.id, patch: { verification_notes: notes } });
                    }}
                  />
                </div>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card className="py-12 text-center text-sm text-muted-foreground">No findings match these filters.</Card>
          )}
        </div>
      )}
    </div>
  );
}
