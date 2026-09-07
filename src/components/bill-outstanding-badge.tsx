import { Badge } from "@/components/ui/badge";

export function BillOutstandingBadge({ outstanding, currency = "KES" }: { outstanding: number; currency?: string }) {
  return <Badge variant={outstanding > 0 ? "outline" : "secondary"}>{currency} {outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} outstanding</Badge>;
}