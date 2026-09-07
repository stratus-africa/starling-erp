/**
 * Super Admin — Tenant User Management
 *
 * Route: /super-admin/tenants/:tenantId/users
 *
 * Capabilities:
 *   - View, search, and filter tenant users by role and status
 *   - Clear distinction between PLATFORM USER and TENANT USER
 *   - View deep user details & access hierarchy
 *   - Change tenant roles (strictly blocking platform escalation)
 *   - Activate / deactivate tenant users with audit reason
 *   - Revoke / reset user sessions with audit reason
 *   - Remove user from tenant (preserving auth and referential integrity)
 *   - View combined user activity (Platform Audit Log + ERP Business Events)
 */

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { db } from "@/lib/typed-db";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { dateFmt, timeFmt } from "@/components/super-admin/tenant-shared";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  History,
  Search,
  Filter,
  ArrowLeft,
  MoreHorizontal,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Mail,
  Phone,
  Calendar,
  Clock,
  UserMinus,
  Eye,
  Info,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Fingerprint,
} from "lucide-react";

// ─── Route Definition ─────────────────────────────────────────────────────────

export const Route = createFileRoute("/super-admin/tenants_/$tenantId/users")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.tenantsView}>
      <TenantUserManagementPage />
    </PermissionGuard>
  ),
});

// ─── Constants & Role Definitions ─────────────────────────────────────────────

const AVAILABLE_TENANT_ROLES = [
  { id: "tenant_admin", label: "Tenant Admin", desc: "Full administrative access to this tenant workspace" },
  { id: "sales", label: "Sales", desc: "Sales orders, customers, and quoting" },
  { id: "accounting", label: "Accounting", desc: "General ledger, journal entries, payments, and invoices" },
  { id: "manufacturing", label: "Manufacturing", desc: "Work orders, bills of materials, and production" },
  { id: "inventory", label: "Inventory", desc: "Stock management, transfers, and warehouse adjustments" },
  { id: "purchasing", label: "Purchasing", desc: "Purchase orders and vendor management" },
  { id: "viewer", label: "Viewer", desc: "Read-only access across enabled modules" },
];

const TENANT_ROLE_COLORS: Record<string, string> = {
  tenant_admin: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  sales: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  accounting: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  manufacturing: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  inventory: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
  purchasing: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  viewer: "bg-muted text-muted-foreground border-border",
};

interface TenantUserRecord {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  roles: string[];
  platform_role: string | null;
  total_count: number;
}

