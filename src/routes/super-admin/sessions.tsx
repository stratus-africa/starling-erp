/**
 * Super Admin � Sessions
 * Route: /super-admin/sessions
 *
 * Active authentication sessions across the platform,
 * via the admin_get_sessions() SECURITY DEFINER RPC.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Monitor, RefreshCw, Loader2, AlertCircle, Search, ShieldOff, Activity,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/sessions")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.securityView}>
      <SessionsPage />
    </PermissionGuard>
  ),
});

interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  factor_id: string | null;
  aal: string | null;
  not_after: string | null;
}

const timeFmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "�";

function SessionsPage() {
  const { canPlatform } = usePlatformAuth();
  const qc = useQueryClient();
  const canRevoke = canPlatform("platform.security.view");

  const [search, setSearch] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<SessionRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: ["platform_sessions", refreshKey],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_get_sessions", { _limit: 300 });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (session: SessionRow) => {
      const { error } = await (supabase as any).rpc("admin_revoke_session", {
        _session_id: session.id,
        _reason: "Revoked by platform admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Session revoked");
      setRevokeTarget(null);
      qc.invalidateQueries({ queryKey: ["platform_sessions"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = sessions.filter(
    (s) =>
      !search ||
      s.id.includes(search) ||
      s.user_id.includes(search),
  );

  const now = Date.now();
  const isExpired = (s: SessionRow) => s.not_after && new Date(s.not_after).getTime() < now;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Active Sessions</h1>
          <p className="text-sm text-muted-foreground">Authentication sessions across the platform.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="text-xs">
          <Activity className="h-3 w-3 mr-1" />
          {sessions.length} sessions loaded
        </Badge>
        <Badge variant="outline" className="text-xs text-emerald-700 bg-emerald-500/10 border-emerald-500/20">
          {sessions.filter((s) => !isExpired(s)).length} active
        </Badge>
        <Badge variant="outline" className="text-xs text-muted-foreground">
          {sessions.filter((s) => isExpired(s)).length} expired
        </Badge>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter by session or user ID..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground max-w-sm">{(error as Error).message}</p>
          <p className="text-xs text-muted-foreground">
            Run migration <code className="font-mono text-xs">20260910400000_platform_sessions_rpc.sql</code> if the RPC does not exist.
          </p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session ID</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>AAL</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                    <Monitor className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No sessions found.
                  </TableCell>
                </TableRow>
              ) : filtered.map((s) => (
                <TableRow key={s.id} className={isExpired(s) ? "opacity-40" : ""}>
                  <TableCell className="font-mono text-xs">{s.id.slice(0, 8)}�</TableCell>
                  <TableCell className="font-mono text-xs">{s.user_id.slice(0, 8)}�</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{s.aal ?? "aal1"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{timeFmt(s.created_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{timeFmt(s.updated_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{timeFmt(s.not_after)}</TableCell>
                  <TableCell>
                    {isExpired(s)
                      ? <Badge variant="outline" className="text-xs text-muted-foreground">Expired</Badge>
                      : <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-500/20">Active</Badge>}
                  </TableCell>
                  <TableCell>
                    {canRevoke && !isExpired(s) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRevokeTarget(s)}
                      >
                        <ShieldOff className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Revoke Confirm */}
      <Dialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke Session?</DialogTitle>
            <DialogDescription>
              This will immediately terminate the session for user <code className="font-mono text-xs">{revokeTarget?.user_id.slice(0, 8)}�</code>.
              They will be signed out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget)}
            >
              {revokeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Revoke Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
