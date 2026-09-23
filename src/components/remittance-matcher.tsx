import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { suggestRemittanceMatches, type RemittanceSuggestion } from "@/lib/remittance-match.functions";

type Doc = { id: string; number: string; due_date: string | null; grand_total: number; balance_due: number };

export function RemittanceMatcher({
  kind, party, currency, amount, docs, onApply,
}: {
  kind: "received" | "made";
  party: string;
  currency: string;
  amount: number | null;
  docs: Doc[];
  onApply: (matches: { doc_id: string; amount: number }[]) => void;
}) {
  const run = useServerFn(suggestRemittanceMatches);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RemittanceSuggestion | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const label = kind === "received" ? "invoice" : "bill";
  const num = (id: string) => docs.find((d) => d.id === id)?.number ?? id;

  const go = async () => {
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await run({ data: { kind, note, party, currency, amount, docs } });
      if (r.ok) setRes(r.result); else setErr(r.error);
    } catch (e: any) {
      setErr(e?.message ?? "Matching failed.");
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
      <Label className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Match from remittance note</Label>
      <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder={`Paste the remittance advice, e.g. "Paying ${label}s 00012 and 00015, less 2% withholding"`} />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={busy || !note.trim() || docs.length === 0} onClick={go}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
          Suggest matches
        </Button>
        {docs.length === 0 && <span className="text-xs text-muted-foreground">No open {label}s to match.</span>}
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {res && (
        <div className="grid gap-2 text-sm">
          <p>{res.summary}</p>
          {res.matches.length > 0 ? (
            <ul className="grid gap-1">
              {res.matches.map((m) => (
                <li key={m.doc_id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{num(m.doc_id)}</span>
                  <span>{currency} {m.amount.toFixed(2)}</span>
                  <Badge variant="outline">{m.confidence}</Badge>
                  <span className="text-muted-foreground">{m.reason}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted-foreground">No matching {label}s found.</p>}
          {res.discrepancies.length > 0 && (
            <div className="rounded border border-destructive/30 bg-destructive/5 p-2">
              <p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Discrepancies</p>
              <ul className="list-disc pl-5">{res.discrepancies.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}
          {res.matches.length > 0 && (
            <Button type="button" size="sm" className="w-fit" onClick={() => { onApply(res.matches); toast.success("Suggested amounts applied — review before recording."); }}>
              Apply suggestions
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
