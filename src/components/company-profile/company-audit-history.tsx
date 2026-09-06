import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { History, Loader2, User, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface Props {
  tenantId: string;
}

export function CompanyAuditHistory({ tenantId }: Props) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["company_audit_events", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_events")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("entity_type", "company")
        .order("occurred_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg">Company Profile Activity Log</CardTitle>
            <CardDescription>
              Chronological ledger of changes made to corporate identity, tax numbers, and branding.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading audit history…
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
            No profile modifications recorded yet. All future updates will be logged here with timestamps and actor details.
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="flex items-start justify-between border-b pb-3 last:border-0 last:pb-0 gap-4"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold capitalize flex items-center gap-2">
                    <span>{evt.action.replaceAll("_", " ")}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {evt.actor_email ?? "System"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(evt.occurred_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                {evt.new_values && Object.keys(evt.new_values).length > 0 && (
                  <div className="text-[11px] font-mono text-muted-foreground max-w-xs truncate bg-muted/40 px-2 py-1 rounded">
                    {Object.keys(evt.new_values).slice(0, 3).join(", ")}
                    {Object.keys(evt.new_values).length > 3 ? "…" : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
