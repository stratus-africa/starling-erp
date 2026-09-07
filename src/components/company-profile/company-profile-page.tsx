import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Building2,
  Mail,
  Percent,
  Globe2,
  Palette,
  FileText,
  Warehouse,
  History,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { Tenant } from "@/lib/db-types";

import { CompanyIdentityCard } from "./company-identity-card";
import { CompanyContactCard } from "./company-contact-card";
import { CompanyTaxCard } from "./company-tax-card";
import { CompanyLocalizationCard } from "./company-localization-card";
import { CompanyBrandingCard } from "./company-branding-card";
import { CompanyDocumentSettingsCard } from "./company-document-settings-card";
import { CompanyLocationsSummary } from "./company-locations-summary";
import { CompanyAuditHistory } from "./company-audit-history";
import { useTheme } from "@/components/theme-provider";

export function CompanyProfilePage() {
  const qc = useQueryClient();
  const { tenant, can, refresh } = useAuth();
  const { theme } = useTheme();
  const canUpdate = can("settings.company.update") || can("settings.roles");

  // Local draft state for public.tenants
  const [draft, setDraft] = useState<Partial<Tenant>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Local draft state for default document template
  const [templateDraft, setTemplateDraft] = useState<{
    id?: string;
    accent_color?: string;
    footer_text?: string;
    terms?: string;
    show_logo?: boolean;
  }>({});
  const [isTemplateDirty, setIsTemplateDirty] = useState(false);

  // 1. Fetch live Tenant record
  const {
    data: tenantData,
    isLoading: isTenantLoading,
    error: tenantError,
  } = useQuery({
    queryKey: ["company_profile", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      if (!tenant?.id) throw new Error("No active workspace context");
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenant.id)
        .single();
      if (error) throw error;
      return (data as unknown) as Tenant;
    },
  });

  // 2. Fetch default Document Template
  const { data: defaultTemplate, isLoading: isTemplateLoading } = useQuery({
    queryKey: ["document_templates", "default", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data, error } = await (supabase as any)
        .from("document_templates")
        .select("*")
        .eq("tenant_id", tenant.id)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("created_at")
        .limit(1);
      if (error) throw error;
      return (data?.[0] as any) ?? null;
    },
  });

  // Synchronize drafts when data loads
  useEffect(() => {
    if (tenantData) {
      setDraft(tenantData);
      setIsDirty(false);
    }
  }, [tenantData]);

  useEffect(() => {
    if (defaultTemplate) {
      setTemplateDraft({
        id: defaultTemplate.id,
        accent_color: defaultTemplate.accent_color || "#1E293B",
        footer_text: defaultTemplate.footer_text || "",
        terms: defaultTemplate.terms || "",
        show_logo: defaultTemplate.show_logo ?? true,
      });
      setIsTemplateDirty(false);
    }
  }, [defaultTemplate]);

  const handleDraftChange = (patch: Partial<Tenant>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  const handleTemplateDraftChange = (patch: Partial<typeof templateDraft>) => {
    setTemplateDraft((prev) => ({ ...prev, ...patch }));
    setIsTemplateDirty(true);
  };

  // 3. Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No active tenant");

      if (typeof window !== "undefined") {
        localStorage.setItem("erp-theme", theme);
      }

      // Validation
      if (!draft.name?.trim()) {
        throw new Error("Company name is required");
      }

      // Step A: Save public.tenants
      const tenantPayload = {
        name: draft.name.trim(),
        legal_name: draft.legal_name?.trim() || null,
        trading_name: draft.trading_name?.trim() || null,
        registration_number: draft.registration_number?.trim() || null,
        tax_id: draft.tax_id?.trim() || null,
        vat_number: draft.vat_number?.trim() || null,
        business_type: draft.business_type || null,
        industry: draft.industry || null,
        description: draft.description?.trim() || null,
        year_established: draft.year_established || null,
        email: draft.email?.trim() || null,
        phone: draft.phone?.trim() || null,
        website: draft.website?.trim() || null,
        address_line1: draft.address_line1?.trim() || null,
        address_line2: draft.address_line2?.trim() || null,
        city: draft.city?.trim() || null,
        state_province: draft.state_province?.trim() || null,
        postal_code: draft.postal_code?.trim() || null,
        country: draft.country?.trim() || "Kenya",
        currency: draft.currency || "KES",
        currency_symbol: draft.currency_symbol?.trim() || null,
        timezone: draft.timezone || "Africa/Nairobi",
        date_format: draft.date_format || "DD/MM/YYYY",
        number_format: draft.number_format || "1,234.56",
        fiscal_year_start: draft.fiscal_year_start || "01-01",
        fiscal_year_end: draft.fiscal_year_end || "12-31",
        tax_authority: draft.tax_authority || "KRA",
        tax_regime: draft.tax_regime || "standard",
        tax_inclusive_pricing: !!draft.tax_inclusive_pricing,
        logo_url: draft.logo_url || null,
        signature_url: draft.signature_url || null,
        stamp_url: draft.stamp_url || null,
        updated_at: new Date().toISOString(),
      };

      const { error: tErr } = await supabase
        .from("tenants")
        .update(tenantPayload as any)
        .eq("id", tenant.id);
      if (tErr) throw tErr;

      // Step B: Save or update document_templates default template
      if (templateDraft.id) {
        await (supabase as any)
          .from("document_templates")
          .update({
            accent_color: templateDraft.accent_color,
            footer_text: templateDraft.footer_text,
            terms: templateDraft.terms,
            show_logo: templateDraft.show_logo,
            logo_url: draft.logo_url,
            company_address: [
              draft.address_line1,
              draft.address_line2,
              [draft.city, draft.state_province].filter(Boolean).join(", "),
              draft.country,
              draft.tax_id ? `PIN: ${draft.tax_id}` : null,
            ].filter(Boolean).join("\n"),
            updated_at: new Date().toISOString(),
          })
          .eq("id", templateDraft.id);
      } else if (isTemplateDirty) {
        // Create new default template if none existed
        await (supabase as any).from("document_templates").insert({
          tenant_id: tenant.id,
          name: "Default Corporate Template",
          accent_color: templateDraft.accent_color || "#1E293B",
          footer_text: templateDraft.footer_text || null,
          terms: templateDraft.terms || null,
          show_logo: templateDraft.show_logo ?? true,
          logo_url: draft.logo_url,
          company_address: [draft.address_line1, draft.city, draft.country].filter(Boolean).join("\n"),
          is_default: true,
          applies_to: ["quote", "order", "invoice", "package", "credit_note", "shipment"],
        });
      }

      // Step C: Record audit event in public.business_events
      try {
        await supabase.rpc("record_business_event", {
          _action: "company_profile_update",
          _entity_type: "company",
          _entity_id: tenant.id,
          _old_values: { name: tenantData?.name, tax_id: tenantData?.tax_id },
          _new_values: { name: draft.name, tax_id: draft.tax_id },
          _metadata: { updated_fields: Object.keys(draft) },
        });
      } catch {
        // Audit recording non-blocking
      }
    },
    onSuccess: async () => {
      toast.success("Company profile saved successfully");
      setIsDirty(false);
      setIsTemplateDirty(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("erp-theme", theme);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["company_profile", tenant?.id] }),
        qc.invalidateQueries({ queryKey: ["document_templates"] }),
        qc.invalidateQueries({ queryKey: ["company_audit_events"] }),
        refresh(),
      ]);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save company profile");
    },
  });

  // Calculate completeness based on key fields
  const completeness = useMemo(() => {
    const fields = [
      { label: "Company Name", checked: !!draft.name?.trim() },
      { label: "Tax / PIN ID", checked: !!draft.tax_id?.trim() },
      { label: "Contact Email", checked: !!draft.email?.trim() },
      { label: "Phone Number", checked: !!draft.phone?.trim() },
      { label: "Physical Address", checked: !!draft.address_line1?.trim() },
      { label: "Company Logo", checked: !!draft.logo_url },
      { label: "Registration No", checked: !!draft.registration_number?.trim() },
      { label: "Base Currency", checked: !!draft.currency },
    ];
    const completedCount = fields.filter((f) => f.checked).length;
    const percentage = Math.round((completedCount / fields.length) * 100);
    return { fields, percentage, completedCount, total: fields.length };
  }, [draft]);

  if (isTenantLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span>Loading organization profile…</span>
        </div>
      </div>
    );
  }

  if (tenantError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Unable to load company profile</p>
            <p className="text-xs">{tenantError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  const hasAnyUnsaved = isDirty || isTemplateDirty;

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8 max-w-[1600px] mx-auto">
      {/* Header & Completeness Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Company Profile</h1>
              <p className="text-sm text-muted-foreground">
                Manage your organization's legal identity, contact details, regional compliance, and document branding.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Completeness Pill */}
          <div className="flex items-center gap-2.5 rounded-lg border bg-card px-3.5 py-1.5 shadow-xs">
            <div className="space-y-1 text-right">
              <div className="flex items-center justify-end gap-1.5 text-xs font-semibold">
                <span>Profile Completeness</span>
                <Badge variant={completeness.percentage === 100 ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                  {completeness.percentage}%
                </Badge>
              </div>
              <Progress value={completeness.percentage} className="h-1.5 w-32" />
            </div>
          </div>

          {canUpdate && (
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!hasAnyUnsaved || saveMutation.isPending}
              className="gap-2 shadow-xs"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {hasAnyUnsaved ? "Save Changes" : "Saved"}
            </Button>
          )}
        </div>
      </div>

      {/* Main Tabbed Workspace */}
      <Tabs defaultValue="identity" className="w-full space-y-6">
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1 bg-muted/60 border">
          <TabsTrigger value="identity" className="gap-2 py-2 px-3 text-xs md:text-sm">
            <Building2 className="h-4 w-4" /> Identity
          </TabsTrigger>
          <TabsTrigger value="contact" className="gap-2 py-2 px-3 text-xs md:text-sm">
            <Mail className="h-4 w-4" /> Contact & Address
          </TabsTrigger>
          <TabsTrigger value="tax" className="gap-2 py-2 px-3 text-xs md:text-sm">
            <Percent className="h-4 w-4" /> Tax & Compliance
          </TabsTrigger>
          <TabsTrigger value="localization" className="gap-2 py-2 px-3 text-xs md:text-sm">
            <Globe2 className="h-4 w-4" /> Regional & Currency
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-2 py-2 px-3 text-xs md:text-sm">
            <Palette className="h-4 w-4" /> Branding Assets
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2 py-2 px-3 text-xs md:text-sm">
            <FileText className="h-4 w-4" /> Document Templates
          </TabsTrigger>
          <TabsTrigger value="locations" className="gap-2 py-2 px-3 text-xs md:text-sm">
            <Warehouse className="h-4 w-4" /> Operating Facilities
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2 py-2 px-3 text-xs md:text-sm">
            <History className="h-4 w-4" /> Audit History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-4">
          <CompanyIdentityCard
            data={draft}
            onChange={handleDraftChange}
            disabled={!canUpdate || saveMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="contact" className="space-y-4">
          <CompanyContactCard
            data={draft}
            onChange={handleDraftChange}
            disabled={!canUpdate || saveMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="tax" className="space-y-4">
          <CompanyTaxCard
            data={draft}
            onChange={handleDraftChange}
            disabled={!canUpdate || saveMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="localization" className="space-y-4">
          <CompanyLocalizationCard
            data={draft}
            onChange={handleDraftChange}
            disabled={!canUpdate || saveMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="branding" className="space-y-4">
          <CompanyBrandingCard
            data={draft}
            onChange={handleDraftChange}
            tenantId={tenant?.id ?? ""}
            disabled={!canUpdate || saveMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <CompanyDocumentSettingsCard
            data={draft}
            templateData={templateDraft}
            onTemplateChange={handleTemplateDraftChange}
            disabled={!canUpdate || saveMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="locations" className="space-y-4">
          <CompanyLocationsSummary tenantId={tenant?.id ?? ""} />
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <CompanyAuditHistory tenantId={tenant?.id ?? ""} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
