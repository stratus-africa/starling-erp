import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AllocationSummary({
  amount,
  allocated,
  unallocated,
  currency = "KES",
  status,
}: {
  amount: number;
  allocated: number;
  unallocated: number;
  currency?: string;
  status?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Allocation Summary</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3 text-sm">
        <Metric label="Received" value={amount} currency={currency} />
        <Metric label="Allocated" value={allocated} currency={currency} />
        <Metric label={status ?? "Unallocated"} value={unallocated} currency={currency} />
      </CardContent>
    </Card>
  );
}
function Metric({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono font-semibold">
        {currency}{" "}
        {Number(value).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </p>
    </div>
  );
}
