import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Printer, Palette } from "lucide-react";
import { downloadDocumentPdf } from "@/lib/document-pdf";
import type { Tenant } from "@/lib/db-types";

const PRESET_ACCENTS = ["#1E293B", "#0F766E", "#0284C7", "#7C3AED", "#B45309", "#BE123C", "#15803D"];

interface Props {
  data: Partial<Tenant>;
  templateData: {
    accent_color?: string;
    footer_text?: string;
    terms?: string;
    show_logo?: boolean;
  };
  onTemplateChange: (patch: {
    accent_color?: string;
    footer_text?: string;
    terms?: string;
    show_logo?: boolean;
  }) => void;
  disabled?: boolean;
}

export function CompanyDocumentSettingsCard({ data, templateData, onTemplateChange, disabled }: Props) {
  const accentColor = templateData.accent_color ?? "#1E293B";
  const showLogo = templateData.show_logo ?? true;
  const footerText = templateData.footer_text ?? "Thank you for partnering with us.";
  const terms = templateData.terms ?? "Payment due within 30 days of invoice date. Goods remain company property until paid in full.";

  const companyAddressFormatted = useMemo(() => {
    const parts = [
      data.address_line1,
      data.address_line2,
      [data.city, data.state_province, data.postal_code].filter(Boolean).join(", "),
      data.country,
      data.email ? `Email: ${data.email}` : null,
      data.phone ? `Tel: ${data.phone}` : null,
      data.tax_id ? `PIN: ${data.tax_id}` : null,
    ].filter(Boolean);
    return parts.join("\n");
  }, [data]);

  const handleDownloadSample = () => {
    downloadDocumentPdf({
      title: "Tax Invoice",
      number: "INV-2026-0001",
      companyName: data.legal_name || data.name || "Company Name",
      partyLabel: "Bill To",
      partyName: "Apex Global Enterprises Ltd",
      currency: data.currency ?? "KES",
      meta: [
        { label: "Date", value: new Date().toISOString().slice(0, 10) },
        { label: "Due Date", value: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) },
        { label: "Tax ID / PIN", value: data.tax_id || "P051234567X" },
      ],
      lines: [
        { description: "Enterprise Cloud Subscription — Annual Tier", quantity: 1, unit_price: 120000, line_total: 120000 },
        { description: "Implementation & Systems Integration Support", quantity: 24, unit_price: 3500, line_total: 84000 },
        { description: "Dedicated Cloud Backup & Vault Storage", quantity: 1, unit_price: 16000, line_total: 16000 },
      ],
      totals: {
        subtotal: 220000,
        discount_total: 0,
        tax_total: 35200,
        grand_total: 255200,
      },
      notes: "Please transfer funds to the designated account within 30 days.",
      branding: {
        accentColor,
        logoUrl: showLogo ? data.logo_url : null,
        showLogo,
        companyAddress: companyAddressFormatted,
        footerText,
        terms,
      },
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      {/* Configuration Controls */}
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Document Styling & Layout</CardTitle>
                <CardDescription>
                  Configure the primary brand aesthetics applied to generated invoices, quotes, and delivery notes.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Brand Accent Colour</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  type="color"
                  className="w-14 p-1 h-9 cursor-pointer"
                  value={accentColor}
                  onChange={(e) => onTemplateChange({ accent_color: e.target.value })}
                  disabled={disabled}
                />
                <Input
                  value={accentColor}
                  onChange={(e) => onTemplateChange({ accent_color: e.target.value })}
                  className="w-32 font-mono text-xs uppercase"
                  disabled={disabled}
                />
                <div className="flex items-center gap-1.5">
                  {PRESET_ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="h-6 w-6 rounded-full border border-border/80 shadow-xs transition-transform hover:scale-110"
                      style={{ background: c }}
                      onClick={() => onTemplateChange({ accent_color: c })}
                      disabled={disabled}
                      aria-label={`Select color ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3.5 bg-muted/20">
              <div className="space-y-0.5">
                <Label htmlFor="doc-show-logo" className="text-sm font-medium">
                  Display Logo on Documents
                </Label>
                <p className="text-xs text-muted-foreground">
                  Include corporate header logo in generated PDFs.
                </p>
              </div>
              <Switch
                id="doc-show-logo"
                checked={showLogo}
                onCheckedChange={(checked) => onTemplateChange({ show_logo: checked })}
                disabled={disabled}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="doc-footer" className="text-xs font-semibold">
                Document Footer Notice
              </Label>
              <Textarea
                id="doc-footer"
                rows={2}
                value={footerText}
                onChange={(e) => onTemplateChange({ footer_text: e.target.value })}
                placeholder="Standard footer message printed at bottom of page (e.g. Registered in Kenya No. CPR/2021/12345)"
                disabled={disabled}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="doc-terms" className="text-xs font-semibold">
                Default Terms & Payment Instructions
              </Label>
              <Textarea
                id="doc-terms"
                rows={3}
                value={terms}
                onChange={(e) => onTemplateChange({ terms: e.target.value })}
                placeholder="Payment instructions, bank wire details, interest on late payment, or return policies."
                disabled={disabled}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Document Preview Panel */}
      <div className="space-y-4">
        <Card className="overflow-hidden border-2 shadow-sm">
          <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Eye className="h-4 w-4 text-primary" /> Live Document Preview
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleDownloadSample}
            >
              <Printer className="h-3.5 w-3.5" /> Download Sample PDF
            </Button>
          </div>

          <div className="p-4 bg-muted/30">
            {/* Mock PDF Sheet */}
            <div className="mx-auto w-full rounded border bg-background shadow-xs text-xs">
              {/* Colored Top Accent Bar */}
              <div className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />

              <div className="p-4 space-y-4">
                {/* Header Row */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {showLogo && data.logo_url ? (
                      <img
                        src={data.logo_url}
                        alt="Logo"
                        className="h-8 max-w-[140px] object-contain mb-1.5"
                      />
                    ) : (
                      <div
                        className="text-sm font-bold truncate max-w-[180px]"
                        style={{ color: accentColor }}
                      >
                        {data.name || "Company Name"}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground whitespace-pre-line leading-tight">
                      {companyAddressFormatted || "123 Business Way, Nairobi\nPIN: P051234567X"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className="text-base font-extrabold uppercase tracking-wide"
                      style={{ color: accentColor }}
                    >
                      TAX INVOICE
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">INV-2026-0001</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Date: {new Date().toISOString().slice(0, 10)}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Recipient */}
                <div>
                  <div className="text-[9px] uppercase font-semibold text-muted-foreground">BILL TO</div>
                  <div className="text-xs font-semibold">Apex Global Enterprises Ltd</div>
                  <div className="text-[10px] text-muted-foreground">Nairobi, Kenya</div>
                </div>

                {/* Mini Line Table */}
                <div className="rounded border overflow-hidden">
                  <div
                    className="flex justify-between px-2.5 py-1 text-[10px] font-semibold"
                    style={{ backgroundColor: `${accentColor}15` }}
                  >
                    <span>Item / Service</span>
                    <span>Total</span>
                  </div>
                  <div className="divide-y text-[10px]">
                    <div className="flex justify-between px-2.5 py-1">
                      <span className="truncate">Enterprise Cloud Subscription</span>
                      <span className="font-mono">120,000.00</span>
                    </div>
                    <div className="flex justify-between px-2.5 py-1">
                      <span className="truncate">Implementation Support</span>
                      <span className="font-mono">84,000.00</span>
                    </div>
                  </div>
                  <div className="flex justify-between px-2.5 py-1.5 bg-muted/40 font-semibold text-[11px] border-t">
                    <span>Total Due ({data.currency ?? "KES"})</span>
                    <span style={{ color: accentColor }}>255,200.00</span>
                  </div>
                </div>

                {/* Terms */}
                {terms && (
                  <div className="text-[9px] text-muted-foreground bg-muted/20 p-2 rounded border border-dashed leading-relaxed">
                    <span className="font-semibold text-foreground">Terms: </span>
                    {terms}
                  </div>
                )}

                {/* Footer */}
                {footerText && (
                  <div className="text-[9px] text-center text-muted-foreground border-t pt-2">
                    {footerText}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
