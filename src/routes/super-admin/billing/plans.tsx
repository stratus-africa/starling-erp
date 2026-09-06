/**
 * Super Admin — SaaS Plans, Features, and Entitlements Management
 *
 * Route: /super-admin/billing/plans
 *
 * Architecture:
 *   Plan → Features → Entitlements
 *   Tenant → Subscription → Plan → Entitlements
 *
 * Capabilities:
 *   - Manage subscription plans catalogue (Pricing, intervals, trial days, public status)
 *   - Manage feature catalog (Modules, numeric limits, metered limits, integrations)
 *   - Manage plan entitlements matrix (Feature toggles, numeric limits, configs per plan)
 *   - Inspect plan details, active subscriptions, and metrics
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { db } from "@/lib/typed-db";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { fmtMoney, dateFmt } from "@/components/super-admin/tenant-shared";
import type { Plan, Feature, PlanEntitlement, FeatureType, FeatureCategory } from "@/lib/entitlements";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Layers,
  Sparkles,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Check,
  X,
  Edit2,
  Sliders,
  DollarSign,
  Users,
  HardDrive,
  Package,
  Calendar,
  Eye,
  Shield,
  Zap,
  Tag,
  CheckCircle2,
  XCircle,
  Clock,
  Settings,
  ListFilter,
  MoreHorizontal,
  ChevronRight,
  Info,
} from "lucide-react";

// ─── Route Definition ─────────────────────────────────────────────────────────

export const Route = createFileRoute("/super-admin/billing/plans")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.plansView}>
      <PlansAndEntitlementsPage />
    </PermissionGuard>
  ),
});

// ─── Constants ────────────────────────────────────────────────────────────────

const FEATURE_CATEGORIES: { id: FeatureCategory; label: string; icon: React.ElementType }[] = [
  { id: "limits", label: "Usage Limits", icon: HardDrive },
  { id: "modules", label: "Business Modules", icon: Package },
  { id: "integrations", label: "Integrations & API", icon: Zap },
  { id: "core", label: "Core Features", icon: Settings },
  { id: "security", label: "Security & Governance", icon: Shield },
];

const FEATURE_TYPE_BADGES: Record<FeatureType, { label: string; class: string }> = {
  boolean: { label: "Toggle Module", class: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" },
  numeric_limit: { label: "Numeric Limit", class: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
  metered: { label: "Metered Rate", class: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  text: { label: "Config Value", class: "bg-muted text-muted-foreground border-border" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlansAndEntitlementsPage() {
  const queryClient = useQueryClient();
  const { canPlatform } = usePlatformAuth();
  const canManage = canPlatform(PLATFORM_PERMISSIONS.plansManage);

  const [activeTab, setActiveTab] = useState("plans");

  // Filter States
  const [planSearch, setPlanSearch] = useState("");
  const [featureSearch, setFeatureSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");

  // Modals & Drawers
  const [isCreatePlanOpen, setIsCreatePlanOpen] = useState(false);
  const [isEditPlanOpen, setIsEditPlanOpen] = useState(false);
  const [isPlanDetailOpen, setIsPlanDetailOpen] = useState(false);
  const [isCreateFeatureOpen, setIsCreateFeatureOpen] = useState(false);
  const [isEditFeatureOpen, setIsEditFeatureOpen] = useState(false);
  const [isConfigureEntitlementsOpen, setIsConfigureEntitlementsOpen] = useState(false);

  // Selected Entities
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);

  // Form States for Plan
  const [planForm, setPlanForm] = useState({
    id: "",
    name: "",
    code: "",
    description: "",
    price_usd: 0,
    billing_interval: "monthly",
    currency: "USD",
    trial_days: 14,
    max_users: null as number | null,
    max_storage_gb: null as number | null,
    is_public: true,
    is_active: true,
    sort_order: 0,
  });

  // Form States for Feature
  const [featureForm, setFeatureForm] = useState({
    id: "",
    name: "",
    code: "",
    description: "",
    type: "boolean" as FeatureType,
    category: "modules" as FeatureCategory,
    unit: "",
    is_active: true,
    sort_order: 0,
  });

  // Form States for Entitlements Matrix Editing
  const [entitlementsBuffer, setEntitlementsBuffer] = useState<Record<string, { enabled: boolean; limit_value: number | null }>>({});

  // ─── Fetch Data via RPC ─────────────────────────────────────────────────────

  const {
    data: catalogueData,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<{ plans: Plan[]; features: Feature[]; entitlements: PlanEntitlement[] }>({
    queryKey: ["super-admin", "plans-and-features"],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_plans_and_features");
      if (error) throw error;
      return data ?? { plans: [], features: [], entitlements: [] };
    },
  });

  const plans = catalogueData?.plans ?? [];
  const features = catalogueData?.features ?? [];
  const entitlements = catalogueData?.entitlements ?? [];

  // ─── Mutations ──────────────────────────────────────────────────────────────

  // 1. Save Plan Mutation
  const savePlanMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await db.rpc("admin_save_plan", {
        _payload: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Plan saved successfully.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "plans-and-features"] });
      setIsCreatePlanOpen(false);
      setIsEditPlanOpen(false);
    },
    onError: (err: any) => {
      toast.error("Failed to save plan: " + (err.message || "Unknown error"));
    },
  });

  // 2. Toggle Plan Status Mutation
  const togglePlanStatusMutation = useMutation({
    mutationFn: async ({ planId, isActive }: { planId: string; isActive: boolean }) => {
      const { data, error } = await db.rpc("admin_set_plan_status", {
        _plan_id: planId,
        _is_active: isActive,
        _reason: `Plan status toggled to ${isActive ? "active" : "inactive"} by Super Admin`,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.isActive ? "Plan activated." : "Plan deactivated.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "plans-and-features"] });
    },
    onError: (err: any) => {
      toast.error("Failed to update plan status: " + (err.message || "Unknown error"));
    },
  });

  // 3. Save Feature Mutation
  const saveFeatureMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await db.rpc("admin_save_feature", {
        _payload: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Feature definition saved.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "plans-and-features"] });
      setIsCreateFeatureOpen(false);
      setIsEditFeatureOpen(false);
    },
    onError: (err: any) => {
      toast.error("Failed to save feature: " + (err.message || "Unknown error"));
    },
  });

  // 4. Save Plan Entitlements Mutation
  const saveEntitlementsMutation = useMutation({
    mutationFn: async ({ planId, items }: { planId: string; items: any[] }) => {
      const { data, error } = await db.rpc("admin_save_plan_entitlements", {
        _plan_id: planId,
        _entitlements: items,
        _reason: "Plan entitlements updated in Super Admin matrix",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Plan entitlements saved successfully.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "plans-and-features"] });
      setIsConfigureEntitlementsOpen(false);
    },
    onError: (err: any) => {
      toast.error("Failed to save entitlements: " + (err.message || "Unknown error"));
    },
  });

  // ─── Metrics Calculation ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalPlans = plans.length;
    const activePlans = plans.filter((p) => p.is_active).length;
    const totalSubscriptions = plans.reduce((acc, p) => acc + (p.active_subscriptions_count || 0), 0);
    const totalFeatures = features.length;
    return { totalPlans, activePlans, totalSubscriptions, totalFeatures };
  }, [plans, features]);

  // ─── Filtered Lists ─────────────────────────────────────────────────────────
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      const matchSearch =
        !planSearch.trim() ||
        p.name.toLowerCase().includes(planSearch.toLowerCase()) ||
        p.code.toLowerCase().includes(planSearch.toLowerCase());
      return matchSearch;
    });
  }, [plans, planSearch]);

  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      const matchSearch =
        !featureSearch.trim() ||
        f.name.toLowerCase().includes(featureSearch.toLowerCase()) ||
        f.code.toLowerCase().includes(featureSearch.toLowerCase());
      const matchCategory = selectedCategory === "all" || f.category === selectedCategory;
      const matchType = selectedType === "all" || f.type === selectedType;
      return matchSearch && matchCategory && matchType;
    });
  }, [features, featureSearch, selectedCategory, selectedType]);

  // Helper to map entitlements matrix
  const entitlementsMap = useMemo(() => {
    const map = new Map<string, PlanEntitlement>();
    for (const ent of entitlements) {
      map.set(`${ent.plan_id}_${ent.feature_id}`, ent);
    }
    return map;
  }, [entitlements]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const openCreatePlanModal = () => {
    setPlanForm({
      id: "",
      name: "",
      code: "",
      description: "",
      price_usd: 49,
      billing_interval: "monthly",
      currency: "USD",
      trial_days: 14,
      max_users: 5,
      max_storage_gb: 10,
      is_public: true,
      is_active: true,
      sort_order: (plans.length + 1) * 10,
    });
    setIsCreatePlanOpen(true);
  };

  const openEditPlanModal = (plan: Plan) => {
    setSelectedPlan(plan);
    setPlanForm({
      id: plan.id,
      name: plan.name,
      code: plan.code,
      description: plan.description || "",
      price_usd: plan.price_usd,
      billing_interval: plan.billing_interval || "monthly",
      currency: plan.currency || "USD",
      trial_days: plan.trial_days ?? 14,
      max_users: plan.max_users,
      max_storage_gb: plan.max_storage_gb,
      is_public: plan.is_public,
      is_active: plan.is_active,
      sort_order: plan.sort_order,
    });
    setIsEditPlanOpen(true);
  };

  const openPlanDetailDrawer = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsPlanDetailOpen(true);
  };

  const openConfigureEntitlementsModal = (plan: Plan) => {
    setSelectedPlan(plan);
    const initialBuffer: Record<string, { enabled: boolean; limit_value: number | null }> = {};
    for (const f of features) {
      const ent = entitlementsMap.get(`${plan.id}_${f.id}`);
      initialBuffer[f.id] = {
        enabled: ent ? ent.enabled : (f.type !== "boolean"),
        limit_value: ent?.limit_value ?? (f.code === "users" ? plan.max_users : f.code === "storage" ? plan.max_storage_gb : null),
      };
    }
    setEntitlementsBuffer(initialBuffer);
    setIsConfigureEntitlementsOpen(true);
  };

  const openCreateFeatureModal = () => {
    setFeatureForm({
      id: "",
      name: "",
      code: "",
      description: "",
      type: "boolean",
      category: "modules",
      unit: "",
      is_active: true,
      sort_order: (features.length + 1) * 10,
    });
    setIsCreateFeatureOpen(true);
  };

  const openEditFeatureModal = (feat: Feature) => {
    setSelectedFeature(feat);
    setFeatureForm({
      id: feat.id,
      name: feat.name,
      code: feat.code,
      description: feat.description || "",
      type: feat.type,
      category: feat.category,
      unit: feat.unit || "",
      is_active: feat.is_active,
      sort_order: feat.sort_order,
    });
    setIsEditFeatureOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-6 w-full">
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              SaaS Plans & Entitlements
            </h1>
            <p className="text-xs text-muted-foreground">
              Define pricing plans, manage feature catalogs, and configure subscription entitlement limits.
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
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={openCreateFeatureModal}
                className="h-9 gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                New Feature
              </Button>
              <Button
                size="sm"
                onClick={openCreatePlanModal}
                className="h-9 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Plan
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── Architectural Callout Banner ─────────────────────────────────── */}
      <Card className="border-border/60 bg-muted/30 shadow-none">
        <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
              <Zap className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                <span>Entitlement Pipeline Architecture</span>
                <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                  Plan → Features → Entitlements
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When a tenant subscribes to a plan, the centralized entitlement service resolves feature permissions and numeric capacity limits in real time.
                Custom subscription overrides and tenant feature flags can selectively grant access without altering the base plan.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Subscription Plans</span>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold">{stats.totalPlans}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{stats.activePlans} active for subscription</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Subscriptions</span>
            <Users className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats.totalSubscriptions}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Assigned to customer tenants</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Features Catalog</span>
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold">{stats.totalFeatures}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Across modules, limits, & APIs</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Entitlements Matrix</span>
            <Sliders className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {plans.length * features.length}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Resolved plan/feature mappings</p>
        </Card>
      </div>

      {/* ─── Navigation Tabs ──────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="plans" className="text-xs gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Plans Catalog ({plans.length})
          </TabsTrigger>
          <TabsTrigger value="features" className="text-xs gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Features Catalog ({features.length})
          </TabsTrigger>
          <TabsTrigger value="matrix" className="text-xs gap-1.5">
            <Sliders className="h-3.5 w-3.5" />
            Entitlements Cross-Matrix
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 1: PLANS CATALOG
           ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="plans" className="space-y-4">
          <Card className="p-4 border-border/70 bg-card">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search plans by name or code..."
                  value={planSearch}
                  onChange={(e) => setPlanSearch(e.target.value)}
                  className="pl-9 text-xs h-9"
                />
              </div>
              {planSearch && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPlanSearch("")}
                  className="h-9 text-xs text-muted-foreground"
                >
                  Clear Search
                </Button>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden border-border/70 p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold">Plan Name & Identifier</TableHead>
                  <TableHead className="text-xs font-semibold">Pricing & Interval</TableHead>
                  <TableHead className="text-xs font-semibold">Trial Period</TableHead>
                  <TableHead className="text-xs font-semibold">Capacity Quotas</TableHead>
                  <TableHead className="text-xs font-semibold">Active Tenants</TableHead>
                  <TableHead className="text-xs font-semibold">Visibility</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Loading subscription plans...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredPlans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Layers className="h-8 w-8 text-muted-foreground/40" />
                        <p className="font-medium text-foreground">No plans found</p>
                        <p className="text-xs">Create a subscription plan to get started.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPlans.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                      {/* Name & Code */}
                      <TableCell>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            <span>{p.name}</span>
                            <Badge variant="outline" className="text-[10px] font-mono border-border">
                              {p.code}
                            </Badge>
                          </div>
                          {p.description && (
                            <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                              {p.description}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Pricing */}
                      <TableCell>
                        <div className="font-semibold text-xs text-foreground">
                          {p.price_usd === 0 ? "Free / Trial" : `${fmtMoney(p.price_usd)} ${p.currency}`}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase">{p.billing_interval}</div>
                      </TableCell>

                      {/* Trial Days */}
                      <TableCell className="text-xs text-muted-foreground">
                        {p.trial_days > 0 ? `${p.trial_days} days` : "No Trial"}
                      </TableCell>

                      {/* Capacity */}
                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                            <Users className="h-3 w-3" />
                            <span>{p.max_users ? `${p.max_users} users` : "Unlimited users"}</span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                            <HardDrive className="h-3 w-3" />
                            <span>{p.max_storage_gb ? `${p.max_storage_gb} GB` : "Unlimited storage"}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Active Subscriptions */}
                      <TableCell>
                        <Badge variant="secondary" className="text-[11px] font-medium">
                          {p.active_subscriptions_count ?? 0} tenants
                        </Badge>
                      </TableCell>

                      {/* Public / Internal */}
                      <TableCell>
                        {p.is_public ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/5">
                            Public
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                            Internal
                          </Badge>
                        )}
                      </TableCell>

                      {/* Active Status */}
                      <TableCell>
                        {p.is_active ? (
                          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px] gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPlanDetailDrawer(p)}
                            className="h-7 px-2 text-xs"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View
                          </Button>

                          {canManage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel className="text-xs">Plan Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => openEditPlanModal(p)} className="text-xs cursor-pointer">
                                  <Edit2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                  Edit Plan Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openConfigureEntitlementsModal(p)} className="text-xs cursor-pointer">
                                  <Sliders className="h-3.5 w-3.5 mr-2 text-primary" />
                                  Configure Entitlements
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => togglePlanStatusMutation.mutate({ planId: p.id, isActive: !p.is_active })}
                                  className="text-xs cursor-pointer"
                                >
                                  {p.is_active ? (
                                    <>
                                      <XCircle className="h-3.5 w-3.5 mr-2 text-amber-500" />
                                      Deactivate Plan
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-500" />
                                      Activate Plan
                                    </>
                                  )}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 2: FEATURES CATALOG
           ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="features" className="space-y-4">
          <Card className="p-4 border-border/70 bg-card">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="flex flex-1 flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search features by name or code..."
                    value={featureSearch}
                    onChange={(e) => setFeatureSearch(e.target.value)}
                    className="pl-9 text-xs h-9"
                  />
                </div>

                <div className="w-full sm:w-44">
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                      {FEATURE_CATEGORIES.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full sm:w-36">
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All Types</SelectItem>
                      <SelectItem value="boolean" className="text-xs">Toggle Module</SelectItem>
                      <SelectItem value="numeric_limit" className="text-xs">Numeric Limit</SelectItem>
                      <SelectItem value="metered" className="text-xs">Metered Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(featureSearch || selectedCategory !== "all" || selectedType !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFeatureSearch("");
                    setSelectedCategory("all");
                    setSelectedType("all");
                  }}
                  className="h-9 text-xs text-muted-foreground"
                >
                  Reset Filters
                </Button>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFeatures.map((f) => {
              const typeMeta = FEATURE_TYPE_BADGES[f.type] ?? FEATURE_TYPE_BADGES.boolean;
              return (
                <Card key={f.id} className="border-border/70 bg-card hover:border-border transition-all flex flex-col justify-between">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                          {f.name}
                        </CardTitle>
                        <CardDescription className="font-mono text-[10px] text-muted-foreground mt-0.5">
                          {f.code}
                        </CardDescription>
                      </div>
                      <Badge className={`text-[10px] border ${typeMeta.class}`}>
                        {typeMeta.label}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pb-4">
                    <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                      {f.description || "No description provided."}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t">
                      <span className="capitalize font-medium text-foreground">
                        Category: {f.category}
                      </span>
                      {f.unit && (
                        <Badge variant="outline" className="text-[10px] font-mono">
                          Unit: {f.unit}
                        </Badge>
                      )}
                    </div>
                  </CardContent>

                  {canManage && (
                    <div className="px-4 py-2 bg-muted/20 border-t flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditFeatureModal(f)}
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 className="h-3 w-3" />
                        Edit Definition
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 3: ENTITLEMENTS CROSS-MATRIX
           ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="matrix" className="space-y-4">
          <Card className="overflow-hidden border-border/70 p-0">
            <div className="p-4 border-b bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">Entitlements Matrix</h3>
                <p className="text-xs text-muted-foreground">
                  Feature authorizations and limits mapped across all subscription plans.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-background">
                  {features.length} Features × {plans.length} Plans
                </Badge>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold sticky left-0 bg-muted/40 z-10 min-w-[220px]">
                      Feature Definition
                    </TableHead>
                    <TableHead className="text-xs font-semibold min-w-[100px]">Type</TableHead>
                    {plans.map((p) => (
                      <TableHead key={p.id} className="text-xs font-semibold text-center min-w-[140px]">
                        <div className="font-bold text-foreground">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground font-normal">
                          {fmtMoney(p.price_usd)} / {p.billing_interval}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {features.map((f) => (
                    <TableRow key={f.id} className="hover:bg-muted/20">
                      {/* Feature Name & Code */}
                      <TableCell className="sticky left-0 bg-card z-10 border-r">
                        <div className="font-medium text-xs text-foreground">{f.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{f.code}</div>
                      </TableCell>

                      {/* Feature Type */}
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {f.type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>

                      {/* Plan Entitlement Values */}
                      {plans.map((p) => {
                        const ent = entitlementsMap.get(`${p.id}_${f.id}`);
                        return (
                          <TableCell key={p.id} className="text-center text-xs">
                            {f.type === "boolean" ? (
                              ent?.enabled ? (
                                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px] gap-1">
                                  <Check className="h-3 w-3" /> Enabled
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] gap-1">
                                  <X className="h-3 w-3" /> Disabled
                                </Badge>
                              )
                            ) : (
                              <div>
                                {ent?.enabled ? (
                                  ent.limit_value !== null ? (
                                    <span className="font-semibold text-foreground font-mono">
                                      {ent.limit_value} {f.unit ?? ""}
                                    </span>
                                  ) : (
                                    <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 text-[10px]">
                                      Unlimited
                                    </Badge>
                                  )
                                ) : (
                                  <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">
                                    Disabled
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Drawer: Plan Detail ────────────────────────────────────────────── */}
      <Sheet open={isPlanDetailOpen} onOpenChange={setIsPlanDetailOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Plan Specifications & Entitlements
            </SheetTitle>
            <SheetDescription className="text-xs">
              Complete pricing tiers, quota ceilings, and configured feature matrix for this plan.
            </SheetDescription>
          </SheetHeader>

          {selectedPlan && (
            <div className="flex flex-col gap-6 py-4 text-xs">
              {/* Plan Card */}
              <div className="p-4 rounded-lg bg-muted/40 border flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">{selectedPlan.name}</h3>
                  <p className="font-mono text-xs text-muted-foreground">{selectedPlan.code}</p>
                  <div className="mt-2 text-xl font-bold text-foreground">
                    {fmtMoney(selectedPlan.price_usd)} <span className="text-xs font-normal text-muted-foreground">/ {selectedPlan.billing_interval}</span>
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <Badge className={selectedPlan.is_active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px]" : "bg-muted text-muted-foreground text-[10px]"}>
                    {selectedPlan.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <div className="text-[11px] text-muted-foreground">
                    {selectedPlan.active_subscriptions_count ?? 0} active subscribers
                  </div>
                </div>
              </div>

              {/* Attributes */}
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground uppercase tracking-wider text-muted-foreground text-[11px]">
                  Plan Parameters
                </h4>
                <div className="rounded-lg border bg-card divide-y">
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Trial Period</span>
                    <span className="font-semibold">{selectedPlan.trial_days} days</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Max User Accounts</span>
                    <span className="font-semibold">{selectedPlan.max_users ?? "Unlimited"}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Max File Storage</span>
                    <span className="font-semibold">{selectedPlan.max_storage_gb ? `${selectedPlan.max_storage_gb} GB` : "Unlimited"}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Marketplace Visibility</span>
                    <span className="font-semibold">{selectedPlan.is_public ? "Public" : "Internal"}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Catalogue Sort Order</span>
                    <span className="font-semibold font-mono">{selectedPlan.sort_order}</span>
                  </div>
                </div>
              </div>

              {/* Entitlements in this plan */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-foreground uppercase tracking-wider text-muted-foreground text-[11px]">
                    Included Entitlements
                  </h4>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openConfigureEntitlementsModal(selectedPlan)}
                      className="h-7 text-xs text-primary gap-1"
                    >
                      <Sliders className="h-3.5 w-3.5" />
                      Configure
                    </Button>
                  )}
                </div>

                <div className="rounded-lg border bg-card divide-y max-h-60 overflow-y-auto">
                  {features.map((f) => {
                    const ent = entitlementsMap.get(`${selectedPlan.id}_${f.id}`);
                    return (
                      <div key={f.id} className="p-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-foreground">{f.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{f.code}</div>
                        </div>
                        <div>
                          {f.type === "boolean" ? (
                            ent?.enabled ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px]">
                                Enabled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                Disabled
                              </Badge>
                            )
                          ) : ent?.enabled ? (
                            ent.limit_value !== null ? (
                              <span className="font-semibold text-foreground font-mono">
                                {ent.limit_value} {f.unit ?? ""}
                              </span>
                            ) : (
                              <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 text-[10px]">
                                Unlimited
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground text-[10px]">
                              Disabled
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {canManage && (
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => openEditPlanModal(selectedPlan)}
                    className="flex-1 text-xs"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                    Edit Plan
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfigureEntitlementsModal(selectedPlan)}
                    className="flex-1 text-xs"
                  >
                    <Sliders className="h-3.5 w-3.5 mr-1.5 text-primary" />
                    Configure Entitlements
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Dialog: Create / Edit Plan ─────────────────────────────────────── */}
      <Dialog
        open={isCreatePlanOpen || isEditPlanOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreatePlanOpen(false);
            setIsEditPlanOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              {isCreatePlanOpen ? "Create Subscription Plan" : `Edit Plan: ${planForm.name}`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure pricing model, trial rules, base quotas, and visibility.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Plan Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Enterprise Tier"
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Identifier Code <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. enterprise"
                value={planForm.code}
                onChange={(e) => setPlanForm({ ...planForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                className="text-xs font-mono"
                disabled={isEditPlanOpen}
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea
                placeholder="Summary of target market, features, and key value propositions..."
                value={planForm.description}
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                className="text-xs h-16"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Price (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={planForm.price_usd}
                onChange={(e) => setPlanForm({ ...planForm, price_usd: parseFloat(e.target.value) || 0 })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Billing Interval</Label>
              <Select
                value={planForm.billing_interval}
                onValueChange={(val) => setPlanForm({ ...planForm, billing_interval: val })}
              >
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                  <SelectItem value="annual" className="text-xs">Annual</SelectItem>
                  <SelectItem value="one_time" className="text-xs">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Trial Period (Days)</Label>
              <Input
                type="number"
                min="0"
                value={planForm.trial_days}
                onChange={(e) => setPlanForm({ ...planForm, trial_days: parseInt(e.target.value) || 0 })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Sort Order Index</Label>
              <Input
                type="number"
                value={planForm.sort_order}
                onChange={(e) => setPlanForm({ ...planForm, sort_order: parseInt(e.target.value) || 0 })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Max Users (blank for unlimited)</Label>
              <Input
                type="number"
                placeholder="Unlimited"
                value={planForm.max_users ?? ""}
                onChange={(e) => setPlanForm({ ...planForm, max_users: e.target.value === "" ? null : parseInt(e.target.value) })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Max Storage GB (blank for unlimited)</Label>
              <Input
                type="number"
                placeholder="Unlimited"
                value={planForm.max_storage_gb ?? ""}
                onChange={(e) => setPlanForm({ ...planForm, max_storage_gb: e.target.value === "" ? null : parseInt(e.target.value) })}
                className="text-xs"
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between p-3 rounded-lg border bg-muted/20 mt-1">
              <div className="space-y-0.5">
                <div className="font-semibold text-foreground">Marketplace Public Listing</div>
                <div className="text-[11px] text-muted-foreground">Permit tenants to self-select this plan upon signup or upgrade.</div>
              </div>
              <Switch
                checked={planForm.is_public}
                onCheckedChange={(checked) => setPlanForm({ ...planForm, is_public: checked })}
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div className="space-y-0.5">
                <div className="font-semibold text-foreground">Active Subscription Status</div>
                <div className="text-[11px] text-muted-foreground">Enabled for customer tenant subscriptions.</div>
              </div>
              <Switch
                checked={planForm.is_active}
                onCheckedChange={(checked) => setPlanForm({ ...planForm, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsCreatePlanOpen(false);
                setIsEditPlanOpen(false);
              }}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!planForm.name.trim() || !planForm.code.trim()) {
                  toast.error("Plan name and code are required.");
                  return;
                }
                savePlanMutation.mutate(planForm);
              }}
              disabled={savePlanMutation.isPending}
              className="text-xs"
            >
              {savePlanMutation.isPending ? "Saving Plan..." : "Save Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Create / Edit Feature ─────────────────────────────────── */}
      <Dialog
        open={isCreateFeatureOpen || isEditFeatureOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateFeatureOpen(false);
            setIsEditFeatureOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              {isCreateFeatureOpen ? "Create Feature Definition" : `Edit Feature: ${featureForm.name}`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Define a module toggle, numeric capacity ceiling, or metered rate limit.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Feature Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Manufacturing & BOMs"
                value={featureForm.name}
                onChange={(e) => setFeatureForm({ ...featureForm, name: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Identifier Code <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. manufacturing"
                value={featureForm.code}
                onChange={(e) => setFeatureForm({ ...featureForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                className="text-xs font-mono"
                disabled={isEditFeatureOpen}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea
                placeholder="Details of what this feature grants to the customer workspace..."
                value={featureForm.description}
                onChange={(e) => setFeatureForm({ ...featureForm, description: e.target.value })}
                className="text-xs h-16"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Feature Type</Label>
                <Select
                  value={featureForm.type}
                  onValueChange={(val: FeatureType) => setFeatureForm({ ...featureForm, type: val })}
                >
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boolean" className="text-xs">Toggle Module</SelectItem>
                    <SelectItem value="numeric_limit" className="text-xs">Numeric Limit</SelectItem>
                    <SelectItem value="metered" className="text-xs">Metered Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <Select
                  value={featureForm.category}
                  onValueChange={(val: FeatureCategory) => setFeatureForm({ ...featureForm, category: val })}
                >
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEATURE_CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Unit Label (Optional)</Label>
                <Input
                  placeholder="e.g. users, branches, GB"
                  value={featureForm.unit}
                  onChange={(e) => setFeatureForm({ ...featureForm, unit: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Sort Order</Label>
                <Input
                  type="number"
                  value={featureForm.sort_order}
                  onChange={(e) => setFeatureForm({ ...featureForm, sort_order: parseInt(e.target.value) || 0 })}
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsCreateFeatureOpen(false);
                setIsEditFeatureOpen(false);
              }}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!featureForm.name.trim() || !featureForm.code.trim()) {
                  toast.error("Feature name and code are required.");
                  return;
                }
                saveFeatureMutation.mutate(featureForm);
              }}
              disabled={saveFeatureMutation.isPending}
              className="text-xs"
            >
              {saveFeatureMutation.isPending ? "Saving Feature..." : "Save Feature"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Configure Plan Entitlements ───────────────────────────── */}
      <Dialog open={isConfigureEntitlementsOpen} onOpenChange={setIsConfigureEntitlementsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Sliders className="h-4 w-4 text-primary" />
              Configure Entitlements: {selectedPlan?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Toggle module availability and define numeric ceiling limits for this plan tier.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
            {FEATURE_CATEGORIES.map((cat) => {
              const catFeatures = features.filter((f) => f.category === cat.id);
              if (catFeatures.length === 0) return null;

              return (
                <div key={cat.id} className="space-y-2">
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
                    <cat.icon className="h-3.5 w-3.5" />
                    <span>{cat.label}</span>
                  </div>

                  <div className="rounded-lg border bg-card divide-y">
                    {catFeatures.map((f) => {
                      const current = entitlementsBuffer[f.id] || { enabled: false, limit_value: null };
                      const isBoolean = f.type === "boolean";

                      return (
                        <div key={f.id} className="p-3 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                              <span>{f.name}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">({f.code})</span>
                            </div>
                            {f.description && (
                              <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                                {f.description}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            {isBoolean ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-muted-foreground font-medium">
                                  {current.enabled ? "Included" : "Excluded"}
                                </span>
                                <Switch
                                  checked={current.enabled}
                                  onCheckedChange={(checked) => {
                                    setEntitlementsBuffer({
                                      ...entitlementsBuffer,
                                      [f.id]: { ...current, enabled: checked },
                                    });
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                  <Switch
                                    checked={current.enabled}
                                    onCheckedChange={(checked) => {
                                      setEntitlementsBuffer({
                                        ...entitlementsBuffer,
                                        [f.id]: { ...current, enabled: checked },
                                      });
                                    }}
                                  />
                                  <span className="text-[10px] text-muted-foreground">
                                    {current.enabled ? "Active" : "Disabled"}
                                  </span>
                                </div>

                                {current.enabled && (
                                  <div className="flex items-center gap-1 w-32">
                                    <Input
                                      type="number"
                                      placeholder="Unlimited"
                                      value={current.limit_value ?? ""}
                                      onChange={(e) => {
                                        const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                        setEntitlementsBuffer({
                                          ...entitlementsBuffer,
                                          [f.id]: { ...current, limit_value: val },
                                        });
                                      }}
                                      className="text-xs h-8 font-mono"
                                    />
                                    {f.unit && (
                                      <span className="text-[10px] text-muted-foreground shrink-0">{f.unit}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfigureEntitlementsOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!selectedPlan) return;
                const items = Object.entries(entitlementsBuffer).map(([featId, cfg]) => ({
                  feature_id: featId,
                  enabled: cfg.enabled,
                  limit_value: cfg.limit_value,
                }));
                saveEntitlementsMutation.mutate({ planId: selectedPlan.id, items });
              }}
              disabled={saveEntitlementsMutation.isPending}
              className="text-xs"
            >
              {saveEntitlementsMutation.isPending ? "Saving..." : "Save Entitlements Matrix"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PlansAndEntitlementsPage;
