import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useSalesSettings } from "@/hooks/use-sales-settings";

export const Route = createFileRoute("/_authenticated/settings/sales")({
  head: () => ({ meta: [{ title: "Sales Settings — Settings" }] }),
  component: SalesSettingsPage,
});

function SalesSettingsPage() {
  const { salespersonRequired, setSalespersonRequired, isLoading } = useSalesSettings();
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Sales Settings</h1>
        <p className="text-sm text-muted-foreground">Control how quotes, sales orders and invoices are filled in.</p>
      </div>
      <Card className="divide-y p-0">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="text-sm font-medium">Salesperson is mandatory</div>
            <div className="text-xs text-muted-foreground">
              When on, quotes, sales orders and invoices cannot be saved without a salesperson. When off, the field is optional.
            </div>
          </div>
          <Switch
            checked={salespersonRequired}
            disabled={isLoading || setSalespersonRequired.isPending}
            onCheckedChange={(v) => setSalespersonRequired.mutate(v)}
          />
        </div>
      </Card>
    </div>
  );
}
