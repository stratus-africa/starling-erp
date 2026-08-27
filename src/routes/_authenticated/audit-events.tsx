import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getBusinessEvents, BUSINESS_EVENT_LABELS } from "@/lib/business-events";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2 } from "lucide-react";

function AuditEventsPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["business-events", "page"], queryFn: () => getBusinessEvents({ limit: 500 }) });
  return <div className="flex flex-col gap-4 p-4 md:p-6"><div><h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Business Audit Trail</h1><p className="text-sm text-muted-foreground mt-0.5">A chronological record of important ERP business events.</p></div><Card className="p-0 overflow-hidden">{isLoading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : data.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No business events recorded.</div> : <div className="divide-y">{data.map((event) => <div key={event.id} className="grid gap-1 px-4 py-3 md:grid-cols-[180px_120px_1fr_220px] md:items-center"><div className="text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleString()}</div><Badge variant="outline" className="w-fit">{BUSINESS_EVENT_LABELS[event.action] ?? event.action}</Badge><div className="min-w-0"><span className="font-medium">{event.entity_type}</span>{event.entity_id && <span className="ml-2 font-mono text-xs text-muted-foreground">{event.entity_id.slice(0, 8)}…</span>}</div><div className="truncate text-xs text-muted-foreground">{event.actor_email ?? "System"}</div></div>)}</div>}</Card></div>;
}
export const Route = createFileRoute("/_authenticated/audit-events")({ component: AuditEventsPage });
