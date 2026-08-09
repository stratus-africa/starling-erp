import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Palette, Plus, Save, Star, Trash2, Printer } from "lucide-react";
import { downloadDocumentPdf, type PdfBranding } from "@/lib/document-pdf";

const KINDS = [
  { key: "quote", label: "Quotes" },
  { key: "order", label: "Sales Orders" },
  { key: "invoice", label: "Invoices" },
  { key: "package", label: "Packages" },
  { key: "credit_note", label: "Credit Notes" },
  { key: "shipment", label: "Shipments" },
] as const;

const PRESETS = ["#1E293B", "#0F766E", "#B45309", "#7C3AED", "#BE123C", "#1D4ED8"];

function TemplatesPage() {
  const qc = useQueryClient();
  const { tenant, hasRole } = useAuth();
  const canWrite = hasRole(["tenant_admin", "super_admin"] as any);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["document_templates", "all", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates" as any)
        .select("*")
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const current = useMemo(
    () => templates.find((t: any) => t.id === selectedId) ?? templates[0] ?? null,
    [templates, selectedId],
  );

  useEffect(() => { if (current) setDraft({ ...current }); }, [current?.id, current?.updated_at]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name || "Untitled template",
        accent_color: draft.accent_color || "#1E293B",
        logo_url: draft.logo_url || null,
        show_logo: !!draft.show_logo,
        company_address: draft.company_address || null,
        footer_text: draft.footer_text || null,
        terms: draft.terms || null,
        applies_to: draft.applies_to ?? [],
        is_default: !!draft.is_default,
      };
      const { error } = await supabase.from("document_templates" as any).update(payload).eq("id", draft.id);
      if (error) throw error;
      if (payload.is_default) {
        await supabase.from("document_templates" as any).update({ is_default: false }).neq("id", draft.id);
      }
    },
    onSuccess: () => { toast.success("Template saved"); qc.invalidateQueries({ queryKey: ["document_templates"] }); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No workspace");
      const { data, error } = await supabase.from("document_templates" as any).insert({
        tenant_id: tenant.id,
        name: "New template",
        accent_color: "#1E293B",
        show_logo: true,
        applies_to: KINDS.map((k) => k.key),
        is_default: templates.length === 0,
      }).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: (id) => { setSelectedId(id); qc.invalidateQueries({ queryKey: ["document_templates"] }); },
    onError: (e: any) => toast.error(e.message ?? "Create failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("document_templates" as any).update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setSelectedId(null); qc.invalidateQueries({ queryKey: ["document_templates"] }); },
  });

  const branding: PdfBranding = {
    accentColor: draft?.accent_color ?? "#1E293B",
    logoUrl: draft?.logo_url ?? null,
    showLogo: draft?.show_logo ?? true,
    companyAddress: draft?.company_address ?? null,
    footerText: draft?.footer_text ?? null,
    terms: draft?.terms ?? null,
  };

  const preview = () => downloadDocumentPdf({
    title: "Invoice",
    number: "INV-PREVIEW",
    companyName: tenant?.name ?? "Company",
    partyLabel: "Customer",
    partyName: "Sample Customer Ltd",
    currency: "USD",
    meta: [{ label: "Date", value: new Date().toISOString().slice(0, 10) }, { label: "Status", value: "Draft" }],
    lines: [
      { description: "Consulting services", quantity: 10, unitPrice: 150, lineTotal: 1500 },
      { description: "Implementation support", quantity: 4, unitPrice: 250, lineTotal: 1000 },
    ],
    totals: { subtotal: 2500, discount: 0, tax: 400, grandTotal: 2900 },
    notes: "Thank you for your business.",
    branding,
  } as any);

  const toggleKind = (k: string) => {
    const list: string[] = draft.applies_to ?? [];
    setDraft({ ...draft, applies_to: list.includes(k) ? list.filter((x) => x !== k) : [...list, k] });
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Palette className="h-5 w-5" /> PDF Templates & Branding</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Logos, accent colours, address blocks and footer terms applied to your generated documents.</p>
        </div>
        {canWrite && <Button size="sm" onClick={() => create.mutate()}><Plus className="h-4 w-4 mr-1.5" /> New template</Button>}
      </div>

      {isLoading ? (
        <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : templates.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No templates yet — create one to start branding your documents.</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="p-2 h-fit">
            {templates.map((t: any) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2 ${current?.id === t.id ? "bg-muted" : "hover:bg-muted/50"}`}
              >
                <span className="h-4 w-4 rounded-sm border" style={{ background: t.accent_color }} />
                <span className="truncate text-sm flex-1">{t.name}</span>
                {t.is_default && <Star className="h-3.5 w-3.5 text-amber-500" />}
              </button>
            ))}
          </Card>

          {draft && (
            <div className="flex flex-col gap-4">
              <Card className="p-4 grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Template name</Label>
                  <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={!canWrite} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Logo URL</Label>
                  <Input value={draft.logo_url ?? ""} onChange={(e) => setDraft({ ...draft, logo_url: e.target.value })} placeholder="https://…" disabled={!canWrite} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Accent colour</Label>
                  <div className="flex items-center gap-2">
                    <Input type="color" className="w-14 p-1 h-9" value={draft.accent_color ?? "#1E293B"} onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })} disabled={!canWrite} />
                    <Input value={draft.accent_color ?? ""} onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })} disabled={!canWrite} />
                    <div className="flex gap-1">
                      {PRESETS.map((c) => (
                        <button key={c} className="h-6 w-6 rounded-sm border" style={{ background: c }} onClick={() => setDraft({ ...draft, accent_color: c })} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 pt-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={!!draft.show_logo} onCheckedChange={(v) => setDraft({ ...draft, show_logo: v })} disabled={!canWrite} /> Show logo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={!!draft.is_default} onCheckedChange={(v) => setDraft({ ...draft, is_default: v })} disabled={!canWrite} /> Default template
                  </label>
                </div>
                <div className="grid gap-1.5 md:col-span-2">
                  <Label>Company address block</Label>
                  <Textarea rows={3} value={draft.company_address ?? ""} onChange={(e) => setDraft({ ...draft, company_address: e.target.value })} disabled={!canWrite} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Footer text</Label>
                  <Textarea rows={2} value={draft.footer_text ?? ""} onChange={(e) => setDraft({ ...draft, footer_text: e.target.value })} disabled={!canWrite} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Terms & conditions</Label>
                  <Textarea rows={2} value={draft.terms ?? ""} onChange={(e) => setDraft({ ...draft, terms: e.target.value })} disabled={!canWrite} />
                </div>
                <div className="md:col-span-2 grid gap-1.5">
                  <Label>Applies to</Label>
                  <div className="flex flex-wrap gap-2">
                    {KINDS.map((k) => {
                      const on = (draft.applies_to ?? []).includes(k.key);
                      return (
                        <Badge key={k.key} variant={on ? "default" : "outline"} className="cursor-pointer" onClick={() => canWrite && toggleKind(k.key)}>
                          {k.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </Card>

              <Card className="p-0 overflow-hidden">
                <div className="px-4 py-2 border-b bg-muted/30 text-sm font-medium">Live preview</div>
                <div className="p-6">
                  <div className="mx-auto max-w-2xl border rounded-md overflow-hidden bg-background">
                    <div className="h-2" style={{ background: branding.accentColor ?? "#1E293B" }} />
                    <div className="p-6 flex items-start justify-between gap-6">
                      <div>
                        {branding.showLogo && branding.logoUrl ? (
                          <img src={branding.logoUrl} alt="Company logo preview" className="h-10 object-contain mb-2" />
                        ) : (
                          <div className="text-lg font-semibold" style={{ color: branding.accentColor ?? undefined }}>{tenant?.name ?? "Company"}</div>
                        )}
                        <div className="text-xs text-muted-foreground whitespace-pre-line mt-1">{branding.companyAddress || "Your company address block"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold uppercase tracking-wide" style={{ color: branding.accentColor ?? undefined }}>Invoice</div>
                        <div className="text-xs text-muted-foreground mt-1">INV-PREVIEW</div>
                      </div>
                    </div>
                    <div className="px-6">
                      <div className="text-xs uppercase tracking-wide" style={{ color: branding.accentColor ?? undefined }}>Bill To</div>
                      <div className="text-sm font-medium">Sample Customer Ltd</div>
                    </div>
                    <table className="w-full text-sm mt-4">
                      <thead>
                        <tr style={{ background: (branding.accentColor ?? "#1E293B") + "18" }}>
                          <th className="text-left px-6 py-2 font-medium">Description</th>
                          <th className="text-right px-6 py-2 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b"><td className="px-6 py-2">Consulting services</td><td className="px-6 py-2 text-right font-mono">1,500.00</td></tr>
                        <tr className="border-b"><td className="px-6 py-2">Implementation support</td><td className="px-6 py-2 text-right font-mono">1,000.00</td></tr>
                      </tbody>
                    </table>
                    <div className="px-6 py-3 flex justify-end text-sm font-semibold" style={{ color: branding.accentColor ?? undefined }}>Total 2,900.00</div>
                    {branding.terms && <div className="px-6 pb-2 text-xs text-muted-foreground whitespace-pre-line">{branding.terms}</div>}
                    <div className="px-6 py-3 border-t text-xs text-center text-muted-foreground">{branding.footerText || "Footer text appears here"}</div>
                  </div>
                </div>
              </Card>

              <div className="flex items-center justify-between">
                {canWrite && !draft.is_default ? (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove.mutate(draft.id)}><Trash2 className="h-4 w-4 mr-1.5" /> Delete</Button>
                ) : <span />}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={preview}><Printer className="h-4 w-4 mr-1.5" /> Download sample PDF</Button>
                  {canWrite && (
                    <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
                      {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save template
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings/templates")({ component: TemplatesPage });
