import { Badge } from "@/components/ui/badge";

export function MatchVarianceBadge({ status }: { status: string }) { return <Badge variant={status === "Matched" ? "secondary" : status === "Within Tolerance" ? "outline" : "destructive"}>{status}</Badge>; }