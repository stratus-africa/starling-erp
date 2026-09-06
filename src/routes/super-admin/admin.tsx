/**
 * Super Admin � Platform Admins
 * Route: /super-admin/admin
 *
 * Full CRUD on platform_admins:
 *   - List all admins (active and revoked)
 *   - Grant new admin access (user lookup + role select)
 *   - Revoke admin access with reason
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS, PLATFORM_ROLE_LABELS } from "@/lib/platform-permissions";
import type { PlatformRole } from "@/lib/platform-permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Shield, Plus, RefreshCw, Loader2, AlertCircle, MoreHorizontal,
  ShieldOff, CheckCircle2, XCircle, User,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/admin")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.adminsView}>
      <AdminsPage />
    </PermissionGuard>
  ),
});

interface AdminRow {
  user_id: string;
  email: string;
  full_name: string | null;
  platform_role: string;
  is_active: boolean;
  granted_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  notes: string | null;
}

const ROLE_BADGE: Record<string, string> = {
  super_admin:    "bg-violet-500/10 text-violet-700 border-violet-500/20",
  billing_admin:  "bg-blue-500/10 text-blue-700 border-blue-500/20",
  support_admin:  "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  readonly_admin: "bg-slate-500/10 text-slate-700 border-slate-500/20",
};

const dateFmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "�";

function AdminsPage() {
  const { canPlatform, adminProfile } = usePlatformAuth();
  const qc = useQueryClient();
  const canManage = canPlatform("platform.admins.manage");

  const [grantDialog, setGrantDialog] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<AdminRow | null>(null);
  const [grantForm, setGrantForm] = useState({ email: "", role: "support_admin", notes: "" });
  const [revokeReason, setRevokeReason] = useState("");
  const [showRevoked, setShowRevoked] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: admins = [], isLoading, error } = useQuery({
    queryKey: ["platform_admins", refreshKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_admins")
        .select("*")
        .order("granted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminRow[];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["platform_roles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_roles")
        .select("name, description")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { name: string; description: string }[];
    },
  });

  const grantMutation = useMutation({
    mutationFn: async () => {
      // Look up user by email in profiles
      const { data: profileData, error: profileError } = await (supabase as any)
        .from("profiles")
        .select("id")
        .eq("email", grantForm.email)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profileData) throw new Error(`No user found with email: ${grantForm.email}`);

      const { error } = await (supabase as any).rpc("admin_grant_platform_access", {
        _user_id: profileData.id,
        _platform_role: grantForm.role,
        _notes: grantForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Platform admin access granted");
      setGrantDialog(false);
      setGrantForm({ email: "", role: "support_admin", notes: "" });
      qc.invalidateQueries({ queryKey: ["platform_admins"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      if (!revokeTarget) return;
      const { error } = await (supabase as any).rpc("admin_revoke_platform_access", {
        _user_id: revokeTarget.user_id,
        _reason: revokeReason || "Revoked by platform admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Admin access revoked");
      setRevokeTarget(null);
      setRevokeReason("");
      qc.invalidateQueries({ queryKey: ["platform_admins"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const visible = admins.filter((a) => showRevoked || a.is_active);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Admins</h1>
          <p className="text-sm text-muted-foreground">Grant and revoke platform administrator access.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowRevoked((v) => !v)}>
            {showRevoked ? <CheckCircle2 className="h-4 w-4 mr-1.5" /> : <XCircle className="h-4 w-4 mr-1.5" />}
            {showRevoked ? "Hide Revoked" : "Show Revoked"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setGrantDialog(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Grant Access
            </Button>
          )}
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="text-xs">{admins.filter((a) => a.is_active).length} active admins</Badge>
        {admins.filter((a) => !a.is_active).length > 0 && (
          <Badge variant="outline" className="text-xs text-muted-foreground">{admins.filter((a) => !a.is_active).length} revoked</Badge>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Granted</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Revoked</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No admins found.
                  </TableCell>
                </TableRow>
              ) : visible.map((admin) => (
                <TableRow key={admin.user_id} className={!admin.is_active ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{admin.full_name ?? admin.email}</div>
                        <div className="text-xs text-muted-foreground">{admin.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${ROLE_BADGE[admin.platform_role] ?? ""}`}>
                      {(PLATFORM_ROLE_LABELS as any)[admin.platform_role] ?? admin.platform_role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {admin.is_active
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{dateFmt(admin.granted_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{dateFmt(admin.last_seen_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{dateFmt(admin.revoked_at)}</TableCell>
                  <TableCell>
                    {canManage && admin.is_active && admin.user_id !== adminProfile?.userId && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-destructive" onClick={() => setRevokeTarget(admin)}>
                            <ShieldOff className="h-4 w-4 mr-2" />Revoke Access
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Grant Dialog */}
      <Dialog open={grantDialog} onOpenChange={(v) => !v && setGrantDialog(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Grant Admin Access</DialogTitle>
            <DialogDescription>The user must already have a NimbusERP account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>User Email</Label>
              <Input
                type="email"
                placeholder="admin@example.com"
                value={grantForm.email}
                onChange={(e) => setGrantForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={grantForm.role} onValueChange={(v) => setGrantForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {(PLATFORM_ROLE_LABELS as any)[r.name] ?? r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                placeholder="Reason for granting access..."
                value={grantForm.notes}
                onChange={(e) => setGrantForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantDialog(false)}>Cancel</Button>
            <Button
              disabled={grantMutation.isPending || !grantForm.email}
              onClick={() => grantMutation.mutate()}
            >
              {grantMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Grant Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Dialog */}
      <Dialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke Admin Access</DialogTitle>
            <DialogDescription>
              Revoke platform admin access for <strong>{revokeTarget?.email}</strong>. They will lose all admin permissions immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Reason (optional)</Label>
            <Textarea
              rows={2}
              placeholder="Reason for revoking access..."
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate()}>
              {revokeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Revoke Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
