import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
import { processEmailJob } from "@/lib/email.functions";

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export function EmailStatus({ entityType, entityId }: { entityType: string; entityId: string }) {
  const qc = useQueryClient();
  const { data: job } = useQuery({
    queryKey: ["email_jobs", entityType, entityId],
    enabled: !!entityId && entityId !== "new",
    refetchInterval: (q) => ((q.state.data as any)?.status === "sending" ? 3000 : false),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_jobs" as any)
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const run = useServerFn(processEmailJob);
  const retry = useMutation({
    mutationFn: async () => await run({ data: { jobId: job.id } }),
    onSuccess: (res: any) => {
      if (res?.ok) toast.success("Email sent");
      else toast.error(res?.error ?? "Retry failed");
      qc.invalidateQueries({ queryKey: ["email_jobs"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Retry failed"),
  });

  if (!job) return null;

  const map: Record<string, { label: string; icon: any; cls: string }> = {
    sent: { label: "Email sent", icon: CheckCircle2, cls: "text-primary" },
    queued: { label: "Email queued", icon: Clock, cls: "text-muted-foreground" },
    sending: { label: "Sending…", icon: Loader2, cls: "text-muted-foreground animate-spin" },
    failed: { label: "Email failed", icon: XCircle, cls: "text-destructive" },
  };
  const s = map[job.status] ?? map.queued;
  const Icon = s.icon;

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1.5 font-normal">
            <Icon className={`h-3.5 w-3.5 ${s.cls}`} />
            {s.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <div>To {job.to_email}</div>
            <div>{job.status === "sent" ? `Delivered ${when(job.sent_at)}` : `Attempt ${job.attempts}/${job.max_attempts}`}</div>
            {job.last_error && <div className="text-destructive max-w-56">{job.last_error}</div>}
          </div>
        </TooltipContent>
      </Tooltip>
      {job.status !== "sent" && (
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={retry.isPending} onClick={() => retry.mutate()}>
          <RefreshCw className={`h-3.5 w-3.5 ${retry.isPending ? "animate-spin" : ""}`} />
        </Button>
      )}
    </div>
  );
}
