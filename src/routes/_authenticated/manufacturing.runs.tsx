import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CheckCircle2, Factory } from "lucide-react";
import { toast } from "sonner";

function ProductionRunsPage() {
  const { tenant, can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can("manufacturing", "create") || can("manufacturing", "update");

  const { data, isLoading } = useQuery({
    queryKey: ["production_orders", "active"],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("production_orders")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .in("status", ["Planned", "In Progress"])
        .order("created_at", { ascending: false });
      if (error) throw error;

      const bomIds = [...new Set((orders ?? []).map((o: any) => o.bom_id).filter(Boolean))];
      const { data: boms } = bomIds.length
        ? await supabase.from("bom_headers").select("id,code,product_id").in("id", bomIds)
        : { data: [] as any[] };

      const productIds = [...new Set((boms ?? []).map((b: any) => b.product_id).filter(Boolean))];
      const { data: items } = productIds.length
        ? await supabase.from("items").select("id,name,sku").in("id", productIds)
        : { data: [] as any[] };

      const bomMap = new Map((boms ?? []).map((b: any) => [b.id, b]));
      const productMap = new Map((items ?? []).map((i: any) => [i.id, i]));

      return (orders ?? []).map((o: any) => ({
        ...o,
        bom: bomMap.get(o.bom_id),
        product: productMap.get(bomMap.get(o.bom_id)?.product_id),
      }));
    },
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("post_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production order completed");
      qc.invalidateQueries({ queryKey: ["production_orders"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to complete"),
  });

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Factory className="h-5 w-5" /> Production Runs
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Active manufacturing work orders on the shop floor.</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead className="text-xs">MO #</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Product</TableHead>
              <TableHead className="text-right text-xs">Qty</TableHead>
              <TableHead className="text-xs">BOM</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-right text-xs w-32">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (!data || data.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  No active production orders. Create one from the Production Orders page.
                </TableCell>
              </TableRow>
            )}
            {data?.map((o: any) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.number}</TableCell>
                <TableCell>{o.date ? new Date(o.date).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="font-medium">{o.product?.name ?? "—"}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{o.quantity}</TableCell>
                <TableCell className="font-mono text-xs">{o.bom?.code ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{o.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => complete.mutate(o.id)}
                      disabled={complete.isPending}
                    >
                      {complete.isPending && complete.variables === o.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      )}
                      Complete
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/manufacturing/runs")({
  component: ProductionRunsPage,
});
