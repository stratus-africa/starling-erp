import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Warehouse, MapPin, ArrowUpRight, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  tenantId: string;
}

export function CompanyLocationsSummary({ tenantId }: Props) {
  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ["company_warehouses", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, code, name, location, status")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Operating Locations & Branches</CardTitle>
              <CardDescription>
                Physical distribution centers, fulfillment warehouses, and corporate facilities.
              </CardDescription>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/settings/warehouses">
              Manage Locations <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading facilities…
          </div>
        ) : warehouses.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
            <Warehouse className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No locations configured</p>
              <p className="text-xs text-muted-foreground">
                Set up your primary warehouse or head office branch to start tracking inventory by facility.
              </p>
            </div>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/settings/warehouses">
                <Plus className="h-3.5 w-3.5" /> Add Location
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {warehouses.map((wh) => (
              <div
                key={wh.id}
                className="flex flex-col justify-between rounded-lg border p-4 hover:border-primary/50 transition-colors bg-muted/10"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{wh.name}</span>
                    <Badge variant={wh.status === "Active" ? "default" : "secondary"} className="text-[10px]">
                      {wh.status ?? "Active"}
                    </Badge>
                  </div>
                  {wh.code && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Code: {wh.code}
                    </span>
                  )}
                  {wh.location && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{wh.location}</span>
                    </p>
                  )}
                </div>

                <div className="pt-3 flex justify-end">
                  <Link
                    to={`/settings/warehouses/${wh.id}` as any}
                    className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
                  >
                    View details <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
