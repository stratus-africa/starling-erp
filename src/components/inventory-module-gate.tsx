import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { INVENTORY_MODULES, useInventoryModules } from "@/hooks/use-inventory-modules";

type ModuleKey = (typeof INVENTORY_MODULES)[number]["key"];

export function InventoryModuleGate({ moduleKey, children }: { moduleKey: ModuleKey; children: ReactNode }) {
  const { isEnabled, isLoading } = useInventoryModules();
  const mod = INVENTORY_MODULES.find((m) => m.key === moduleKey)!;
  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!isEnabled(moduleKey)) {
    return (
      <div className="flex justify-center p-6 md:p-12">
        <Card className="flex max-w-md flex-col items-center gap-3 p-8 text-center">
          <PowerOff className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{mod.title} is turned off</h1>
          <p className="text-sm text-muted-foreground">
            This feature is disabled for your workspace. An admin can turn it back on in Settings → Inventory Features.
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/inventory/items">Back to Items</Link></Button>
            <Button asChild size="sm"><Link to="/settings/inventory">Open settings</Link></Button>
          </div>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
