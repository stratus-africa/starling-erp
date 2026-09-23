import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { draftQuoteFollowUp } from "@/lib/quote-followup.functions";

type Tone = "friendly" | "professional" | "concise" | "persuasive";
type Channel = "email" | "whatsapp" | "sms";

export function QuoteFollowUpDialog({
  open,
  onOpenChange,
  quoteSummary,
  customerEmail,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quoteSummary: string;
  customerEmail?: string | null;
}) {
  const draft = useServerFn(draftQuoteFollowUp);
  const [quote, setQuote] = useState(quoteSummary);
  const [context, setContext] = useState("");
  const [tone, setTone] = useState<Tone>("friendly");
  const [channel, setChannel] = useState<Channel>("email");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = (o: boolean) => {
    if (o) setQuote(quoteSummary);
    onOpenChange(o);
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await draft({ data: { quote, context, tone, channel } });
      if (r.ok) setResult(r.text);
      else setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft the message.");
    } finally {
      setLoading(false);
    }
  };

  const mailto = () => {
    const m = result.match(/^Subject:\s*(.+)\n+/i);
    const subject = m ? m[1] : "Following up on your quote";
    const body = m ? result.slice(m[0].length) : result;
    window.location.href = `mailto:${customerEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Draft follow-up with AI
          </DialogTitle>
          <DialogDescription>
            Review the quote details, add what you know about the customer, and generate a personalized message.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="grid gap-1.5">
              <Label>Quote details</Label>
              <Textarea rows={7} value={quote} onChange={(e) => setQuote(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Customer context</Label>
              <Textarea
                rows={4}
                placeholder="e.g. Met at trade show, worried about delivery lead time, decision by Friday…"
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>Tone</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="concise">Concise</SelectItem>
                    <SelectItem value="persuasive">Persuasive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Channel</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={run} disabled={loading || !quote.trim()}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {result ? "Regenerate" : "Generate draft"}
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Label>Draft message</Label>
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Textarea
              rows={16}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder={loading ? "Writing…" : "Your draft will appear here. You can edit it before sending."}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!result}
            onClick={() => {
              navigator.clipboard.writeText(result);
              toast.success("Copied to clipboard");
            }}
          >
            <Copy className="mr-1.5 h-4 w-4" /> Copy
          </Button>
          {channel === "email" && (
            <Button disabled={!result} onClick={mailto}>Open in email</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