interface UserActivityRecord {
  source: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TenantUserManagementPage() {
  const { tenantId } = useParams({ from: "/super-admin/tenants/$tenantId/users" });
  const queryClient = useQueryClient();
  const { canPlatform } = usePlatformAuth();

  const canManage = canPlatform(PLATFORM_PERMISSIONS.usersManage) || canPlatform(PLATFORM_PERMISSIONS.tenantsUpdate);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal / Drawer States
  const [selectedUser, setSelectedUser] = useState<TenantUserRecord | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRolesOpen, setIsRolesOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  // Form states
  const [editedRoles, setEditedRoles] = useState<string[]>([]);
  const [targetStatus, setTargetStatus] = useState<boolean>(true);
  const [auditReason, setAuditReason] = useState("");
  const [confirmRemoveEmail, setConfirmRemoveEmail] = useState("");

  // ── Fetch Tenant Info ───────────────────────────────────────────────────────
  const { data: tenantData, isLoading: isTenantLoading } = useQuery({
    queryKey: ["super-admin", "tenant", tenantId],
    queryFn: async () => {
      const { data, error } = await db.from("tenants").select("id, name, slug, status").eq("id", tenantId).single();
      if (error) throw error;
      return data;
    },
  });

  // ── Fetch Users via RPC ─────────────────────────────────────────────────────
  const {
    data: users = [],
    isLoading: isUsersLoading,
    isRefetching,
    refetch,
  } = useQuery<TenantUserRecord[]>({
    queryKey: ["super-admin", "tenant-users", tenantId, searchTerm, roleFilter, statusFilter],
    queryFn: async () => {
      const { data, error } = await db.rpc("list_tenant_users", {
        _tenant_id: tenantId,
        _search: searchTerm.trim() || null,
        _role: roleFilter === "all" ? null : roleFilter,
        _status: statusFilter === "all" ? null : statusFilter,
        _limit: 100,
        _offset: 0,
      });

      if (error) {
        toast.error("Failed to load tenant users: " + error.message);
        throw error;
      }
      return data ?? [];
    },
  });

  // ── Fetch User Activity Query ───────────────────────────────────────────────
  const { data: userActivity = [], isLoading: isActivityLoading } = useQuery<UserActivityRecord[]>({
    queryKey: ["super-admin", "user-activity", tenantId, selectedUser?.id],
    queryFn: async () => {
      if (!selectedUser?.id) return [];
      const { data, error } = await db.rpc("admin_get_user_activity", {
        _tenant_id: tenantId,
        _user_id: selectedUser.id,
        _limit: 50,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedUser?.id && isActivityOpen,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  // 1. Update Roles Mutation
  const updateRolesMutation = useMutation({
    mutationFn: async ({ userId, roles, reason }: { userId: string; roles: string[]; reason: string }) => {
      const { data, error } = await db.rpc("admin_set_tenant_user_roles", {
        _tenant_id: tenantId,
        _user_id: userId,
        _roles: roles,
        _reason: reason || "Role updated by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Tenant user roles updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant-users", tenantId] });
      setIsRolesOpen(false);
      setAuditReason("");
    },
    onError: (err: any) => {
      toast.error("Failed to update user roles: " + (err.message || "Unknown error"));
    },
  });

  // 2. Update Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive, reason }: { userId: string; isActive: boolean; reason: string }) => {
      const { data, error } = await db.rpc("admin_set_tenant_user_status", {
        _tenant_id: tenantId,
        _user_id: userId,
        _is_active: isActive,
        _reason: reason || "Status changed by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.isActive ? "User activated." : "User deactivated.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant-users", tenantId] });
      setIsStatusOpen(false);
      setAuditReason("");
    },
    onError: (err: any) => {
      toast.error("Failed to change user status: " + (err.message || "Unknown error"));
    },
  });

  // 3. Revoke Sessions Mutation
  const revokeSessionsMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const { data, error } = await db.rpc("admin_revoke_tenant_user_sessions", {
        _tenant_id: tenantId,
        _user_id: userId,
        _reason: reason || "Sessions revoked by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(`Sessions revoked successfully (${res?.sessions_cleared ?? 0} tokens cleared).`);
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant-users", tenantId] });
      setIsRevokeOpen(false);
      setAuditReason("");
    },
    onError: (err: any) => {
      toast.error("Failed to revoke sessions: " + (err.message || "Unknown error"));
    },
  });

  // 4. Remove User Mutation
  const removeUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const { data, error } = await db.rpc("admin_remove_tenant_user", {
        _tenant_id: tenantId,
        _user_id: userId,
        _reason: reason || "User removed from tenant by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("User successfully removed from tenant workspace.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant-users", tenantId] });
      setIsRemoveOpen(false);
      setIsDetailsOpen(false);
      setConfirmRemoveEmail("");
      setAuditReason("");
    },
    onError: (err: any) => {
      toast.error("Failed to remove user: " + (err.message || "Unknown error"));
    },
  });

  // ── Metrics Calculation ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.is_active).length;
    const inactive = total - active;
    const platformAdmins = users.filter((u) => !!u.platform_role).length;
    return { total, active, inactive, platformAdmins };
  }, [users]);

  // Handlers for modal opens
  const openRolesModal = (user: TenantUserRecord) => {
    setSelectedUser(user);
    setEditedRoles([...(user.roles ?? [])]);
    setAuditReason("");
    setIsRolesOpen(true);
  };

