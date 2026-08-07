import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Mail } from "lucide-react";
import { sendDocumentEmail } from "@/lib/email.functions";
import { documentPdfBase64, type PdfDocInput } from "@/lib/document-pdf";

export function EmailDocumentDialog({
  open, onOpenChange, defaultTo, defaultSubject, defaultMessage, pdf,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultTo?: string | null;
  defaultSubject: string;
  defaultMessage: string;
  pdf: () => PdfDocInput;
}) {
  const [to, setTo] = useState(defaultTo ?? "");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);

  useEffect(() => { if (open) { setTo(defaultTo ?? ""); setSubject(defaultSubject); setMessage(defaultMessage); } }, [open, defaultTo, defaultSubject, defaultMessage]);

  const send = useServerFn(sendDocumentEmail);
  const mutation = useMutation({
    mutationFn: async () => {
      const input = pdf();
      const res = await send({
        data: {
          to,
          subject,
          message,
          filename: `${input.number || input.title}.pdf`,
          pdfBase64: documentPdfBase64(input),
        },
      });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: () => { toast.success("Email sent"); onOpenChange(false); },
    onError: (e: any) => toast.error(e.message ?? "Send failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email document</DialogTitle>
          <DialogDescription>The generated PDF is attached automatically.</DialogDescription>
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
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
