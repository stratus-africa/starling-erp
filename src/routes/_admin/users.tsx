import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users } from "lucide-react";

function PlatformUsersPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "platform-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: roles } = await supabase.from("user_roles").select("*");
      const { data: tenants } = await supabase.from("tenants").select("id,name");
      const rolesByUser = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesByUser.set(r.user_id, arr);
      });
      const tenantById = new Map((tenants ?? []).map((t: any) => [t.id, t.name]));
      return (profiles ?? []).map((p: any) => ({ ...p, roles: rolesByUser.get(p.id) ?? [], tenant_name: tenantById.get(p.tenant_id) }));
    },
  });

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 text-slate-100">
          <Users className="h-5 w-5" /> Platform Users
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">Every user across every tenant.</p>
      </div>
      <Card className="p-0 overflow-hidden bg-slate-900 border-slate-800 text-slate-100">
        <Table>
          <TableHeader><TableRow className="bg-slate-800/40 border-slate-800">
            <TableHead className="text-slate-300">Name</TableHead>
            <TableHead className="text-slate-300">Email</TableHead>
            <TableHead className="text-slate-300">Tenant</TableHead>
            <TableHead className="text-slate-300">Roles</TableHead>
            <TableHead className="text-slate-300">Created</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-slate-400">Loading…</TableCell></TableRow>}
            {data.map((u: any) => (
              <TableRow key={u.id} className="border-slate-800 hover:bg-slate-800/30">
                <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                <TableCell className="text-slate-300">{u.email}</TableCell>
                <TableCell className="text-slate-400">{u.tenant_name ?? "—"}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{u.roles.map((r: string) => <Badge key={r} className="bg-slate-800 text-slate-200 border-slate-700 text-[10px]">{r}</Badge>)}</div></TableCell>
                <TableCell className="text-xs text-slate-500">{new Date(u.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_admin/users")({ component: PlatformUsersPage });