  const openStatusModal = (user: TenantUserRecord, nextStatus: boolean) => {
    setSelectedUser(user);
    setTargetStatus(nextStatus);
    setAuditReason("");
    setIsStatusOpen(true);
  };

  const openRevokeModal = (user: TenantUserRecord) => {
    setSelectedUser(user);
    setAuditReason("");
    setIsRevokeOpen(true);
  };

  const openRemoveModal = (user: TenantUserRecord) => {
    setSelectedUser(user);
    setConfirmRemoveEmail("");
    setAuditReason("");
    setIsRemoveOpen(true);
  };

  const openActivityDrawer = (user: TenantUserRecord) => {
    setSelectedUser(user);
    setIsActivityOpen(true);
  };

  const openDetailsDrawer = (user: TenantUserRecord) => {
    setSelectedUser(user);
    setIsDetailsOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* ─── Header & Navigation ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 px-2 text-muted-foreground">
              <Link to="/super-admin/tenants/$id" params={{ id: tenantId }}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Tenant Detail
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Tenant User Management
                {tenantData?.name && (
                  <span className="text-base font-normal text-muted-foreground">
                    — {tenantData.name} ({tenantData.slug})
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground">
                Manage tenant members, role assignments, security status, and inspect activity logs.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isUsersLoading || isRefetching}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Architectural Callout: Platform vs Tenant User ─────────────────── */}
      <Card className="border-border/60 bg-muted/30 shadow-none">
        <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                <span>Security Boundary: Platform User vs Tenant User</span>
                <Badge variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-600 dark:text-amber-400">
                  Strict Isolation Enforced
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tenant users are strictly scoped to the <span className="font-semibold text-foreground">{tenantData?.name ?? "current tenant"}</span> workspace.
                Tenant roles (e.g., Tenant Admin, Accounting, Sales) never confer platform administrative privileges.
                Platform Admins who also exist in this tenant are explicitly badged and protected.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Metric Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Workspace Members</span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold">{stats.total}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Associated with this tenant</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Users</span>
            <UserCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Permitted to sign in</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Deactivated Users</span>
            <UserX className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-muted-foreground">{stats.inactive}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Login access disabled</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Platform Admins</span>
            <Shield className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.platformAdmins}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Dual tenant & platform access</p>
        </Card>
      </div>

      {/* ─── Search & Filters Bar ───────────────────────────────────────────── */}
      <Card className="p-4 border-border/70 bg-card">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex flex-1 flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by full name or email address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            {/* Role Filter */}
            <div className="w-full sm:w-44">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="text-xs h-9">
                  <div className="flex items-center gap-1.5 truncate">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {roleFilter === "all" ? "All Roles" : roleFilter.replace(/_/g, " ")}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Roles</SelectItem>
                  {AVAILABLE_TENANT_ROLES.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="w-full sm:w-36">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                  <SelectItem value="active" className="text-xs">Active Only</SelectItem>
                  <SelectItem value="inactive" className="text-xs">Inactive Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(searchTerm || roleFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setRoleFilter("all");
                setStatusFilter("all");
              }}
              className="h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </Card>

      {/* ─── Users Table ────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden border-border/70 p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs font-semibold">User Identity</TableHead>
              <TableHead className="text-xs font-semibold">Security Type</TableHead>
              <TableHead className="text-xs font-semibold">Tenant Roles</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold">Last Sign In</TableHead>
              <TableHead className="text-xs font-semibold">Member Since</TableHead>
              <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isUsersLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span>Loading tenant user records...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Users className="h-8 w-8 text-muted-foreground/40" />
                    <p className="font-medium text-foreground">No users found</p>
                    <p className="text-xs text-muted-foreground">
                      {searchTerm || roleFilter !== "all" || statusFilter !== "all"
                        ? "No users match your active filter criteria."
                        : "No users are registered to this tenant workspace."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id} className="hover:bg-muted/20 transition-colors">
                  {/* Identity */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 border border-border flex items-center justify-center text-xs font-semibold text-primary uppercase">
                        {(u.full_name || u.email || "U").slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-xs text-foreground truncate flex items-center gap-1.5">
                          <span>{u.full_name || "Unnamed User"}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Security Type */}
                  <TableCell>
                    {u.platform_role ? (
                      <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 text-[10px] gap-1 hover:bg-indigo-500/20">
                        <Shield className="h-3 w-3" />
                        Platform Admin ({u.platform_role.replace(/_/g, " ")})
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px] border-border">
                        Tenant User
                      </Badge>
                    )}
                  </TableCell>

