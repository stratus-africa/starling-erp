import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Summary = {
  orderTotal?: number;
  fulfillmentPercent?: number;
  invoicedAmount?: number;
  paidAmount?: number;
  outstandingAmount?: number;
  currency?: string;
};
export function SalesFinancialSummary({ summary }: { summary: Summary }) {
  const currency = summary.currency ?? "KES";
  const items = [
    ["Order Value", money(summary.orderTotal, currency)],
    ["Fulfillment", `${Number(summary.fulfillmentPercent ?? 0).toFixed(0)}%`],
    ["Invoiced", money(summary.invoicedAmount, currency)],
    ["Paid", money(summary.paidAmount, currency)],
    ["Outstanding", money(summary.outstandingAmount, currency)],
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Financial Summary</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {items.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono text-sm font-semibold">{value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
function money(value: number | undefined, currency: string) {
  return `${currency} ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
