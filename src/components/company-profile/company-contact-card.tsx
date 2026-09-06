import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Mail, Phone, Globe } from "lucide-react";
import type { Tenant } from "@/lib/db-types";

interface Props {
  data: Partial<Tenant>;
  onChange: (patch: Partial<Tenant>) => void;
  disabled?: boolean;
}

export function CompanyContactCard({ data, onChange, disabled }: Props) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Contact Information</CardTitle>
              <CardDescription>
                Official corporate email, telephone, and online presence.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="company-email" className="text-xs font-semibold">
              Primary Business Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="company-email"
                type="email"
                className="pl-9"
                value={data.email ?? ""}
                onChange={(e) => onChange({ email: e.target.value })}
                placeholder="info@company.com"
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="company-phone" className="text-xs font-semibold">
              Main Telephone / Mobile
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="company-phone"
                type="tel"
                className="pl-9"
                value={data.phone ?? ""}
                onChange={(e) => onChange({ phone: e.target.value })}
                placeholder="+254 700 000000"
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="company-website" className="text-xs font-semibold">
              Corporate Website
            </Label>
            <div className="relative">
              <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="company-website"
                type="url"
                className="pl-9"
                value={data.website ?? ""}
                onChange={(e) => onChange({ website: e.target.value })}
                placeholder="https://company.com"
                disabled={disabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Physical & Postal Address</CardTitle>
              <CardDescription>
                Headquarters location printed on official documents, statements, and tax invoices.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="address-1" className="text-xs font-semibold">
              Street Address Line 1
            </Label>
            <Input
              id="address-1"
              value={data.address_line1 ?? ""}
              onChange={(e) => onChange({ address_line1: e.target.value })}
              placeholder="e.g. 4th Floor, Aurora Towers, Hospital Road"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="address-2" className="text-xs font-semibold">
              Address Line 2 (Building / Suite / Industrial Area)
            </Label>
            <Input
              id="address-2"
              value={data.address_line2 ?? ""}
              onChange={(e) => onChange({ address_line2: e.target.value })}
              placeholder="e.g. Suite 402, Upper Hill"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="city" className="text-xs font-semibold">
              City / Town
            </Label>
            <Input
              id="city"
              value={data.city ?? ""}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="e.g. Nairobi"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="state-province" className="text-xs font-semibold">
              State / County / Province
            </Label>
            <Input
              id="state-province"
              value={data.state_province ?? ""}
              onChange={(e) => onChange({ state_province: e.target.value })}
              placeholder="e.g. Nairobi County"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="postal-code" className="text-xs font-semibold">
              Postal / ZIP Code
            </Label>
            <Input
              id="postal-code"
              value={data.postal_code ?? ""}
              onChange={(e) => onChange({ postal_code: e.target.value })}
              placeholder="e.g. 00100"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="country" className="text-xs font-semibold">
              Country
            </Label>
            <Input
              id="country"
              value={data.country ?? "Kenya"}
              onChange={(e) => onChange({ country: e.target.value })}
              placeholder="e.g. Kenya"
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
