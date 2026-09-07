import { Badge } from "@/components/ui/badge";

export function AgingBadge({
  dueDate,
  balance = 0,
}: {
  dueDate?: string | null;
  balance?: number;
}) {
  if (!dueDate || balance <= 0) return <Badge variant="outline">Current</Badge>;
  const days = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
  if (days <= 0) return <Badge variant="outline">Current</Badge>;
  return <Badge variant={days > 90 ? "destructive" : "secondary"}>{days} days overdue</Badge>;
}
