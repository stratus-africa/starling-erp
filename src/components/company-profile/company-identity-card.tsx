import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";
import type { Tenant } from "@/lib/db-types";

const BUSINESS_TYPES = [
  "Private Limited Company (Ltd)",
  "Public Limited Company (PLC)",
  "Sole Proprietorship",
  "Partnership",
  "Limited Liability Partnership (LLP)",
  "Non-Governmental Organization (NGO)",
  "Government / Parastatal",
  "Branch / Subsidiary",
  "Other",
];

const INDUSTRIES = [
  "Manufacturing & Production",
  "Wholesale & Distribution",
  "Retail & E-Commerce",
  "Agriculture & Agribusiness",
  "Construction & Real Estate",
  "Logistics & Freight",
  "Information Technology & SaaS",
  "Financial & Professional Services",
  "Healthcare & Pharmaceuticals",
  "Hospitality & Tourism",
  "Energy, Oil & Gas",
  "Education",
  "Other",
];

interface Props {
  data: Partial<Tenant>;
  onChange: (patch: Partial<Tenant>) => void;
  disabled?: boolean;
}

export function CompanyIdentityCard({ data, onChange, disabled }: Props) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg">Company Identity & Legal Registration</CardTitle>
            <CardDescription>
              Primary corporate identification, official registered name, and business taxonomy.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="company-name" className="text-xs font-semibold">
            Company Display / Workspace Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="company-name"
            value={data.name ?? ""}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Acme Manufacturing Limited"
            disabled={disabled}
            className="font-medium"
          />
          <p className="text-[11px] text-muted-foreground">
            This name appears on the header, sidebar, and workspace switcher.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="legal-name" className="text-xs font-semibold">
            Legal Entity Name
          </Label>
          <Input
            id="legal-name"
            value={data.legal_name ?? ""}
            onChange={(e) => onChange({ legal_name: e.target.value })}
            placeholder="e.g. Acme Industrial Holdings Ltd"
            disabled={disabled}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="trading-name" className="text-xs font-semibold">
            Trading / DBA Name
          </Label>
          <Input
            id="trading-name"
            value={data.trading_name ?? ""}
            onChange={(e) => onChange({ trading_name: e.target.value })}
            placeholder="e.g. Acme Supplies"
            disabled={disabled}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="registration-number" className="text-xs font-semibold">
            Company Registration Number / BNR
          </Label>
          <Input
            id="registration-number"
            value={data.registration_number ?? ""}
            onChange={(e) => onChange({ registration_number: e.target.value })}
            placeholder="e.g. CPR/2021/12345"
            disabled={disabled}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="year-established" className="text-xs font-semibold">
            Year Established
          </Label>
          <Input
            id="year-established"
            type="number"
            min={1800}
            max={new Date().getFullYear()}
            value={data.year_established ?? ""}
            onChange={(e) => onChange({ year_established: e.target.value ? parseInt(e.target.value, 10) : null })}
            placeholder="e.g. 2018"
            disabled={disabled}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="business-type" className="text-xs font-semibold">
            Business Entity Type
          </Label>
          <Select
            value={data.business_type ?? "none"}
            onValueChange={(v) => onChange({ business_type: v === "none" ? null : v })}
            disabled={disabled}
          >
            <SelectTrigger id="business-type">
              <SelectValue placeholder="Select business type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">-- Not Specified --</SelectItem>
              {BUSINESS_TYPES.map((bt) => (
                <SelectItem key={bt} value={bt}>
                  {bt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="industry" className="text-xs font-semibold">
            Industry / Sector
          </Label>
          <Select
            value={data.industry ?? "none"}
            onValueChange={(v) => onChange({ industry: v === "none" ? null : v })}
            disabled={disabled}
          >
            <SelectTrigger id="industry">
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">-- Not Specified --</SelectItem>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="description" className="text-xs font-semibold">
            Company Bio / Overview
          </Label>
          <Textarea
            id="description"
            rows={3}
            value={data.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Brief description of organization, operational mandate, or summary statement."
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
