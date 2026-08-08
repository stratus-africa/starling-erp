import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { PdfBranding } from "@/lib/document-pdf";

export type DocTemplateKind = "quote" | "order" | "invoice" | "package" | "credit_note" | "shipment";

/** Returns the tenant's default PDF template mapped to branding options for the PDF builder. */
export function useDocumentBranding(kind: DocTemplateKind) {
  const { tenant } = useAuth();

  const { data } = useQuery({
    queryKey: ["document_templates", "default", tenant?.id, kind],
    enabled: !!tenant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates" as any)
        .select("*")
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return rows.find((t) => (t.applies_to ?? []).includes(kind)) ?? rows[0] ?? null;
    },
  });

  const branding: PdfBranding = {
    accentColor: data?.accent_color ?? "#1E293B",
    logoUrl: data?.logo_url ?? null,
    showLogo: data?.show_logo ?? true,
    companyAddress: data?.company_address ?? null,
    footerText: data?.footer_text ?? null,
    terms: data?.terms ?? null,
  };

  return { branding, template: data ?? null };
}
