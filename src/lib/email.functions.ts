import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ jobId: z.string().uuid() });

/**
 * Processes a queued email job: sends the PDF via the mail provider and
 * records success/failure with retry accounting on the job row.
 */
export const processEmailJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: job, error } = await supabase
      .from("email_jobs" as any)
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error || !job) return { ok: false as const, status: "failed", error: "Email job not found" };

    const j = job as any;
    if (j.status === "sent") return { ok: true as const, status: "sent" };

    const attempts = Number(j.attempts ?? 0) + 1;
    await supabase.from("email_jobs" as any).update({ status: "sending", attempts }).eq("id", j.id);

    const fail = async (message: string) => {
      const exhausted = attempts >= Number(j.max_attempts ?? 3);
      await supabase
        .from("email_jobs" as any)
        .update({ status: exhausted ? "failed" : "queued", last_error: message })
        .eq("id", j.id);
      return { ok: false as const, status: exhausted ? "failed" : "queued", error: message };
    };

    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) return await fail("Email is not configured yet. Add an email provider key to enable sending.");
    const from = process.env["RESEND_FROM_EMAIL"] || "onboarding@resend.dev";

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [j.to_email],
          subject: j.subject,
          text: j.message || j.subject,
          ...(j.pdf_base64 ? { attachments: [{ filename: j.filename || "document.pdf", content: j.pdf_base64 }] } : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        console.error("Email send failed", res.status, detail);
        return await fail(`Provider rejected the message (${res.status}).`);
      }
    } catch (e) {
      console.error("Email send threw", e);
      return await fail("Could not reach the email provider.");
    }

    await supabase
      .from("email_jobs" as any)
      .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
      .eq("id", j.id);

    return { ok: true as const, status: "sent" };
  });
