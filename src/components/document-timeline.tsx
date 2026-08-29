import { Card } from "@/components/ui/card";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { useDocumentEvents } from "@/lib/document-events";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// ─── Per-status colour config ─────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { pill: string; badge: string; dot: string }> = {
  Draft: {
    pill: "border-slate-300/60 bg-slate-100 text-slate-600 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
  Sent: {
    pill: "border-blue-400/50 bg-blue-50 text-blue-700 dark:border-blue-600/50 dark:bg-blue-950/50 dark:text-blue-300",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  Accepted: {
    pill: "border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-950/50 dark:text-emerald-300",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  Rejected: {
    pill: "border-red-400/50 bg-red-50 text-red-700 dark:border-red-600/50 dark:bg-red-950/50 dark:text-red-300",
    badge: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    dot: "bg-red-500",
  },
  Expired: {
    pill: "border-orange-400/50 bg-orange-50 text-orange-700 dark:border-orange-600/50 dark:bg-orange-950/50 dark:text-orange-300",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  Confirmed: {
    pill: "border-blue-400/50 bg-blue-50 text-blue-700 dark:border-blue-600/50 dark:bg-blue-950/50 dark:text-blue-300",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  Posted: {
    pill: "border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-950/50 dark:text-emerald-300",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  Paid: {
    pill: "border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-950/50 dark:text-emerald-300",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  Delivered: {
    pill: "border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-950/50 dark:text-emerald-300",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  Completed: {
    pill: "border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-950/50 dark:text-emerald-300",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  Voided: {
    pill: "border-red-400/50 bg-red-50 text-red-700 dark:border-red-600/50 dark:bg-red-950/50 dark:text-red-300",
    badge: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    dot: "bg-red-500",
  },
  Cancelled: {
    pill: "border-red-400/50 bg-red-50 text-red-700 dark:border-red-600/50 dark:bg-red-950/50 dark:text-red-300",
    badge: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    dot: "bg-red-500",
  },
  Overdue: {
    pill: "border-orange-400/50 bg-orange-50 text-orange-700 dark:border-orange-600/50 dark:bg-orange-950/50 dark:text-orange-300",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  Processing: {
    pill: "border-blue-400/50 bg-blue-50 text-blue-700 dark:border-blue-600/50 dark:bg-blue-950/50 dark:text-blue-300",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  Packed: {
    pill: "border-blue-400/50 bg-blue-50 text-blue-700 dark:border-blue-600/50 dark:bg-blue-950/50 dark:text-blue-300",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  Shipped: {
    pill: "border-blue-400/50 bg-blue-50 text-blue-700 dark:border-blue-600/50 dark:bg-blue-950/50 dark:text-blue-300",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  Invoiced: {
    pill: "border-violet-400/50 bg-violet-50 text-violet-700 dark:border-violet-600/50 dark:bg-violet-950/50 dark:text-violet-300",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    dot: "bg-violet-500",
  },
};

function getColors(status: string) {
  return (
    STATUS_COLORS[status] ?? {
      pill: "border-slate-300/60 bg-slate-100 text-slate-600 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300",
      badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
      dot: "bg-slate-400",
    }
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

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
      {/* Header */}
      <div className="px-4 py-2 border-b bg-muted/30 text-sm font-medium flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" /> Status timeline
      </div>

      {/* Stage pills */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b">
        {stages.map((s, i) => {
          const done = reached.has(s) || (activeIdx >= 0 && i <= activeIdx);
          const colors = getColors(s);
          // Extract the text colour class from the pill string to colour the icon
          const iconColor = colors.dot.replace("bg-", "text-");
          return (
            <div key={s} className="flex items-center gap-1.5">
              <div
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  done ? colors.pill : "border-border text-muted-foreground"
                }`}
              >
                {done ? (
                  <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0" />
                )}
                {s}
              </div>
              {i < stages.length - 1 && <div className={`h-px w-4 shrink-0 ${done ? "bg-border" : "bg-border/40"}`} />}
            </div>
          );
        })}
      </div>

      {/* Event history */}
      {events.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground text-center">No status history recorded yet.</div>
      ) : (
        <ul className="divide-y">
          {events.map((e) => {
            const colors = getColors(e.status);
            return (
              <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                {/* Coloured dot */}
                <div className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${colors.badge}`}
                    >
                      {e.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {when(e.created_at)}
                      {e.actor_email ? ` · ${e.actor_email}` : ""}
                    </span>
                  </div>
                  {e.note && <div className="mt-0.5 text-xs text-muted-foreground">{e.note}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
