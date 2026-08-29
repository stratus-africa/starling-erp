import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, ChevronRight, Loader2, LogIn, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StatusBadge, dateFmt } from "@/components/super-admin/tenant-shared";

export const Route = createFileRoute("/super-admin/tenants")({ component: TenantsPage });

type TenantListRow = {
  id: string;
  name: string;
  slug: string;
  currency: string | null;
  status: string | null;
  created_at: string;
  user_count: number;
  plan_name: string | null;
  plan_code: string | null;
};

const STATUSES = ["all", "trial", "active", "past_due", "suspended", "cancelled"] as const;

function TenantsPage() {
  return (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.tenantsView}>
      <TenantsContent />
    </PermissionGuard>
  );
}

function TenantsContent() {
  const { canPlatform, beginSupportSession, refresh } = usePlatformAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");

  const {
    data: tenants = [],
    isLoading,
    isError,
    error,
  } = useQuery<TenantListRow[]>({
    queryKey: ["super_admin_tenants", search, status],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_platform_tenants", {
        _search: search.trim() || null,
        _status: status === "all" ? null : status,
      });
      if (error) throw error;
      return (data ?? []) as TenantListRow[];
    },
  });

  const countLabel = useMemo(() => `${tenants.length} tenant${tenants.length === 1 ? "" : "s"}`, [tenants.length]);

  const handleImpersonate = async (tenant: TenantListRow) => {
    try {
      await beginSupportSession(tenant.id, `Support access to ${tenant.name} from Super Admin tenant console`, 120);
      await refresh();
      toast.success(`Support session started for ${tenant.name}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start support session");
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Tenants
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage every business workspace on the NimbusERP platform.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Search name or slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="h-9 w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "all" ? "All statuses" : value.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">{countLabel}</div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-destructive text-sm">
                  {error instanceof Error ? error.message : "Unable to load tenants."}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && tenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  No tenants match the selected filters.
                </TableCell>
              </TableRow>
            )}
            {tenants.map((tenant) => (
              <TableRow key={tenant.id} className="group">
                <TableCell>
                  <Link
                    to="/super-admin/tenants/$id"
                    params={{ id: tenant.id }}
                    className="flex items-center gap-3 min-w-0"
                  >
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate group-hover:underline">{tenant.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground truncate">{tenant.slug}</div>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>{tenant.plan_name ?? "No plan"}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {tenant.user_count ?? 0}
                  </span>
                </TableCell>
                <TableCell>{tenant.currency ?? "USD"}</TableCell>
                <TableCell>
                  <StatusBadge status={tenant.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{dateFmt(tenant.created_at)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button asChild size="sm" variant="ghost" className="h-8 text-xs gap-1">
                      <Link to="/super-admin/tenants/$id" params={{ id: tenant.id }}>
                        Details <ChevronRight className="h-3 w-3" />
                      </Link>
                    </Button>
                    {canPlatform(PLATFORM_PERMISSIONS.supportImpersonate) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        onClick={() => handleImpersonate(tenant)}
                      >
                        <LogIn className="h-3 w-3" /> Support
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
