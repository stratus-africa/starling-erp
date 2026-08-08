import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Mail } from "lucide-react";
import { processEmailJob } from "@/lib/email.functions";
import { documentPdfBase64, type PdfDocInput } from "@/lib/document-pdf";
import { logDocumentEvent } from "@/lib/document-events";

export function EmailDocumentDialog({
  open, onOpenChange, defaultTo, defaultSubject, defaultMessage, pdf, entityType, entityId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultTo?: string | null;
  defaultSubject: string;
  defaultMessage: string;
  pdf: () => PdfDocInput;
  entityType: string;
  entityId: string;
}) {
  const [to, setTo] = useState(defaultTo ?? "");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const { tenant, user, profile } = useAuth();
  const qc = useQueryClient();

  useEffect(() => { if (open) { setTo(defaultTo ?? ""); setSubject(defaultSubject); setMessage(defaultMessage); } }, [open, defaultTo, defaultSubject, defaultMessage]);

  const send = useServerFn(processEmailJob);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No workspace");
      const input = pdf();
      const { data, error } = await supabase
        .from("email_jobs" as any)
        .insert({
          tenant_id: tenant.id,
          entity_type: entityType,
          entity_id: entityId,
          to_email: to,
          subject,
          message,
          filename: `${input.number || input.title}.pdf`,
          pdf_base64: documentPdfBase64(input),
          status: "queued",
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      await logDocumentEvent({
        tenantId: tenant.id,
        entityType,
        entityId,
        status: "Emailed",
        note: `Queued email to ${to}`,
        actorId: user?.id ?? null,
        actorEmail: profile?.email ?? null,
      });

      return await send({ data: { jobId: (data as any).id } });
    },
    onSuccess: (res) => {
      if (res?.ok) toast.success("Email sent");
      else if (res?.status === "queued") toast.warning(`Queued for retry — ${res.error}`);
      else toast.error(res?.error ?? "Send failed");
      qc.invalidateQueries({ queryKey: ["email_jobs"] });
      qc.invalidateQueries({ queryKey: ["document_events"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Send failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email document</DialogTitle>
          <DialogDescription>The PDF is attached and the message is queued with automatic retries.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>To</Label>
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" />
          </div>
          <div className="grid gap-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Message</Label>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!to || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />} Queue &amp; send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
