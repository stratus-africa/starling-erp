/**
 * Super Admin � Platform Settings
 * Route: /super-admin/settings
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Settings2, RefreshCw, Loader2, AlertCircle, Save, Eye, EyeOff,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/settings")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.settingsView}>
      <SettingsPage />
    </PermissionGuard>
  ),
});

interface Setting {
  key: string;
  value: string | null;
  type: string;
  category: string;
  label: string;
  description: string | null;
  is_secret: boolean;
  updated_at: string;
}

function SettingsPage() {
  const { canPlatform } = usePlatformAuth();
  const qc = useQueryClient();
  const canManage = canPlatform("platform.settings.manage");
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: settings = [], isLoading, error } = useQuery({
    queryKey: ["platform_settings", refreshKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_settings")
        .select("*")
        .order("category")
        .order("key");
      if (error) throw error;
      return (data ?? []) as Setting[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await (supabase as any).rpc("admin_set_platform_setting", {
        _key: key, _value: value,
      });
      if (error) throw error;
    },
    onSuccess: (_, { key }) => {
      toast.success("Setting saved");
      setDirty((d) => { const next = { ...d }; delete next[key]; return next; });
      qc.invalidateQueries({ queryKey: ["platform_settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Group settings by category
  const categories = [...new Set(settings.map((s) => s.category))];

  const getValue = (s: Setting) => (s.key in dirty ? dirty[s.key] : (s.value ?? ""));

  const handleChange = (key: string, value: string) => {
    setDirty((d) => ({ ...d, [key]: value }));
  };

  const isDirty = (key: string) => key in dirty;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Settings</h1>
          <p className="text-sm text-muted-foreground">Platform-wide configuration applied to every tenant.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setRefreshKey((k) => k + 1); setDirty({}); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <Card key={cat}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold capitalize">{cat}</CardTitle>
                <CardDescription className="text-xs">
                  {cat === "branding" && "Customize how the platform appears to tenants."}
                  {cat === "limits" && "Hard limits applied to all tenants by default."}
                  {cat === "billing" && "Default billing configuration for new tenants."}
                  {cat === "system" && "Low-level system configuration."}
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4 space-y-5">
                {settings.filter((s) => s.category === cat).map((s) => {
                  const val = getValue(s);
                  const dirty = isDirty(s.key);
                  return (
                    <div key={s.key} className="grid grid-cols-[1fr_auto] gap-3 items-start">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={s.key} className="text-sm font-medium">{s.label}</Label>
                          {s.is_secret && (
                            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/20">Secret</Badge>
                          )}
                          {dirty && <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">Unsaved</Badge>}
                        </div>
                        {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                        <div className="flex items-center gap-2">
                          {s.type === "boolean" ? (
                            <Switch
                              id={s.key}
                              checked={val === "true"}
                              disabled={!canManage}
                              onCheckedChange={(v) => handleChange(s.key, String(v))}
                            />
                          ) : (
                            <div className="relative flex-1 max-w-sm">
                              <Input
                                id={s.key}
                                type={s.is_secret && !showSecrets[s.key] ? "password" : "text"}
                                value={val}
                                disabled={!canManage}
                                onChange={(e) => handleChange(s.key, e.target.value)}
                              />
                              {s.is_secret && (
                                <button
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  onClick={() => setShowSecrets((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                                >
                                  {showSecrets[s.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {canManage && dirty && (
                        <Button
                          size="sm"
                          className="mt-6"
                          disabled={saveMutation.isPending}
                          onClick={() => saveMutation.mutate({ key: s.key, value: val })}
                        >
                          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
          {settings.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Settings2 className="h-10 w-10 opacity-30" />
              <p className="text-sm">No settings found. Run the platform settings migration.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
