import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().max(5000).default(""),
  filename: z.string().min(1).max(120),
  pdfBase64: z.string().min(1),
});

export const sendDocumentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, error: "Email is not configured yet. Add an email provider key to enable sending." };
    }
    const from = process.env["RESEND_FROM_EMAIL"] || "onboarding@resend.dev";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [data.to],
        subject: data.subject,
        text: data.message || data.subject,
        attachments: [{ filename: data.filename, content: data.pdfBase64 }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Email send failed", res.status, detail);
      return { ok: false as const, error: "Could not send the email. Please try again." };
    }
    return { ok: true as const };
  });
