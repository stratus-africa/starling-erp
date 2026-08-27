import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getMyApprovalInbox, actOnApprovalRequest } from "@/lib/approval-workflow";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";

export function ApprovalInbox() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const inbox = useQuery({ queryKey: ["approval-inbox"], queryFn: getMyApprovalInbox, enabled: can("approvals.read") });
  const action = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) => actOnApprovalRequest(id, action, notes[id]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-inbox"] }),
  });

  if (!can("approvals.read")) return null;
  if (inbox.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading approvals…</CardContent></Card>;
  if (inbox.error) return <Card><CardContent className="p-6 text-sm text-destructive">{(inbox.error as Error).message}</CardContent></Card>;
  if (!inbox.data?.length) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No approval requests require your action.</CardContent></Card>;

  return (
    <div className="space-y-4">
      {inbox.data.map((item) => (
        <Card key={item.id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>{item.workflow_name}</span>
              <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Step {item.current_step}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm"><span className="font-medium">{item.step_name}</span> · {item.entity_type} · {item.entity_id}</div>
            {item.amount != null && <div className="text-sm font-medium">Amount: {item.amount.toLocaleString()}</div>}
            <Textarea value={notes[item.id] ?? ""} onChange={(e) => setNotes((v) => ({ ...v, [item.id]: e.target.value }))} placeholder="Optional approval note" />
            <div className="flex gap-2">
              {can("approvals.approve") && <Button onClick={() => action.mutate({ id: item.id, action: "approve" })} disabled={action.isPending}><Check className="mr-2 h-4 w-4" />Approve</Button>}
              {can("approvals.reject") && <Button variant="destructive" onClick={() => action.mutate({ id: item.id, action: "reject" })} disabled={action.isPending}><X className="mr-2 h-4 w-4" />Reject</Button>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
