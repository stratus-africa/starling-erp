import { Badge } from "@/components/ui/badge";

export function PaymentRemainingBadge({ remaining, currency = "KES" }: { remaining: number; currency?: string }) {
  return <Badge variant={remaining > 0 ? "outline" : "secondary"}>{currency} {remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} remaining</Badge>;
}