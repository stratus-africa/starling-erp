import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, LogIn } from "lucide-react";
import { toast } from "sonner";

function TenantsPage() {
  const { tenant, switchTenant } = useAuth();
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["admin", "tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants")
        .select("*").is("deleted_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 text-slate-100">
          <Building2 className="h-5 w-5" /> Tenants
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">Every workspace on the platform. Switch in to inspect their data under RLS.</p>
      </div>
      <Card className="p-0 overflow-hidden bg-slate-900 border-slate-800 text-slate-100">
        <Table>
          <TableHeader><TableRow className="bg-slate-800/40 border-slate-800">
            <TableHead className="text-slate-300">Name</TableHead>
            <TableHead className="text-slate-300">Slug</TableHead>
            <TableHead className="text-slate-300">Currency</TableHead>
            <TableHead className="text-slate-300">Status</TableHead>
            <TableHead className="text-slate-300">Created</TableHead>
            <TableHead className="w-32" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-slate-400">Loading…</TableCell></TableRow>}
            {tenants.map((t: any) => (
              <TableRow key={t.id} className="border-slate-800 hover:bg-slate-800/30">
                <TableCell className="font-medium">{t.name} {tenant?.id === t.id && <Badge className="ml-1 bg-amber-500/20 text-amber-300 border-amber-500/40">Active</Badge>}</TableCell>
                <TableCell className="font-mono text-xs text-slate-400">{t.slug}</TableCell>
                <TableCell>{t.currency ?? "USD"}</TableCell>
                <TableCell><Badge variant="secondary" className="bg-slate-800 text-slate-200 border-slate-700">{t.status ?? "Active"}</Badge></TableCell>
                <TableCell className="text-xs text-slate-500">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" className="border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-slate-100"
                    disabled={tenant?.id === t.id}
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

export const Route = createFileRoute("/_admin/tenants")({ component: TenantsPage });
