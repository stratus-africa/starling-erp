import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { db } from "@/lib/typed-db";
import { Card } from "@/components/ui/card";

export function SupplierStatementsReportIndexPage() {
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["reports", "supplier-statements", "suppliers"],
    queryFn: async () => {
      const { data, error } = await db.from("suppliers").select("id,name,code").is("deleted_at", null).order("name");
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });

  return (
    <div className="min-h-full bg-muted/20 p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Supplier Statements</h1>
          <p className="text-sm text-muted-foreground">Choose a supplier to view its database-driven statement.</p>
        </div>
        <Card className="divide-y">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading suppliers...</p>
          ) : suppliers.length ? (
            suppliers.map((supplier) => (
              <Link className="flex items-center justify-between p-4 hover:bg-muted/40" key={supplier.id} to="/reports/purchases/supplier-statements/$supplierId" params={{ supplierId: supplier.id }}>
                <span className="font-medium">{supplier.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{supplier.code ?? supplier.id}</span>
              </Link>
            ))
          ) : (
            <p className="p-6 text-sm text-muted-foreground">No suppliers found.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
