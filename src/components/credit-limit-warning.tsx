import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function CreditLimitWarning({
  creditLimit,
  outstanding,
  orderValue,
  currency = "KES",
}: {
  creditLimit?: number | null;
  outstanding: number;
  orderValue: number;
  currency?: string;
}) {
  if (!creditLimit || outstanding + orderValue <= creditLimit) return null;
  const exceeded = outstanding + orderValue - creditLimit;
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex items-start gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div>
          <p className="text-sm font-semibold">
            Credit limit exceeded by {money(exceeded, currency)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Request approval before confirming this sales order.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
function money(value: number, currency: string) {
  return `${currency} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
