import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, BarChart3, Loader2 } from "lucide-react";

export const Route = createFileRoute("/super-admin/usage")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <UsageDirectory />
    </PermissionGuard>
  ),
});

function UsageDirectory() {
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["super-admin", "usage"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_platform_tenants", {
        _search: null, _status: null, _plan_code: null, _limit: 500, _offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; user_count: number; plan_name: string | null; status: string | null }>;
    },
  });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-[1400px] mx-auto">
      <div><h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Platform Usage</h1><p className="text-sm text-muted-foreground mt-1">Tenant-level user and plan usage overview.</p></div>
      {isLoading && <Card className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></Card>}
      {isError && <Card className="p-6 flex items-center gap-3 text-destructive"><AlertCircle className="h-5 w-5" /><span>Unable to load usage data.</span><Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button></Card>}
      {!isLoading && !isError && data.length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground">No usage data is available.</Card>}
      {!isLoading && !isError && data.length > 0 && <Card className="overflow-hidden"><Table><TableHeader><TableRow><TableHead>Tenant</TableHead><TableHead>Status</TableHead><TableHead>Plan</TableHead><TableHead>Users</TableHead><TableHead className="text-right">Details</TableHead></TableRow></TableHeader><TableBody>{data.map((tenant) => <TableRow key={tenant.id}><TableCell className="font-medium">{tenant.name}</TableCell><TableCell>{tenant.status ?? "—"}</TableCell><TableCell>{tenant.plan_name ?? "—"}</TableCell><TableCell>{tenant.user_count ?? 0}</TableCell><TableCell className="text-right"><Button asChild variant="outline" size="sm"><Link to="/super-admin/tenants/$id" params={{ id: tenant.id }}>View tenant</Link></Button></TableCell></TableRow>)}</TableBody></Table></Card>}
    </div>
  );
}
