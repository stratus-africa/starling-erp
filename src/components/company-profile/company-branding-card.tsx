import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Image as ImageIcon, Upload, Trash2, Loader2, Stamp, PenTool } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tenant } from "@/lib/db-types";
import { useTheme } from "@/components/theme-provider";

interface Props {
  data: Partial<Tenant>;
  onChange: (patch: Partial<Tenant>) => void;
  tenantId: string;
  disabled?: boolean;
}

export function CompanyBrandingCard({ data, onChange, tenantId, disabled }: Props) {
  const { theme, setTheme } = useTheme();
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (
    file: File,
    field: "logo_url" | "signature_url" | "stamp_url",
  ) => {
    if (!file) return;
    if (!tenantId) {
      toast.error("Tenant context required");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, WebP, SVG)");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("File size must be under 2MB");
      return;
    }

    setUploadingField(field);
    try {
      // 1. Convert to data URL for immediate zero-latency PDF rendering & preview
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Url = event.target?.result as string;
        onChange({ [field]: base64Url });

        // 2. Also persist to attachments storage bucket for long-term file retention
        try {
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
          const storagePath = `${tenantId}/branding/${field}/${Date.now()}-${sanitizedName}`;
          await supabase.storage.from("attachments").upload(storagePath, file, {
            upsert: true,
          });
        } catch {
          // Storage bucket write is non-fatal since base64 data uri guarantees immediate client rendering
        }

        toast.success("Asset uploaded successfully");
        setUploadingField(null);
      };
      reader.readAsDataURL(file);
    } catch (e: any) {
      toast.error(e.message || "Failed to upload asset");
      setUploadingField(null);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-stretch">
        {/* Primary Logo Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Company Brand Logo</CardTitle>
                <CardDescription>
                  Primary graphic identity used across navigation, topbar, quotes, and customer
                  statements.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 p-4 rounded-lg border bg-muted/20">
              <div className="flex h-24 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed bg-background overflow-hidden p-2">
                {data.logo_url ? (
                  <img
                    src={data.logo_url}
                    alt="Company Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-[10px]">No logo uploaded</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Recommended dimensions: 300 × 100 pixels. Supported formats: PNG, JPG, WebP, SVG.
                  Transparent background recommended. Maximum size: 2MB.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="file"
                    ref={logoInputRef}
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, "logo_url");
                    }}
                    disabled={disabled || uploadingField === "logo_url"}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={disabled || uploadingField === "logo_url"}
                    className="gap-1.5"
                  >
                    {uploadingField === "logo_url" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {data.logo_url ? "Replace Logo" : "Upload Logo"}
                  </Button>

                  {data.logo_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                      onClick={() => onChange({ logo_url: null })}
                      disabled={disabled}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove Logo
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Theme</CardTitle>
            <CardDescription>
              Apply the shared ERP visual language across your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="branding-theme">Theme</Label>
            <Select
              value={theme}
              onValueChange={(value) => setTheme(value as "nimbus" | "light" | "dark")}
              disabled={disabled}
            >
              <SelectTrigger id="branding-theme" className="w-full">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nimbus">Nimbus</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              Nimbus uses light blue-gray surfaces, navy text, blue actions, and restrained
              semantic states for operational work.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Official Signatures & Seal Card */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <PenTool className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Authorized Signatory</CardTitle>
                <CardDescription>
                  Digital signature placed on approved delivery notes, contracts, and payment
                  receipts.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/20">
              <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded border border-dashed bg-background overflow-hidden p-1">
                {data.signature_url ? (
                  <img
                    src={data.signature_url}
                    alt="Authorized Signature"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-muted-foreground">None</span>
                )}
              </div>
              <div className="space-y-1">
                <input
                  type="file"
                  ref={signatureInputRef}
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, "signature_url");
                  }}
                  disabled={disabled || uploadingField === "signature_url"}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => signatureInputRef.current?.click()}
                    disabled={disabled || uploadingField === "signature_url"}
                  >
                    {uploadingField === "signature_url" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Upload"
                    )}
                  </Button>
                  {data.signature_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-destructive"
                      onClick={() => onChange({ signature_url: null })}
                      disabled={disabled}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Stamp className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Official Company Stamp / Seal</CardTitle>
                <CardDescription>
                  Corporate seal embedded on verified quotations, tax invoices, and proformas.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/20">
              <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded border border-dashed bg-background overflow-hidden p-1">
                {data.stamp_url ? (
                  <img
                    src={data.stamp_url}
                    alt="Company Stamp"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-muted-foreground">None</span>
                )}
              </div>
              <div className="space-y-1">
                <input
                  type="file"
                  ref={stampInputRef}
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, "stamp_url");
                  }}
                  disabled={disabled || uploadingField === "stamp_url"}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => stampInputRef.current?.click()}
                    disabled={disabled || uploadingField === "stamp_url"}
                  >
                    {uploadingField === "stamp_url" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Upload"
                    )}
                  </Button>
                  {data.stamp_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-destructive"
                      onClick={() => onChange({ stamp_url: null })}
                      disabled={disabled}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
