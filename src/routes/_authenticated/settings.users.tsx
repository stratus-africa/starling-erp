import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, ShieldAlert, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

const ALL_ROLES: AppRole[] = [
  "tenant_admin",
  "sales",
  "purchasing",
  "inventory",
  "accounting",
  "manufacturing",
  "viewer",
];

function UsersPage() {
  const { can, tenant, roles } = useAuth();
  const allowed = can("settings.users");
  const isSuper = roles.includes("super_admin");
  const qc = useQueryClient();
  const [pending, setPending] = useState<Record<string, AppRole[]>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("viewer");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["tenant", tenant?.id, "users"],
    enabled: allowed && !!tenant?.id,
    queryFn: async () => {
      const [{ data: profiles }, { data: userRoles }] = await Promise.all([
        db.from("profiles").select("id,email,full_name,tenant_id").eq("tenant_id", tenant!.id),
        db.from("user_roles").select("user_id,role").eq("tenant_id", tenant!.id),
      ]);
      const byUser = new Map<string, AppRole[]>();
      (userRoles ?? []).forEach((r: any) => {
        const list = byUser.get(r.user_id) ?? [];
        list.push(r.role);
        byUser.set(r.user_id, list);
      });
      return (profiles ?? []).map((p: any) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  const save = useMutation({
    mutationFn: async ({ userId, newRoles }: { userId: string; newRoles: AppRole[] }) => {
      const { error } = await db.rpc("admin_set_user_roles", { target_user: userId, new_roles: newRoles });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success("Roles updated");
      setPending((p) => {
        const { [v.userId]: _, ...rest } = p;
        return rest;
      });
      qc.invalidateQueries({ queryKey: ["tenant", tenant?.id, "users"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("create_tenant_invitation", {
        _email: inviteEmail,
        _role: inviteRole,
        _expires_in_hours: 72,
      });
      if (error) throw error;
      return data?.[0] as { invitation_token: string; expires_at: string };
    },
    onSuccess: (result) => {
      setInviteLink(`${window.location.origin}/auth?invitation=${result.invitation_token}`);
      setInviteEmail("");
      toast.success("Invitation created");
    },
    onError: (e: any) => toast.error(e.message ?? "Invitation failed"),
  });

  const { data: custom } = useQuery({
    queryKey: ["tenant", tenant?.id, "custom-roles"],
    enabled: allowed && !!tenant?.id,
    queryFn: async () => {
      const [r, a] = await Promise.all([
        db.from("tenant_custom_roles").select("id,label").eq("tenant_id", tenant!.id).order("label"),
        db.from("tenant_user_custom_roles").select("user_id,role_id").eq("tenant_id", tenant!.id),
      ]);
      if (r.error) throw r.error;
      if (a.error) throw a.error;
      return { roles: (r.data ?? []) as { id: string; label: string }[], assigned: (a.data ?? []) as { user_id: string; role_id: string }[] };
    },
  });
  const customRoles = custom?.roles ?? [];
  const customFor = (userId: string) => (custom?.assigned ?? []).filter((x) => x.user_id === userId).map((x) => x.role_id);
  const saveCustom = useMutation({
    mutationFn: async ({ userId, roleIds }: { userId: string; roleIds: string[] }) => {
      const { error } = await db.rpc("set_user_custom_roles", { _user_id: userId, _role_ids: roleIds });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Custom roles updated"); qc.invalidateQueries({ queryKey: ["tenant", tenant?.id, "custom-roles"] }); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const rowsWithPending = useMemo(
    () => users.map((u: any) => ({ ...u, effective: pending[u.id] ?? u.roles })),
    [users, pending],
  );

  if (!allowed) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Admin access required.</p>
        </Card>
      </div>
    );
  }

  const toggleRole = (userId: string, current: AppRole[], role: AppRole) => {
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    setPending((p) => ({ ...p, [userId]: next }));
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Users className="h-5 w-5" /> Users & Roles
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Assign roles per user. Changes are enforced by Supabase RLS via{" "}
          <span className="font-mono text-xs">has_role()</span>.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus className="h-4 w-4" />
          <h2 className="font-medium">Invite a team member</h2>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <Input
            type="email"
            placeholder="employee@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="md:flex-1"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as AppRole)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            {ALL_ROLES.map((role) => <option key={role} value={role}>{role.replace("_", " ")}</option>)}
          </select>
          <Button disabled={!inviteEmail || invite.isPending} onClick={() => invite.mutate()}>
            {invite.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Create invitation
          </Button>
        </div>
        {inviteLink && (
          <p className="mt-3 break-all text-xs text-muted-foreground">
            Share this invitation link with the invited user: {inviteLink}
          </p>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead>User</TableHead>
              {ALL_ROLES.map((r) => (
                <TableHead key={r} className="text-center text-[10px] uppercase tracking-wider">
                  {r.replace("_", " ")}
                </TableHead>
              ))}
              {customRoles.map((r) => (
                <TableHead key={r.id} className="text-center text-[10px] uppercase tracking-wider text-primary">{r.label}</TableHead>
              ))}
              <TableHead className="w-24 text-right">Save</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={ALL_ROLES.length + customRoles.length + 2} className="text-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rowsWithPending.length === 0 && (
              <TableRow>
                <TableCell colSpan={ALL_ROLES.length + customRoles.length + 2} className="text-center py-8 text-sm text-muted-foreground">
                  No users in this tenant.
                </TableCell>
              </TableRow>
            )}
            {rowsWithPending.map((u: any) => {
              const dirty = !!pending[u.id];
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{u.full_name ?? u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                    {u.roles.includes("super_admin") && (
                      <Badge variant="secondary" className="mt-1 bg-primary/10 text-primary text-[10px]">
                        super admin
                      </Badge>
                    )}
                  </TableCell>
                  {ALL_ROLES.map((r) => (
                    <TableCell key={r} className="text-center">
                      <Checkbox
                        checked={u.effective.includes(r)}
                        onCheckedChange={() => toggleRole(u.id, u.effective, r)}
                      />
                    </TableCell>
                  ))}
                  {customRoles.map((r) => {
                    const current = customFor(u.id);
                    return (
                      <TableCell key={r.id} className="text-center">
                        <Checkbox
                          checked={current.includes(r.id)}
                          disabled={saveCustom.isPending}
                          onCheckedChange={(c) => saveCustom.mutate({ userId: u.id, roleIds: c ? [...current, r.id] : current.filter((x) => x !== r.id) })}
                        />
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      disabled={!dirty || save.isPending}
                      onClick={() => save.mutate({ userId: u.id, newRoles: u.effective })}
                    >
                      {save.isPending && save.variables?.userId === u.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {isSuper && (
        <p className="text-xs text-muted-foreground">
          You are a super admin. To manage users in another workspace, switch tenants from the top bar first.
        </p>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings/users")({ component: UsersPage });
