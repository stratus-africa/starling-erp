import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Doc = z.object({
  id: z.string(),
  number: z.string(),
  due_date: z.string().nullable(),
  grand_total: z.number(),
  balance_due: z.number(),
});

const Input = z.object({
  kind: z.enum(["received", "made"]),
  note: z.string().min(1).max(6000),
  party: z.string().max(200),
  currency: z.string().max(10),
  amount: z.number().nullable(),
  docs: z.array(Doc).max(200),
});

export type RemittanceSuggestion = {
  matches: { doc_id: string; amount: number; confidence: string; reason: string }[];
  discrepancies: string[];
  summary: string;
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["matches", "discrepancies", "summary"],
  properties: {
    summary: { type: "string" },
    discrepancies: { type: "array", items: { type: "string" } },
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["doc_id", "amount", "confidence", "reason"],
        properties: {
          doc_id: { type: "string" },
          amount: { type: "number" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string" },
        },
      },
    },
  },
};

export const suggestRemittanceMatches = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, error: "AI is not configured for this workspace." };
    const docLabel = data.kind === "received" ? "invoices" : "bills";

    const instructions = `You are an accounts ${data.kind === "received" ? "receivable" : "payable"} assistant. Given a payment remittance note and the list of open ${docLabel}, pick which ${docLabel} the payment covers and how much applies to each. Only use doc_id values from the list. Never apply more than a document's balance_due. Match by document numbers, amounts, dates and any hints in the note. Put anything that doesn't reconcile (short-payments, overpayments, unknown references, deductions like withholding tax or bank charges, totals that don't add up) in discrepancies as short plain sentences with figures. summary: one or two sentences. Keep reasons under 20 words.`;

    const input = `PARTY: ${data.party}\nCURRENCY: ${data.currency}\nPAYMENT AMOUNT ENTERED: ${data.amount ?? "(not entered)"}\n\nREMITTANCE NOTE:\n${data.note}\n\nOPEN ${docLabel.toUpperCase()}:\n${data.docs
      .map((d) => `- doc_id=${d.id} number=${d.number} due=${d.due_date ?? "-"} total=${d.grand_total} balance_due=${d.balance_due}`)
      .join("\n") || "(none)"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions,
        input,
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "remittance_match", strict: true, schema } },
      }),
    });

    if (!res.ok || !res.body) {
      const msg =
        res.status === 402 ? "AI credits are used up. Add credits in Settings → Plans & credits."
        : res.status === 429 ? "Too many requests right now. Please try again in a minute."
        : res.status === 403 ? "AI access is blocked for this workspace."
        : `The AI service returned an error (${res.status}).`;
      return { ok: false as const, error: msg };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", text = "";
    let failed: string | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        try {
          const ev = JSON.parse(p);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.failed" || ev.type === "error")
            failed = ev.response?.error?.message ?? ev.message ?? "Matching failed.";
        } catch { /* partial */ }
      }
    }
    if (failed) return { ok: false as const, error: failed };
    try {
      const parsed = JSON.parse(text) as RemittanceSuggestion;
      const byId = new Map(data.docs.map((d) => [d.id, d]));
      parsed.matches = parsed.matches
        .filter((m) => byId.has(m.doc_id))
        .map((m) => ({ ...m, amount: Math.max(0, Math.min(m.amount, byId.get(m.doc_id)!.balance_due)) }))
        .filter((m) => m.amount > 0);
      return { ok: true as const, result: parsed };
    } catch {
      return { ok: false as const, error: "The AI returned an unreadable answer. Try again with a clearer note." };
    }
  });
