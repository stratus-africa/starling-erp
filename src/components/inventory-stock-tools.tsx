import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, RefreshCw, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";

export function InventoryStockTools() {
  const { can } = useAuth();
  const [recalculating, setRecalculating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const recalculate = async () => {
    setRecalculating(true);
    try {
      const { data, error } = await supabase.rpc("recalculate_item_stock_projection", { _item_id: null });
      if (error) throw error;
      toast.success(`Stock projection recalculated for ${data ?? 0} item(s).`);
      await checkIntegrity();
    } catch (e: any) {
      toast.error(e?.message ?? "Unable to recalculate stock.");
    } finally {
      setRecalculating(false);
    }
  };

  const checkIntegrity = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.rpc("check_inventory_stock_integrity", { _item_id: null });
      if (error) throw error;
      setResults((data ?? []) as any[]);
      const invalid = (data ?? []).filter((r: any) => !r.is_valid).length;
      if (invalid === 0) toast.success("Stock integrity check passed.");
      else toast.warning(`${invalid} item(s) have a stock projection mismatch.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Unable to check stock integrity.");
    } finally {
      setChecking(false);
    }
  };

  if (!can("inventory.read")) return null;

  const invalidCount = results.filter((r) => !r.is_valid).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Stock Integrity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Stock movements are the source of truth. The item stock value is only a controlled performance projection.
        </p>
        <div className="flex flex-wrap gap-2">
          {can("inventory.update") && (
            <Button variant="outline" onClick={recalculate} disabled={recalculating}>
              {recalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Recalculate Stock
            </Button>
          )}
          <Button variant="outline" onClick={checkIntegrity} disabled={checking}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Stock Integrity Check
          </Button>
        </div>
        {results.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            {invalidCount === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span>{invalidCount === 0 ? "All item stock projections match the ledger." : `${invalidCount} mismatch(es) detected.`}</span>
            <Badge variant={invalidCount === 0 ? "secondary" : "destructive"}>{results.length} items checked</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
