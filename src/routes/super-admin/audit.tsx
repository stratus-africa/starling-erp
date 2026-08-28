import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/super-admin/audit")({ component: AuditPage });

function AuditPage() {
  return (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.auditView}>
      <AuditContent />
    </PermissionGuard>
  );
}

const ACTION_BADGE: Record<string, string> = {
  "support.session.begin":  "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  "support.session.end":    "bg-muted text-muted-foreground",
  "tenant.suspended":       "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  "tenant.active":          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  "admin.access.granted":   "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  "admin.access.revoked":   "bg-destructive/10 text-destructive border-destructive/20",
};

function AuditContent() {
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["platform_audit_log"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc("get_platform_audit_log", { _limit: 200 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = data.filter((r: any) =>
    !search.trim() ||
    r.action?.toLowerCase().includes(search.toLowerCase()) ||
    r.actor_email?.toLowerCase().includes(search.toLowerCase()) ||
    r.target_label?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Platform Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Immutable record of all platform administrator actions.
          </p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8 text-sm" placeholder="Search actions…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center">
                <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                No audit events found.
              </TableCell></TableRow>
            )}
            {filtered.map((r: any) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDetail(r)}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-sm">{r.actor_email ?? "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${ACTION_BADGE[r.action] ?? "bg-muted text-muted-foreground"}`}>
                    {r.action}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.target_label ?? r.target_type ?? "—"}</TableCell>
                <TableCell>
                  {r.actor_role && (
                    <Badge variant="outline" className="text-[10px]">{r.actor_role}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Detail sheet */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Audit Event</SheetTitle>
            <SheetDescription>
              {detail?.action} · {detail && new Date(detail.created_at).toLocaleString()}
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="mt-4 space-y-3 px-4 pb-6">
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ["Actor",      detail.actor_email],
                  ["Role",       detail.actor_role],
                  ["Target",     detail.target_label ?? detail.target_type],
                  ["Target ID",  detail.target_id],
                  ["Session",    detail.support_session_id],
                  ["Tenant",     detail.acting_as_tenant_id],
                  ["IP",         detail.ip_address],
                ].map(([label, val]) => val && (
                  <div key={label}>
                    <p className="text-muted-foreground">{label}</p>
                    <p className="font-mono truncate">{val}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Detail</p>
                <pre className="text-[11px] bg-muted/40 rounded-md p-3 overflow-auto max-h-64 font-mono">
                  {JSON.stringify(detail.detail, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
