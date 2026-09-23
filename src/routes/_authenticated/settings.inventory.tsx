import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { INVENTORY_MODULES, useInventoryModules } from "@/hooks/use-inventory-modules";

export const Route = createFileRoute("/_authenticated/settings/inventory")({
  head: () => ({ meta: [{ title: "Inventory Features — Settings" }] }),
  component: InventorySettingsPage,
});

function InventorySettingsPage() {
  const { isEnabled, setEnabled, isLoading } = useInventoryModules();
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Inventory Features</h1>
        <p className="text-sm text-muted-foreground">Turn optional inventory features on or off for this workspace.</p>
      </div>
      <Card className="divide-y p-0">
        {INVENTORY_MODULES.map((m) => (
          <div key={m.key} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <div className="text-sm font-medium">{m.title}</div>
              <div className="text-xs text-muted-foreground">{m.description}</div>
            </div>
            <Switch
              checked={isEnabled(m.key)}
              disabled={isLoading || setEnabled.isPending}
              onCheckedChange={(v) => setEnabled.mutate({ key: m.key, value: v })}
            />
          </div>
        ))}
      </Card>
    </div>
  );
}
