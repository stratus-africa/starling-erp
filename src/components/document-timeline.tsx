import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { useDocumentEvents } from "@/lib/document-events";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function DocumentTimeline({
  entityType,
  entityId,
  stages,
  currentStage,
}: {
  entityType: string;
  entityId: string;
  stages: string[];
  currentStage?: string | null;
}) {
  const { data: events = [] } = useDocumentEvents(entityType, entityId);
  const reached = new Set(events.map((e) => e.status));
  const activeIdx = currentStage ? stages.indexOf(currentStage) : -1;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-2 border-b bg-muted/30 text-sm font-medium flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" /> Status timeline
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b">
        {stages.map((s, i) => {
          const done = reached.has(s) || (activeIdx >= 0 && i <= activeIdx);
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${done ? "border-primary/40 bg-primary/10 text-foreground" : "text-muted-foreground"}`}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Circle className="h-3.5 w-3.5" />}
                {s}
              </div>
              {i < stages.length - 1 && <div className={`h-px w-6 ${done ? "bg-primary/40" : "bg-border"}`} />}
            </div>
          );
        })}
      </div>

      {events.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground text-center">No status history recorded yet.</div>
      ) : (
        <ul className="divide-y">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
              <Badge variant="secondary" className="mt-0.5">{e.status}</Badge>
              <div className="min-w-0 flex-1">
                <div className="text-sm">{e.note || `Marked as ${e.status}`}</div>
                <div className="text-xs text-muted-foreground">
                  {when(e.created_at)} {e.actor_email ? `· ${e.actor_email}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
