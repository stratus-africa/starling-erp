import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ALL_ROLES: AppRole[] = ["tenant_admin","sales","cashier","purchasing","inventory","accounting","manufacturing","viewer"];

function UsersPage() {
  const { hasRole, tenant, roles } = useAuth();
  const allowed = hasRole(["tenant_admin","super_admin"]);
  const isSuper = roles.includes("super_admin");
  const qc = useQueryClient();
  const [pending, setPending] = useState<Record<string, AppRole[]>>({});

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["tenant", tenant?.id, "users"],
    enabled: allowed && !!tenant?.id,
    queryFn: async () => {
      const [{ data: profiles }, { data: userRoles }] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name,tenant_id").eq("tenant_id", tenant!.id),
        supabase.from("user_roles").select("user_id,role").eq("tenant_id", tenant!.id),
      ]);
      const byUser = new Map<string, AppRole[]>();
      (userRoles ?? []).forEach((r: any) => {
        const list = byUser.get(r.user_id) ?? [];
        list.push(r.role); byUser.set(r.user_id, list);
      });
      return (profiles ?? []).map((p: any) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  const save = useMutation({
    mutationFn: async ({ userId, newRoles }: { userId: string; newRoles: AppRole[] }) => {
      const { error } = await supabase.rpc("admin_set_user_roles", { target_user: userId, new_roles: newRoles });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success("Roles updated");
      setPending((p) => { const { [v.userId]: _, ...rest } = p; return rest; });
      qc.invalidateQueries({ queryKey: ["tenant", tenant?.id, "users"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const rowsWithPending = useMemo(() => users.map((u: any) => ({ ...u, effective: pending[u.id] ?? u.roles })), [users, pending]);

  if (!allowed) {
    return (
      <div className="p-6"><Card className="p-8 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Admin access required.</p>
      </Card></div>
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
        <p className="text-sm text-muted-foreground mt-0.5">Assign roles per user. Changes are enforced by Supabase RLS via <span className="font-mono text-xs">has_role()</span>.</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader><TableRow className="bg-muted/20">
            <TableHead>User</TableHead>
            {ALL_ROLES.map((r) => <TableHead key={r} className="text-center text-[10px] uppercase tracking-wider">{r.replace("_"," ")}</TableHead>)}
            <TableHead className="w-24 text-right">Save</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={ALL_ROLES.length + 2} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>}
            {!isLoading && rowsWithPending.length === 0 && <TableRow><TableCell colSpan={ALL_ROLES.length + 2} className="text-center py-8 text-sm text-muted-foreground">No users in this tenant.</TableCell></TableRow>}
            {rowsWithPending.map((u: any) => {
              const dirty = !!pending[u.id];
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{u.full_name ?? u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                    {u.roles.includes("super_admin") && <Badge variant="secondary" className="mt-1 bg-primary/10 text-primary text-[10px]">super admin</Badge>}
                  </TableCell>
                  {ALL_ROLES.map((r) => (
                    <TableCell key={r} className="text-center">
                      <Checkbox checked={u.effective.includes(r)} onCheckedChange={() => toggleRole(u.id, u.effective, r)} />
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate({ userId: u.id, newRoles: u.effective })}>
                      {save.isPending && save.variables?.userId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {isSuper && <p className="text-xs text-muted-foreground">You are a super admin. To manage users in another workspace, switch tenants from the top bar first.</p>}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings/users")({ component: UsersPage });
