import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PaymentProgress({
  total,
  paid,
  outstanding,
  currency = "KES",
}: {
  total: number;
  paid: number;
  outstanding: number;
  currency?: string;
}) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Payment Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-xs">
          <span>{percent.toFixed(0)}% paid</span>
          <span className="font-mono">
            {money(paid, currency)} / {money(total, currency)}
          </span>
        </div>
        <Progress value={percent} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Paid {money(paid, currency)}</span>
          <span>Outstanding {money(outstanding, currency)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
function money(value: number, currency: string) {
  return `${currency} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
