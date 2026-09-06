import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe2 } from "lucide-react";
import type { Tenant } from "@/lib/db-types";

const CURRENCIES = [
  { code: "KES", label: "KES – Kenyan Shilling" },
  { code: "USD", label: "USD – US Dollar" },
  { code: "EUR", label: "EUR – Euro" },
  { code: "GBP", label: "GBP – British Pound" },
  { code: "UGX", label: "UGX – Ugandan Shilling" },
  { code: "TZS", label: "TZS – Tanzanian Shilling" },
  { code: "RWF", label: "RWF – Rwandan Franc" },
  { code: "ZAR", label: "ZAR – South African Rand" },
  { code: "NGN", label: "NGN – Nigerian Naira" },
  { code: "AED", label: "AED – UAE Dirham" },
  { code: "CAD", label: "CAD – Canadian Dollar" },
  { code: "AUD", label: "AUD – Australian Dollar" },
];

const TIMEZONES = [
  { value: "Africa/Nairobi", label: "Africa/Nairobi (UTC+03:00) — East Africa Time" },
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg (UTC+02:00) — South Africa" },
  { value: "Africa/Lagos", label: "Africa/Lagos (UTC+01:00) — West Africa Time" },
  { value: "Africa/Cairo", label: "Africa/Cairo (UTC+02:00) — Egypt Standard Time" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "Europe/London", label: "Europe/London (UTC+00:00 / +01:00 BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (UTC+01:00 / +02:00 CEST)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (UTC+04:00) — Gulf Standard Time" },
  { value: "Asia/Singapore", label: "Asia/Singapore (UTC+08:00)" },
  { value: "America/New_York", label: "America/New_York (UTC-05:00 / -04:00 EDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (UTC-08:00 / -07:00 PDT)" },
];

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (e.g. 31/12/2026)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (e.g. 2026-12-31 — ISO)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (e.g. 12/31/2026)" },
  { value: "DD-MMM-YYYY", label: "DD-MMM-YYYY (e.g. 31-Dec-2026)" },
];

const NUMBER_FORMATS = [
  { value: "1,234.56", label: "1,234.56 (Standard comma thousands, dot decimal)" },
  { value: "1 234,56", label: "1 234,56 (Space thousands, comma decimal)" },
  { value: "1.234,56", label: "1.234,56 (Dot thousands, comma decimal)" },
];

interface Props {
  data: Partial<Tenant>;
  onChange: (patch: Partial<Tenant>) => void;
  disabled?: boolean;
}

export function CompanyLocalizationCard({ data, onChange, disabled }: Props) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg">Regional & Localization Preferences</CardTitle>
            <CardDescription>
              Base currency, timezone, calendar formatting, and numerical presentation for all reports and ledger displays.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="base-currency" className="text-xs font-semibold">
            Base Functional Currency <span className="text-destructive">*</span>
          </Label>
          <Select
            value={data.currency ?? "KES"}
            onValueChange={(v) => onChange({ currency: v })}
            disabled={disabled}
          >
            <SelectTrigger id="base-currency">
              <SelectValue placeholder="Select base currency" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Default monetary unit for trial balance, GL accounts, and financial statement consolidation.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="timezone" className="text-xs font-semibold">
            Operational Timezone <span className="text-destructive">*</span>
          </Label>
          <Select
            value={data.timezone ?? "Africa/Nairobi"}
            onValueChange={(v) => onChange({ timezone: v })}
            disabled={disabled}
          >
            <SelectTrigger id="timezone">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Governs audit event timestamps, shift cut-offs, and batch manufacturing schedules.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="date-format" className="text-xs font-semibold">
            Standard Date Format
          </Label>
          <Select
            value={data.date_format ?? "DD/MM/YYYY"}
            onValueChange={(v) => onChange({ date_format: v })}
            disabled={disabled}
          >
            <SelectTrigger id="date-format">
              <SelectValue placeholder="Select date format" />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((df) => (
                <SelectItem key={df.value} value={df.value}>
                  {df.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="number-format" className="text-xs font-semibold">
            Number & Currency Format
          </Label>
          <Select
            value={data.number_format ?? "1,234.56"}
            onValueChange={(v) => onChange({ number_format: v })}
            disabled={disabled}
          >
            <SelectTrigger id="number-format">
              <SelectValue placeholder="Select number format" />
            </SelectTrigger>
            <SelectContent>
              {NUMBER_FORMATS.map((nf) => (
                <SelectItem key={nf.value} value={nf.value}>
                  {nf.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
