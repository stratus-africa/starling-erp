import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  quote: z.string().min(1).max(8000),
  context: z.string().max(4000),
  tone: z.enum(["friendly", "professional", "concise", "persuasive"]),
  channel: z.enum(["email", "whatsapp", "sms"]),
});

export const draftQuoteFollowUp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, error: "AI is not configured for this workspace." };

    const instructions = `You are a helpful B2B sales assistant. Write a personalized ${data.channel} follow-up message from a sales rep to a customer about a quote. Tone: ${data.tone}. ${
      data.channel === "email"
        ? "Start with a line 'Subject: ...' then a blank line, then the body. Keep under 180 words."
        : "Keep under 70 words, no subject line."
    } Reference concrete quote details (number, key items, total, validity) naturally. Use the customer context to personalize. End with a clear next step. Never invent discounts, prices or dates not provided. Output only the message.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions,
        input: `QUOTE DETAILS:\n${data.quote}\n\nCUSTOMER CONTEXT FROM REP:\n${data.context || "(none provided)"}`,
        stream: true,
        store: false,
        reasoning: { effort: "low" },
      }),
    });

    if (!res.ok || !res.body) {
      const msg =
        res.status === 402
          ? "AI credits are used up. Add credits in Settings → Plans & credits."
          : res.status === 429
            ? "Too many requests right now. Please try again in a minute."
            : res.status === 403
              ? "AI access is blocked for this workspace."
              : `The AI service returned an error (${res.status}).`;
      return { ok: false as const, error: msg };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let failed: string | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.failed" || ev.type === "error")
            failed = ev.response?.error?.message ?? ev.message ?? "Generation failed.";
        } catch {
          /* ignore partial */
        }
      }
    }
    if (failed) return { ok: false as const, error: failed };
    if (!text.trim()) return { ok: false as const, error: "The AI returned an empty draft. Try adding more context." };
    return { ok: true as const, text: text.trim() };
  });
