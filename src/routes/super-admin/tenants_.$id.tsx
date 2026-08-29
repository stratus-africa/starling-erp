import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { StatusBadge, dateFmt, type Tenant, type TenantUser } from "@/components/super-admin/tenant-shared";

export const Route = createFileRoute("/super-admin/tenants_/$id")({ component: TenantDetailPage });

function TenantDetailPage() {
  return (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.tenantsView}>
      <TenantDetailContent />
    </PermissionGuard>
  );
}

function TenantDetailContent() {
  const { id } = Route.useParams();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["super_admin_tenant", id],
    queryFn: async () => {
      const { data: tenant, error: tErr } = await db
        .from("tenants")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (tErr) throw tErr;

      const { data: users, error: uErr } = await db
        .from("profiles")
        .select("id, email, full_name, created_at, updated_at")
        .eq("tenant_id", id)
        .order("created_at", { ascending: true });
      if (uErr) throw uErr;

      return {
        tenant: (tenant ?? null) as Tenant | null,
        users: (users ?? []) as unknown as TenantUser[],
      };
    },
  });

  if (isLoading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data?.tenant) {
    return (
      <div className="p-6 text-sm text-destructive">
        {isError ? (error instanceof Error ? error.message : "Unable to load tenant.") : "Tenant not found."}
      </div>
    );
  }

  const { tenant, users } = data;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost" className="h-8 gap-1 text-xs">
          <Link to="/super-admin/tenants">
            <ArrowLeft className="h-3 w-3" /> Tenants
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="h-11 w-11 rounded-lg bg-muted flex items-center justify-center">
          <Building2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{tenant.name}</h1>
          <p className="font-mono text-xs text-muted-foreground">{tenant.slug}</p>
        </div>
        <StatusBadge status={tenant.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Currency</div>
          <div className="mt-1 font-medium">{tenant.currency ?? "USD"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Created</div>
          <div className="mt-1 font-medium">{dateFmt(tenant.created_at)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Users</div>
          <div className="mt-1 font-medium">{users.length}</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  No users in this workspace yet.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{dateFmt(u.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
