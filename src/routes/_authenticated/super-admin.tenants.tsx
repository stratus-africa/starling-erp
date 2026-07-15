import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, LogIn, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

function TenantsPage() {
  const { roles, tenant, switchTenant } = useAuth();
  const isSuper = roles.includes("super_admin");

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["super-admin", "tenants"],
    enabled: isSuper,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants")
        .select("*").is("deleted_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!isSuper) {
    return (
      <div className="p-6"><Card className="p-8 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Super admin access required.</p>
      </Card></div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Building2 className="h-5 w-5" /> Tenants
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Every workspace on the platform. Switch in to see their data under RLS.</p>
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader><TableRow className="bg-muted/20">
            <TableHead>Name</TableHead><TableHead>Slug</TableHead>
            <TableHead>Currency</TableHead><TableHead>Status</TableHead>
            <TableHead>Created</TableHead><TableHead className="w-32" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
            {tenants.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name} {tenant?.id === t.id && <Badge variant="secondary" className="ml-1">Active</Badge>}</TableCell>
                <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                <TableCell>{t.currency ?? "USD"}</TableCell>
                <TableCell><Badge variant="secondary">{t.status ?? "Active"}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" disabled={tenant?.id === t.id}
                    onClick={async () => { try { await switchTenant(t.id); toast.success(`Switched to ${t.name}`); } catch (e: any) { toast.error(e.message); } }}>
                    <LogIn className="h-3 w-3 mr-1" /> Switch in
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/super-admin/tenants")({ component: TenantsPage });
