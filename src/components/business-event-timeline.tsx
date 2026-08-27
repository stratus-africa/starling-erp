import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getBusinessEvents, BUSINESS_EVENT_LABELS } from "@/lib/business-events";
import { Loader2, ShieldCheck } from "lucide-react";

const tone: Record<string, string> = {
  created: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  approved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  posted: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  voided: "bg-red-500/15 text-red-700 border-red-500/30",
  rejected: "bg-red-500/15 text-red-700 border-red-500/30",
  reconciled: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  received: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  applied: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
};

export function BusinessEventTimeline({ entityType, entityId }: { entityType?: string; entityId?: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["business-events", entityType, entityId],
    queryFn: () => getBusinessEvents({ limit: 100, entityType, entityId }),
  });
  return <Card className="p-4"><div className="flex items-center gap-2 mb-4"><ShieldCheck className="h-4 w-4" /><div><h3 className="font-semibold">Business Audit Trail</h3><p className="text-xs text-muted-foreground">Immutable business events and document history.</p></div></div>{isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading audit events…</div> : data.length === 0 ? <p className="text-sm text-muted-foreground py-6">No business events recorded.</p> : <div className="space-y-3">{data.map((event) => <div key={event.id} className="flex gap-3 border-b last:border-0 pb-3 last:pb-0"><div className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={tone[event.action] ?? ""}>{BUSINESS_EVENT_LABELS[event.action] ?? event.action}</Badge><span className="font-medium text-sm">{event.entity_type}</span>{event.entity_id && <span className="font-mono text-[10px] text-muted-foreground">{event.entity_id.slice(0, 8)}…</span>}</div><div className="text-xs text-muted-foreground mt-1">{event.actor_email ?? "System"} · {new Date(event.occurred_at).toLocaleString()}</div></div></div>)}</div>}</Card>;
}
