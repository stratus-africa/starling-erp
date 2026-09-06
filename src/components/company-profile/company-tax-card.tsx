import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, Percent, Calendar } from "lucide-react";
import type { Tenant } from "@/lib/db-types";

interface Props {
  data: Partial<Tenant>;
  onChange: (patch: Partial<Tenant>) => void;
  disabled?: boolean;
}

export function CompanyTaxCard({ data, onChange, disabled }: Props) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Tax Identification & Compliance</CardTitle>
              <CardDescription>
                Official tax registration codes used on fiscalized invoices, withholding certificates, and statutory filings.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="tax-id" className="text-xs font-semibold">
              Tax ID / PIN Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tax-id"
              value={data.tax_id ?? ""}
              onChange={(e) => onChange({ tax_id: e.target.value })}
              placeholder="e.g. P051234567X"
              disabled={disabled}
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Primary taxpayer identification number (e.g. KRA PIN or TIN).
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="vat-number" className="text-xs font-semibold">
              VAT Registration Number
            </Label>
            <Input
              id="vat-number"
              value={data.vat_number ?? ""}
              onChange={(e) => onChange({ vat_number: e.target.value })}
              placeholder="e.g. 0123456789"
              disabled={disabled}
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Leave blank if entity is VAT-exempt or turnover is below statutory threshold.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tax-authority" className="text-xs font-semibold">
              Revenue / Tax Authority
            </Label>
            <Input
              id="tax-authority"
              value={data.tax_authority ?? "KRA"}
              onChange={(e) => onChange({ tax_authority: e.target.value })}
              placeholder="e.g. Kenya Revenue Authority (KRA)"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tax-regime" className="text-xs font-semibold">
              Tax Regime
            </Label>
            <Select
              value={data.tax_regime ?? "standard"}
              onValueChange={(v) => onChange({ tax_regime: v })}
              disabled={disabled}
            >
              <SelectTrigger id="tax-regime">
                <SelectValue placeholder="Select regime" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard VAT Regime</SelectItem>
                <SelectItem value="turnover">Turnover / Micro Tax</SelectItem>
                <SelectItem value="exempt">Fully Exempt Organization</SelectItem>
                <SelectItem value="sez">Special Economic Zone (SEZ / EPZ)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2 pt-2">
            <div className="flex items-center justify-between rounded-lg border p-3.5 bg-muted/20">
              <div className="space-y-0.5">
                <Label htmlFor="tax-inclusive" className="text-sm font-medium">
                  Tax-Inclusive Price Display
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, sales catalogue and standard item price lists display prices inclusive of VAT/sales taxes.
                </p>
              </div>
              <Switch
                id="tax-inclusive"
                checked={!!data.tax_inclusive_pricing}
                onCheckedChange={(checked) => onChange({ tax_inclusive_pricing: checked })}
                disabled={disabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Financial Year Definition</CardTitle>
              <CardDescription>
                Company-level annual accounting cycle boundaries.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="fiscal-start" className="text-xs font-semibold">
              Fiscal Year Start (MM-DD)
            </Label>
            <Input
              id="fiscal-start"
              value={data.fiscal_year_start ?? "01-01"}
              onChange={(e) => onChange({ fiscal_year_start: e.target.value })}
              placeholder="01-01"
              disabled={disabled}
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Format: MM-DD (e.g. 01-01 for January 1st, 07-01 for July 1st).
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="fiscal-end" className="text-xs font-semibold">
              Fiscal Year End (MM-DD)
            </Label>
            <Input
              id="fiscal-end"
              value={data.fiscal_year_end ?? "12-31"}
              onChange={(e) => onChange({ fiscal_year_end: e.target.value })}
              placeholder="12-31"
              disabled={disabled}
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Format: MM-DD (e.g. 12-31 for December 31st, 06-30 for June 30th).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