                  {/* Tenant Roles */}
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {(u.roles ?? []).map((r) => (
                        <span
                          key={r}
                          className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${
                            TENANT_ROLE_COLORS[r] ?? TENANT_ROLE_COLORS.viewer
                          }`}
                        >
                          {r.replace(/_/g, " ")}
                        </span>
                      ))}
                      {(!u.roles || u.roles.length === 0) && (
                        <span className="text-xs text-muted-foreground italic">No tenant roles</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    {u.is_active ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px] gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                        Deactivated
                      </Badge>
                    )}
                  </TableCell>

                  {/* Last Sign In */}
                  <TableCell className="text-xs text-muted-foreground">
                    {u.last_sign_in_at ? (
                      <div>
                        <div>{dateFmt(u.last_sign_in_at)}</div>
                        <div className="text-[10px] text-muted-foreground/70">{timeFmt(u.last_sign_in_at)}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/60 italic">Never</span>
                    )}
                  </TableCell>

                  {/* Joined Date */}
                  <TableCell className="text-xs text-muted-foreground">
                    {dateFmt(u.created_at)}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDetailsDrawer(u)}
                        className="h-7 px-2 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel className="text-xs">User Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openDetailsDrawer(u)} className="text-xs cursor-pointer">
                            <Eye className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                            View Full Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openActivityDrawer(u)} className="text-xs cursor-pointer">
                            <History className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                            View Activity Audit
                          </DropdownMenuItem>

                          {canManage && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openRolesModal(u)} className="text-xs cursor-pointer">
                                <KeyRound className="h-3.5 w-3.5 mr-2 text-amber-500" />
                                Change Tenant Roles
                              </DropdownMenuItem>

                              {u.is_active ? (
                                <DropdownMenuItem
                                  onClick={() => openStatusModal(u, false)}
                                  className="text-xs cursor-pointer text-amber-600 dark:text-amber-400"
                                >
                                  <Lock className="h-3.5 w-3.5 mr-2" />
                                  Deactivate User
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => openStatusModal(u, true)}
                                  className="text-xs cursor-pointer text-emerald-600 dark:text-emerald-400"
                                >
                                  <Unlock className="h-3.5 w-3.5 mr-2" />
                                  Activate User
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuItem
                                onClick={() => openRevokeModal(u)}
                                className="text-xs cursor-pointer text-amber-600 dark:text-amber-400"
                              >
                                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                                Reset / Revoke Sessions
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => openRemoveModal(u)}
                                className="text-xs cursor-pointer text-destructive focus:text-destructive"
                              >
                                <UserMinus className="h-3.5 w-3.5 mr-2" />
                                Remove from Tenant
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ─── Drawer: User Details ───────────────────────────────────────────── */}
      <Sheet open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Tenant User Profile & Access
            </SheetTitle>
            <SheetDescription className="text-xs">
              Comprehensive profile details, authorization boundaries, and security telemetry.
            </SheetDescription>
          </SheetHeader>

          {selectedUser && (
            <div className="flex flex-col gap-6 py-4 text-xs">
              {/* Profile Card */}
              <div className="p-4 rounded-lg bg-muted/40 border flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 border flex items-center justify-center text-sm font-bold text-primary uppercase">
                  {(selectedUser.full_name || selectedUser.email || "U").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {selectedUser.full_name || "Unnamed User"}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{selectedUser.email}</div>
                  <div className="flex items-center gap-2 mt-2">
                    {selectedUser.is_active ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px]">
                        Active Account
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">
                        Deactivated
                      </Badge>
                    )}
                    {selectedUser.platform_role && (
                      <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 text-[10px]">
                        Platform Administrator
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Architectural Access Boundary Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider text-muted-foreground">
                  Security & Access Boundaries
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Tenant Layer */}
                  <div className="p-3 rounded-lg border bg-card space-y-2">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      Tenant Workspace Access
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Roles active inside <span className="font-semibold text-foreground">{tenantData?.name ?? "Tenant"}</span>:
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(selectedUser.roles ?? []).map((r) => (
                        <span
                          key={r}
                          className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${
                            TENANT_ROLE_COLORS[r] ?? TENANT_ROLE_COLORS.viewer
                          }`}
                        >
                          {r.replace(/_/g, " ")}
                        </span>
                      ))}
                      {(!selectedUser.roles || selectedUser.roles.length === 0) && (
                        <span className="text-[11px] text-muted-foreground italic">No roles assigned</span>
                      )}
                    </div>
                  </div>

                  {/* Platform Layer */}
                  <div className="p-3 rounded-lg border bg-card space-y-2">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Shield className="h-3.5 w-3.5 text-indigo-500" />
                      Platform Administrative Tier
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Global platform-wide role:
                    </div>
                    <div>
                      {selectedUser.platform_role ? (
                        <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 text-[10px]">
                          {selectedUser.platform_role.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">None (Pure Tenant User)</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/80">
                      Tenant roles never grant access to the Super Admin platform.
                    </p>
                  </div>
                </div>
              </div>

              {/* Identity & Metadata Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider text-muted-foreground">
                  User Attributes & Timestamps
                </h4>
                <div className="rounded-lg border bg-card divide-y">
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Fingerprint className="h-3.5 w-3.5" />
                      User UUID
                    </span>
                    <span className="font-mono text-[11px] text-foreground select-all">{selectedUser.id}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      Email Address
                    </span>
                    <span className="font-mono text-[11px] text-foreground">{selectedUser.email}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      Phone Number
                    </span>
                    <span className="text-[11px] text-foreground">{selectedUser.phone || "—"}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Created / Joined
                    </span>
                    <span className="text-[11px] text-foreground">{dateFmt(selectedUser.created_at)}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Last Profile Update
                    </span>
                    <span className="text-[11px] text-foreground">{dateFmt(selectedUser.updated_at)}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Last Sign-In Timestamp
                    </span>
                    <span className="text-[11px] text-foreground">
                      {selectedUser.last_sign_in_at ? `${dateFmt(selectedUser.last_sign_in_at)} at ${timeFmt(selectedUser.last_sign_in_at)}` : "Never"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              {canManage && (
                <div className="flex flex-col gap-2 pt-2">
                  <div className="text-xs font-semibold text-foreground">Quick Management Actions</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRolesModal(selectedUser)}
                      className="text-xs h-8 justify-start"
                    >
                      <KeyRound className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
                      Change Roles
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openActivityDrawer(selectedUser)}
                      className="text-xs h-8 justify-start"
                    >
                      <History className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
                      Audit Activity
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openStatusModal(selectedUser, !selectedUser.is_active)}
                      className="text-xs h-8 justify-start"
                    >
                      {selectedUser.is_active ? (
                        <>
                          <Lock className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <Unlock className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                          Activate
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRevokeModal(selectedUser)}
                      className="text-xs h-8 justify-start"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-indigo-500" />
                      Revoke Sessions
                    </Button>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => openRemoveModal(selectedUser)}
                    className="text-xs h-8 justify-start mt-1"
                  >
                    <UserMinus className="h-3.5 w-3.5 mr-1.5" />
                    Remove from Tenant Workspace
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Dialog: Change Tenant Roles ────────────────────────────────────── */}
      <Dialog open={isRolesOpen} onOpenChange={setIsRolesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-500" />
              Change Tenant Roles
            </DialogTitle>
            <DialogDescription className="text-xs">
              Assign or revoke tenant-scoped access roles for{" "}
              <span className="font-semibold text-foreground">{selectedUser?.email}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
              <p className="font-semibold">Tenant Scope Only</p>
              <p className="mt-0.5 text-[11px]">
                These roles grant permissions only within this tenant workspace. They cannot grant platform administrative privileges.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Select Tenant Roles</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {AVAILABLE_TENANT_ROLES.map((r) => {
                  const isChecked = editedRoles.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked ? "bg-primary/5 border-primary/40" : "hover:bg-muted/30 border-border"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditedRoles([...editedRoles, r.id]);
                          } else {
                            setEditedRoles(editedRoles.filter((id) => id !== r.id));
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground">{r.label}</div>
                        <div className="text-[11px] text-muted-foreground">{r.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Reason for Role Change <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="e.g., Promotion to tenant administrator per ticket SUP-1049..."
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="text-xs h-20"
              />
              <p className="text-[10px] text-muted-foreground">This reason will be recorded in the Platform Audit Log.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsRolesOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!selectedUser) return;
                if (!auditReason.trim()) {
                  toast.error("Please provide an audit reason for changing user roles.");
                  return;
                }
                updateRolesMutation.mutate({
                  userId: selectedUser.id,
                  roles: editedRoles,
                  reason: auditReason.trim(),
                });
              }}
              disabled={updateRolesMutation.isPending}
              className="text-xs"
            >
              {updateRolesMutation.isPending ? "Saving Roles..." : "Save Role Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Activate / Deactivate Status ────────────────────────────── */}
      <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              {targetStatus ? (
                <>
                  <Unlock className="h-4 w-4 text-emerald-500" />
                  Activate Tenant User
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-amber-500" />
                  Deactivate Tenant User
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {targetStatus
                ? `Restore login access for ${selectedUser?.email}.`
                : `Prevent ${selectedUser?.email} from signing in or accessing the workspace.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div
              className={`p-3 rounded border text-xs ${
                targetStatus
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300"
              }`}
            >
              <p className="font-semibold">{targetStatus ? "Immediate Access Restoration" : "Immediate Access Suspension"}</p>
              <p className="mt-0.5 text-[11px]">
                {targetStatus
                  ? "The user will be able to log in and access all authorized tenant modules."
                  : "The user will be blocked from logging in. Historical documents and audit records remain intact."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Reason for Status Change <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="e.g., Account reactivation requested by client admin..."
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="text-xs h-20"
              />
              <p className="text-[10px] text-muted-foreground">Will be logged in the Platform Audit Trail.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsStatusOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              variant={targetStatus ? "default" : "destructive"}
              onClick={() => {
                if (!selectedUser) return;
                if (!auditReason.trim()) {
                  toast.error("Please enter a reason for this status change.");
                  return;
                }
                updateStatusMutation.mutate({
                  userId: selectedUser.id,
                  isActive: targetStatus,
                  reason: auditReason.trim(),
                });
              }}
              disabled={updateStatusMutation.isPending}
              className="text-xs"
            >
              {updateStatusMutation.isPending
                ? "Updating Status..."
                : targetStatus
                ? "Confirm Activation"
                : "Confirm Deactivation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Revoke / Reset Sessions ────────────────────────────────── */}
      <Dialog open={isRevokeOpen} onOpenChange={setIsRevokeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-500" />
              Revoke User Sessions
            </DialogTitle>
            <DialogDescription className="text-xs">
              Force session invalidation for <span className="font-semibold text-foreground">{selectedUser?.email}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="p-3 rounded bg-muted border text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Forced Re-authentication</p>
              <p className="mt-0.5 text-[11px]">
                Active refresh tokens will be revoked. The user will be required to re-authenticate the next time their client makes an API request.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Reason for Session Revocation <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="e.g., Security precaution following reported device loss..."
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="text-xs h-20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsRevokeOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!selectedUser) return;
                if (!auditReason.trim()) {
                  toast.error("Please enter a reason for session revocation.");
                  return;
                }
                revokeSessionsMutation.mutate({
                  userId: selectedUser.id,
                  reason: auditReason.trim(),
                });
              }}
              disabled={revokeSessionsMutation.isPending}
              className="text-xs"
            >
              {revokeSessionsMutation.isPending ? "Revoking Sessions..." : "Revoke All Active Sessions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Remove User from Tenant ────────────────────────────────── */}
      <Dialog open={isRemoveOpen} onOpenChange={setIsRemoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Remove User from Tenant Workspace
            </DialogTitle>
            <DialogDescription className="text-xs">
              Disassociate <span className="font-semibold text-foreground">{selectedUser?.email}</span> from{" "}
              <span className="font-semibold text-foreground">{tenantData?.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="p-3 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              <p className="font-semibold">Referential Integrity Protected</p>
              <p className="mt-0.5 text-[11px] leading-relaxed">
                This action strips all workspace roles and clears the tenant association. The user's underlying authentication identity and past audit trail records remain intact.
              </p>
            </div>

            {selectedUser?.platform_role && (
              <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                <p className="font-semibold">Platform Admin Warning</p>
                <p className="mt-0.5 text-[11px]">
                  This user is an active Platform Administrator ({selectedUser.platform_role}). Platform admin privileges must be revoked first in Platform Admins if you wish to remove them completely.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Reason for Removal <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="e.g., Employee offboarded from customer organization..."
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="text-xs h-20"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Type user email <span className="font-mono text-foreground font-bold">{selectedUser?.email}</span> to confirm:
              </Label>
              <Input
                placeholder={selectedUser?.email}
                value={confirmRemoveEmail}
                onChange={(e) => setConfirmRemoveEmail(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsRemoveOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={
                removeUserMutation.isPending ||
                confirmRemoveEmail.trim().toLowerCase() !== (selectedUser?.email ?? "").toLowerCase() ||
                !auditReason.trim()
              }
              onClick={() => {
                if (!selectedUser) return;
                removeUserMutation.mutate({
                  userId: selectedUser.id,
                  reason: auditReason.trim(),
                });
              }}
              className="text-xs"
            >
              {removeUserMutation.isPending ? "Removing..." : "Confirm Removal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Drawer: User Activity & Audit Trail ────────────────────────────── */}
      <Sheet open={isActivityOpen} onOpenChange={setIsActivityOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-blue-500" />
              User Activity & Audit Trail
            </SheetTitle>
            <SheetDescription className="text-xs">
              Combined platform audit events and ERP business events for{" "}
              <span className="font-semibold text-foreground">{selectedUser?.email}</span>.
            </SheetDescription>
          </SheetHeader>

          <div className="py-4 space-y-4">
            {isActivityLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Loading activity log...</span>
              </div>
            ) : userActivity.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <History className="h-8 w-8 text-muted-foreground/40" />
                <p className="font-medium text-foreground">No recent activity recorded</p>
                <p className="text-[11px]">No business actions or platform audit logs found for this user.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {userActivity.map((evt, idx) => (
                  <div key={idx} className="p-3 rounded-lg border bg-card text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {evt.source === "platform_audit" ? (
                          <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 text-[10px]">
                            Platform Audit
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px]">
                            ERP Business Event
                          </Badge>
                        )}
                        <span className="font-mono font-semibold text-foreground">{evt.event_type}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{dateFmt(evt.created_at)} {timeFmt(evt.created_at)}</span>
                    </div>

                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>Entity: <span className="font-medium text-foreground">{evt.entity_type}</span></span>
                      {evt.entity_id && (
                        <span>ID: <span className="font-mono text-foreground select-all">{evt.entity_id.slice(0, 12)}…</span></span>
                      )}
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

export default TenantUserManagementPage;
