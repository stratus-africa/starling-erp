import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Loader2, LogIn, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/super-admin/tenants")({ component: TenantsPage });

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  suspended: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  archived:  "bg-muted text-muted-foreground",
};

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

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["super_admin_tenants"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenants").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = tenants.filter((t: any) =>
    !search.trim() ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase()),
  );

  const handleImpersonate = async (t: any) => {
    try {
      const reason = `Support access to ${t.name} from Super Admin console`;
      await beginSupportSession(t.id, reason, 120);
      await refresh();
      toast.success(`Now viewing ${t.name} — support session started`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start support session");
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Tenants
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All workspaces on the platform.
          </p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8 text-sm" placeholder="Search tenants…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              {canPlatform(PLATFORM_PERMISSIONS.supportImpersonate) && <TableHead className="w-28" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No tenants found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{t.slug}</TableCell>
                <TableCell>{t.currency ?? "USD"}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[t.status ?? "active"] ?? STATUS_BADGE.active}`}>
                    {t.status ?? "active"}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleDateString()}
                </TableCell>
                {canPlatform(PLATFORM_PERMISSIONS.supportImpersonate) && (
                  <TableCell>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => handleImpersonate(t)}>
                      <LogIn className="h-3 w-3" /> View
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
