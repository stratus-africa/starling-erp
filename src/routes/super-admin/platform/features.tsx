/**
 * Super Admin — Feature Flag Management System
 *
 * Route: /super-admin/platform/features
 *
 * Supported Levels:
 *   - GLOBAL (master enable/disable switch)
 *   - PLAN (target specific subscription tiers)
 *   - TENANT (target specific tenants & explicit allowlist/blocklist overrides)
 *   - USER / ROLLOUT (deterministic percentage rollout & environment targeting)
 *
 * Centralized Evaluation:
 *   Evaluation logic is mirrored on frontend and backend.
 *   Audit logging on every toggle, configuration change, and tenant override.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { db } from "@/lib/typed-db";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { dateFmt, timeFmt } from "@/components/super-admin/tenant-shared";
import type { FeatureFlag, TenantFlagOverride } from "@/lib/feature-flags";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Flag,
  Sparkles,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Sliders,
  History,
  Building2,
  Layers,
  Percent,
  Server,
  Shield,
  Edit2,
  MoreHorizontal,
  Eye,
  Check,
  X,
  AlertCircle,
  Clock,
  ChevronRight,
  Info,
  SlidersHorizontal,
} from "lucide-react";

// ─── Route Definition ─────────────────────────────────────────────────────────

export const Route = createFileRoute("/super-admin/platform/features")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.featuresView}>
      <FeatureFlagsManagementPage />
    </PermissionGuard>
  ),
});

// ─── Environment Badge Styling ────────────────────────────────────────────────

const ENV_BADGES: Record<string, { label: string; class: string }> = {
  all: { label: "All Environments", class: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" },
  production: { label: "Production Only", class: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
  staging: { label: "Staging Only", class: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  development: { label: "Development Only", class: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function FeatureFlagsManagementPage() {
  const queryClient = useQueryClient();
  const { canPlatform } = usePlatformAuth();
  const canManage = canPlatform(PLATFORM_PERMISSIONS.featuresManage);

  const [activeTab, setActiveTab] = useState("flags");

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [envFilter, setEnvFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selected Entities
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);

  // Dialog & Drawer States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isOverridesOpen, setIsOverridesOpen] = useState(false);

  // Form State for Flag
  const [flagForm, setFlagForm] = useState({
    id: "",
    code: "",
    name: "",
    description: "",
    enabled: false,
    environment: "all" as "all" | "production" | "staging" | "development",
    rollout_percentage: 100,
    target_plans: [] as string[],
    target_tenants: [] as string[],
    audit_reason: "",
  });

  // Tenant Override Form State
  const [overrideTenantId, setOverrideTenantId] = useState("");
  const [overrideEnabled, setOverrideEnabled] = useState(true);
  const [overrideReason, setOverrideReason] = useState("");

  // ── Fetch Flags and Overrides via RPC ───────────────────────────────────────
  const {
    data: flagsData,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<{ flags: FeatureFlag[]; overrides: TenantFlagOverride[] }>({
    queryKey: ["super-admin", "feature-flags-list"],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_feature_flags");
      if (error) {
        toast.error("Failed to load feature flags: " + error.message);
        throw error;
      }
      return data ?? { flags: [], overrides: [] };
    },
  });

  const flags = flagsData?.flags ?? [];
  const overrides = flagsData?.overrides ?? [];

  // ── Fetch Tenants Catalogue (for Overrides & Targeting) ──────────────────────
  const { data: tenantsList = [] } = useQuery({
    queryKey: ["super-admin", "tenants-simple-list"],
    queryFn: async () => {
      const { data, error } = await db.from("tenants").select("id, name, slug").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Fetch Plans Catalogue (for Plan Targeting) ───────────────────────────────
  const { data: plansList = [] } = useQuery({
    queryKey: ["super-admin", "plans-simple-list"],
    queryFn: async () => {
      const { data, error } = await db.from("plans").select("id, name, code").order("price_usd");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Fetch Flag History / Audit Log ──────────────────────────────────────────
  const { data: flagHistory = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["super-admin", "flag-history", selectedFlag?.code],
    queryFn: async () => {
      if (!selectedFlag?.code) return [];
      const { data, error } = await db.rpc("admin_get_flag_history", {
        _flag_code: selectedFlag.code,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedFlag?.code && isHistoryOpen,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  // 1. Save / Create Feature Flag
  const saveFlagMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await db.rpc("admin_save_feature_flag", {
        _payload: payload,
        _reason: payload.audit_reason || "Feature flag updated by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Feature flag saved successfully.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "feature-flags-list"] });
      setIsCreateOpen(false);
      setIsEditOpen(false);
    },
    onError: (err: any) => {
      toast.error("Failed to save feature flag: " + (err.message || "Unknown error"));
    },
  });

  // 2. Toggle Flag Status
  const toggleFlagMutation = useMutation({
    mutationFn: async ({ flagId, enabled }: { flagId: string; enabled: boolean }) => {
      const { data, error } = await db.rpc("admin_toggle_feature_flag", {
        _flag_id: flagId,
        _enabled: enabled,
        _reason: `Flag ${enabled ? "enabled" : "disabled"} from Super Admin dashboard`,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.enabled ? "Flag enabled globally." : "Flag disabled globally.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "feature-flags-list"] });
    },
    onError: (err: any) => {
      toast.error("Failed to toggle flag: " + (err.message || "Unknown error"));
    },
  });

  // 3. Set Tenant Override
  const setTenantOverrideMutation = useMutation({
    mutationFn: async ({
      tenantId,
      flagCode,
      enabled,
      reason,
    }: {
      tenantId: string;
      flagCode: string;
      enabled: boolean;
      reason: string;
    }) => {
      const { data, error } = await db.rpc("admin_set_tenant_flag_override", {
        _tenant_id: tenantId,
        _flag_code: flagCode,
        _enabled: enabled,
        _reason: reason || "Tenant override configured by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Tenant feature flag override saved.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "feature-flags-list"] });
      setOverrideTenantId("");
      setOverrideReason("");
    },
    onError: (err: any) => {
      toast.error("Failed to set tenant override: " + (err.message || "Unknown error"));
    },
  });

  // ── Metrics Calculation ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = flags.length;
    const globallyEnabled = flags.filter((f) => f.enabled).length;
    const partialRollouts = flags.filter((f) => f.enabled && f.rollout_percentage < 100).length;
    const totalOverrides = overrides.length;
    return { total, globallyEnabled, partialRollouts, totalOverrides };
  }, [flags, overrides]);

  // ── Filtered List ───────────────────────────────────────────────────────────
  const filteredFlags = useMemo(() => {
    return flags.filter((f) => {
      const matchSearch =
        !searchTerm.trim() ||
        f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchEnv = envFilter === "all" || f.environment === envFilter;
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && f.enabled) ||
        (statusFilter === "disabled" && !f.enabled);
      return matchSearch && matchEnv && matchStatus;
    });
  }, [flags, searchTerm, envFilter, statusFilter]);

  // ── Modal Open Handlers ─────────────────────────────────────────────────────
  const openCreateModal = () => {
    setFlagForm({
      id: "",
      code: "",
      name: "",
      description: "",
      enabled: false,
      environment: "all",
      rollout_percentage: 100,
      target_plans: [],
      target_tenants: [],
      audit_reason: "",
    });
    setIsCreateOpen(true);
  };

  const openEditModal = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setFlagForm({
      id: flag.id,
      code: flag.code,
      name: flag.name,
      description: flag.description || "",
      enabled: flag.enabled,
      environment: flag.environment,
      rollout_percentage: flag.rollout_percentage,
      target_plans: flag.target_plans || [],
      target_tenants: flag.target_tenants || [],
      audit_reason: "",
    });
    setIsEditOpen(true);
  };

  const openHistoryDrawer = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setIsHistoryOpen(true);
  };

  const openOverridesDrawer = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setOverrideTenantId("");
    setOverrideEnabled(true);
    setOverrideReason("");
    setIsOverridesOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-6 w-full">
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
            <Flag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Feature Flags & Rollouts
            </h1>
            <p className="text-xs text-muted-foreground">
              Configure global master toggles, plan entitlements, tenant targeting, and percentage-based rollouts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {canManage && (
            <Button
              size="sm"
              onClick={openCreateModal}
              className="h-9 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Feature Flag
            </Button>
          )}
        </div>
      </div>

      {/* ─── Architectural Callout Banner ─────────────────────────────────── */}
      <Card className="border-border/60 bg-muted/30 shadow-none">
        <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                <span>Deterministic Evaluation Pipeline</span>
                <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                  Global → Plan → Tenant → Rollout %
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Feature evaluations adhere to strict precedence: explicit tenant allowlist/blocklist overrides take priority,
                followed by environment checks, global switches, plan tiers, and deterministic hashing for gradual percent rollouts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Feature Flags</span>
            <Flag className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold">{stats.total}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Defined platform flags</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Globally Enabled</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats.globallyEnabled}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Active master switches</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Partial Rollouts in Flight</span>
            <Percent className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats.partialRollouts}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Gradual % distribution</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Tenant Overrides</span>
            <Building2 className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {stats.totalOverrides}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Explicit customer rules</p>
        </Card>
      </div>

      {/* ─── Navigation Tabs ──────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="flags" className="text-xs gap-1.5">
            <Flag className="h-3.5 w-3.5" />
            Feature Flags Catalog ({flags.length})
          </TabsTrigger>
          <TabsTrigger value="overrides" className="text-xs gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Tenant Overrides List ({overrides.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 1: FLAGS CATALOG
           ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="flags" className="space-y-4">
          <Card className="p-4 border-border/70 bg-card">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="flex flex-1 flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search flags by name or code..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 text-xs h-9"
                  />
                </div>

                <div className="w-full sm:w-40">
                  <Select value={envFilter} onValueChange={setEnvFilter}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="Environment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All Environments</SelectItem>
                      <SelectItem value="production" className="text-xs">Production</SelectItem>
                      <SelectItem value="staging" className="text-xs">Staging</SelectItem>
                      <SelectItem value="development" className="text-xs">Development</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full sm:w-36">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                      <SelectItem value="enabled" className="text-xs">Enabled</SelectItem>
                      <SelectItem value="disabled" className="text-xs">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(searchTerm || envFilter !== "all" || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setEnvFilter("all");
                    setStatusFilter("all");
                  }}
                  className="h-9 text-xs text-muted-foreground"
                >
                  Reset Filters
                </Button>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden border-border/70 p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold">Flag Identifier & Name</TableHead>
                  <TableHead className="text-xs font-semibold">Environment</TableHead>
                  <TableHead className="text-xs font-semibold">Global Status</TableHead>
                  <TableHead className="text-xs font-semibold">Rollout Percentage</TableHead>
                  <TableHead className="text-xs font-semibold">Target Rules</TableHead>
                  <TableHead className="text-xs font-semibold">Customer Overrides</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Loading feature flag specifications...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredFlags.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Flag className="h-8 w-8 text-muted-foreground/40" />
                        <p className="font-medium text-foreground">No feature flags found</p>
                        <p className="text-xs">Create a feature flag to control system capabilities.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFlags.map((flag) => {
                    const envMeta = ENV_BADGES[flag.environment] ?? ENV_BADGES.all;

                    return (
                      <TableRow key={flag.id} className="hover:bg-muted/20 transition-colors">
                        {/* Name & Code */}
                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                              <span>{flag.name}</span>
                              <Badge variant="outline" className="text-[10px] font-mono border-border">
                                {flag.code}
                              </Badge>
                            </div>
                            {flag.description && (
                              <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                {flag.description}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Environment */}
                        <TableCell>
                          <Badge className={`text-[10px] border ${envMeta.class}`}>
                            {envMeta.label}
                          </Badge>
                        </TableCell>

                        {/* Global Switch */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={flag.enabled}
                              disabled={!canManage || toggleFlagMutation.isPending}
                              onCheckedChange={(checked) =>
                                toggleFlagMutation.mutate({ flagId: flag.id, enabled: checked })
                              }
                            />
                            <span className="text-xs font-medium">
                              {flag.enabled ? (
                                <span className="text-emerald-600 dark:text-emerald-400">Enabled</span>
                              ) : (
                                <span className="text-muted-foreground">Disabled</span>
                              )}
                            </span>
                          </div>
                        </TableCell>

                        {/* Rollout % */}
                        <TableCell>
                          <div className="space-y-1 w-28">
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                              <span>{flag.rollout_percentage}%</span>
                              <span className="text-[10px] text-muted-foreground font-normal">
                                {flag.rollout_percentage === 100 ? "Full" : flag.rollout_percentage === 0 ? "Off" : "Gradual"}
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  flag.rollout_percentage === 100
                                    ? "bg-emerald-500"
                                    : flag.rollout_percentage === 0
                                    ? "bg-zinc-400"
                                    : "bg-blue-500"
                                }`}
                                style={{ width: `${flag.rollout_percentage}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>

                        {/* Targets (Plans / Tenants) */}
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {flag.target_plans && flag.target_plans.length > 0 ? (
                              flag.target_plans.map((p) => (
                                <Badge key={p} variant="secondary" className="text-[10px] uppercase">
                                  {p}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-[11px] text-muted-foreground">All Plans</span>
                            )}
                            {flag.target_tenants && flag.target_tenants.length > 0 && (
                              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                                {flag.target_tenants.length} Tenants Target
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Overrides Count */}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openOverridesDrawer(flag)}
                            className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <Building2 className="h-3.5 w-3.5 text-indigo-500" />
                            <span>{flag.overrides_count ?? 0} Overrides</span>
                          </Button>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(flag)}
                              className="h-7 px-2 text-xs"
                            >
                              <Edit2 className="h-3.5 w-3.5 mr-1" />
                              Edit
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel className="text-xs">Flag Controls</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => openEditModal(flag)} className="text-xs cursor-pointer">
                                  <Sliders className="h-3.5 w-3.5 mr-2 text-primary" />
                                  Configure Parameters
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openOverridesDrawer(flag)} className="text-xs cursor-pointer">
                                  <Building2 className="h-3.5 w-3.5 mr-2 text-indigo-500" />
                                  Manage Tenant Overrides
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openHistoryDrawer(flag)} className="text-xs cursor-pointer">
                                  <History className="h-3.5 w-3.5 mr-2 text-blue-500" />
                                  View Audit History
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 2: TENANT OVERRIDES LIST
           ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="overrides" className="space-y-4">
          <Card className="overflow-hidden border-border/70 p-0">
            <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Explicit Tenant Overrides</h3>
                <p className="text-xs text-muted-foreground">
                  Allowlist or blocklist specific customer tenants regardless of global status.
                </p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold">Tenant Organization</TableHead>
                  <TableHead className="text-xs font-semibold">Targeted Feature</TableHead>
                  <TableHead className="text-xs font-semibold">Override Status</TableHead>
                  <TableHead className="text-xs font-semibold">Reason / Audit Justification</TableHead>
                  <TableHead className="text-xs font-semibold">Last Modified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Building2 className="h-8 w-8 text-muted-foreground/40" />
                        <p className="font-medium text-foreground">No explicit tenant overrides</p>
                        <p className="text-xs">All customer tenants evaluate using standard plan & percentage rules.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  overrides.map((ov, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="font-semibold text-xs text-foreground">{ov.tenant_name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{ov.tenant_slug}</div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {ov.feature}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {ov.enabled ? (
                          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px] gap-1">
                            <Check className="h-3 w-3" /> Force Allowed
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <X className="h-3 w-3" /> Force Blocked
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {ov.reason || "No explicit reason specified."}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {dateFmt(ov.updated_at)} {timeFmt(ov.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Dialog: Create / Edit Feature Flag ──────────────────────────────── */}
      <Dialog
        open={isCreateOpen || isEditOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setIsEditOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" />
              {isCreateOpen ? "Create Feature Flag" : `Edit Flag: ${flagForm.name}`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Define identifier, target environments, percentage rollout distribution, and plan tiers.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Flag Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. NextGen Accounting Engine"
                value={flagForm.name}
                onChange={(e) => setFlagForm({ ...flagForm, name: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Code Identifier <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. accounting_v2"
                value={flagForm.code}
                onChange={(e) => setFlagForm({ ...flagForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                className="text-xs font-mono"
                disabled={isEditOpen}
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea
                placeholder="Explain the capability controlled by this flag and any dependencies..."
                value={flagForm.description}
                onChange={(e) => setFlagForm({ ...flagForm, description: e.target.value })}
                className="text-xs h-16"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Target Environment</Label>
              <Select
                value={flagForm.environment}
                onValueChange={(val: any) => setFlagForm({ ...flagForm, environment: val })}
              >
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Environments</SelectItem>
                  <SelectItem value="production" className="text-xs">Production Only</SelectItem>
                  <SelectItem value="staging" className="text-xs">Staging Only</SelectItem>
                  <SelectItem value="development" className="text-xs">Development Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Rollout Percentage</Label>
                <span className="font-bold text-xs">{flagForm.rollout_percentage}%</span>
              </div>
              <div className="pt-2">
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[flagForm.rollout_percentage]}
                  onValueChange={([val]) => setFlagForm({ ...flagForm, rollout_percentage: val })}
                />
              </div>
            </div>

            {/* Target Plans */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Restricted Plan Tiers (Optional)</Label>
              <p className="text-[11px] text-muted-foreground">If selected, only tenants subscribed to these plans evaluate to true.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {plansList.map((p: any) => {
                  const isSelected = flagForm.target_plans.includes(p.code);
                  return (
                    <Button
                      key={p.id}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        if (isSelected) {
                          setFlagForm({
                            ...flagForm,
                            target_plans: flagForm.target_plans.filter((c) => c !== p.code),
                          });
                        } else {
                          setFlagForm({
                            ...flagForm,
                            target_plans: [...flagForm.target_plans, p.code],
                          });
                        }
                      }}
                      className="text-xs h-7"
                    >
                      {p.name} ({p.code})
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="sm:col-span-2 flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div className="space-y-0.5">
                <div className="font-semibold text-foreground">Global Enablement State</div>
                <div className="text-[11px] text-muted-foreground">Master switch for flag evaluation across the platform.</div>
              </div>
              <Switch
                checked={flagForm.enabled}
                onCheckedChange={(checked) => setFlagForm({ ...flagForm, enabled: checked })}
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">
                Reason / Audit Summary <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Explain the reason for this flag change..."
                value={flagForm.audit_reason}
                onChange={(e) => setFlagForm({ ...flagForm, audit_reason: e.target.value })}
                className="text-xs h-16"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsCreateOpen(false);
                setIsEditOpen(false);
              }}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!flagForm.name.trim() || !flagForm.code.trim()) {
                  toast.error("Flag name and code are required.");
                  return;
                }
                if (!flagForm.audit_reason.trim()) {
                  toast.error("Please provide an audit reason.");
                  return;
                }
                saveFlagMutation.mutate(flagForm);
              }}
              disabled={saveFlagMutation.isPending}
              className="text-xs"
            >
              {saveFlagMutation.isPending ? "Saving..." : "Save Feature Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Drawer: Tenant Overrides Management ────────────────────────────── */}
      <Sheet open={isOverridesOpen} onOpenChange={setIsOverridesOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-500" />
              Tenant Overrides: {selectedFlag?.name}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Explicitly force-enable (allowlist) or force-disable (blocklist) this flag for specific customer tenants.
            </SheetDescription>
          </SheetHeader>

          {selectedFlag && (
            <div className="py-4 space-y-6 text-xs">
              {/* Add New Override Box */}
              {canManage && (
                <div className="p-3.5 rounded-lg border bg-muted/20 space-y-3">
                  <h4 className="font-semibold text-foreground">Add / Update Tenant Override</h4>

                  <div className="space-y-2">
                    <div>
                      <Label className="text-[11px]">Select Tenant</Label>
                      <Select value={overrideTenantId} onValueChange={setOverrideTenantId}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="Choose a tenant workspace" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenantsList.map((t: any) => (
                            <SelectItem key={t.id} value={t.id} className="text-xs">
                              {t.name} ({t.slug})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <Label className="text-[11px]">Override Effect</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {overrideEnabled ? "Force Enabled (Allowlist)" : "Force Disabled (Blocklist)"}
                        </span>
                        <Switch checked={overrideEnabled} onCheckedChange={setOverrideEnabled} />
                      </div>
                    </div>

                    <div>
                      <Label className="text-[11px]">Justification / Reason</Label>
                      <Input
                        placeholder="e.g. VIP pilot access requested per ticket #521..."
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>

                    <Button
                      size="sm"
                      onClick={() => {
                        if (!overrideTenantId) {
                          toast.error("Please select a tenant.");
                          return;
                        }
                        setTenantOverrideMutation.mutate({
                          tenantId: overrideTenantId,
                          flagCode: selectedFlag.code,
                          enabled: overrideEnabled,
                          reason: overrideReason.trim(),
                        });
                      }}
                      disabled={setTenantOverrideMutation.isPending}
                      className="w-full text-xs h-8 mt-1"
                    >
                      {setTenantOverrideMutation.isPending ? "Saving..." : "Save Tenant Override"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Existing Overrides for this Flag */}
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground uppercase tracking-wider text-muted-foreground text-[11px]">
                  Existing Customer Overrides
                </h4>

                {overrides.filter((o) => o.feature === selectedFlag.code).length === 0 ? (
                  <div className="p-6 text-center border rounded-lg text-muted-foreground">
                    No explicit tenant overrides for this flag.
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card divide-y">
                    {overrides
                      .filter((o) => o.feature === selectedFlag.code)
                      .map((ov, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-foreground">{ov.tenant_name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{ov.tenant_slug}</div>
                            {ov.reason && <div className="text-[10px] text-muted-foreground mt-0.5 italic">{ov.reason}</div>}
                          </div>
                          <div>
                            {ov.enabled ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px]">
                                Force Allowed
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">
                                Force Blocked
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Drawer: Flag History & Audit Log ────────────────────────────────── */}
      <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-blue-500" />
              Flag History & Audit Trail: {selectedFlag?.code}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Complete chronological audit trail of all administrative configuration and status adjustments.
            </SheetDescription>
          </SheetHeader>

          <div className="py-4 space-y-4 text-xs">
            {isHistoryLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Loading audit trail...</span>
              </div>
            ) : flagHistory.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <History className="h-8 w-8 text-muted-foreground/40" />
                <p className="font-medium text-foreground">No recent audit logs</p>
                <p className="text-[11px]">No modifications have been recorded for this flag yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {flagHistory.map((evt: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg border bg-card space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 text-[10px] font-mono">
                          {evt.action}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {dateFmt(evt.created_at)} {timeFmt(evt.created_at)}
                      </span>
                    </div>

                    {evt.details && Object.keys(evt.details).length > 0 && (
                      <div className="mt-2 p-2 rounded bg-muted/50 border border-border/50 text-[10px] font-mono overflow-x-auto">
                        <pre>{JSON.stringify(evt.details, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default FeatureFlagsManagementPage;
