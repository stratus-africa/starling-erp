/**
 * NimbusERP Super Admin Security Center
 *
 * Route: /super-admin/security
 *
 * Mission Control for Platform Security:
 *   - Platform Administrators & MFA Compliance
 *   - Active Platform Authentication Sessions
 *   - Login Activity, Geolocation, and Failed Sign-In Detection
 *   - Real-time Security Events & Threat Signals
 *   - Tenant Support Sessions & Impersonation Lifecycle
 *   - Platform Role & Permission Matrix
 *   - Immutable Audit Logging for all security mutations
 */

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/lib/typed-db";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_LABELS,
  PLATFORM_ROLE_DESCRIPTIONS,
  PLATFORM_PERMISSION_GROUPS,
  PLATFORM_ROLE_PERMISSIONS,
  PLATFORM_ROLES,
} from "@/lib/platform-permissions";
import type { PlatformRole } from "@/lib/platform-permissions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Activity,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  UserCheck,
  UserX,
  Users,
  Lock,
  Key,
  Globe,
  Headphones,
  Laptop,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  MoreHorizontal,
  LogOut,
  ShieldOff,
  Layers,
  FileText,
  AlertOctagon,
  Check,
  Siren,
  Server,
  ArrowRight,
  Eye,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/security")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.securityView}>
      <SecurityCenterPage />
    </PermissionGuard>
  ),
});

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface SecurityOverview {
  total_admins: number;
  active_admins: number;
  disabled_admins: number;
  mfa_enrolled_admins: number;
  mfa_compliance_rate: number;
  active_sessions_count: number;
  failed_logins_24h: number;
  high_risk_logins_24h: number;
  unresolved_security_events: number;
  critical_events_count: number;
  active_support_sessions: number;
  system_security_posture: "OPTIMAL" | "ATTENTION_REQUIRED" | "THREAT_DETECTED";
}

interface PlatformAdminRow {
  user_id: string;
  email: string;
  full_name: string | null;
  platform_role: string;
  is_active: boolean;
  mfa_enforced: boolean;
  mfa_enrolled: boolean;
  failed_logins: number;
  last_seen_at: string | null;
  granted_at: string;
  notes: string | null;
  active_sessions: number;
  total_count: number;
}

interface ActiveSessionRow {
  id: string;
  user_id: string;
  admin_email: string;
  admin_role: string;
  client_ip: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  location_hint: string | null;
  status: "active" | "revoked" | "expired";
  last_active_at: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
  minutes_remaining: number;
  total_count: number;
}

interface LoginActivityRow {
  id: string;
  user_id: string | null;
  email: string;
  status: "success" | "failed" | "blocked" | "mfa_required" | "mfa_failed";
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  risk_score: number;
  created_at: string;
  total_count: number;
}

interface SecurityEventRow {
  id: string;
  event_type: string;
  severity: "critical" | "warning" | "error" | "info";
  actor_id: string | null;
  actor_email: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  detail: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  total_count: number;
}

function SecurityCenterPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { canPlatform, adminProfile, endSupportSession } = usePlatformAuth();

  const canManageSecurity = canPlatform(PLATFORM_PERMISSIONS.securityManage);
  const canManageAdmins = canPlatform(PLATFORM_PERMISSIONS.adminsManage);

  const [activeTab, setActiveTab] = useState("overview");

  // Filter states
  const [adminSearch, setAdminSearch] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [loginSearch, setLoginSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");

  // Modals & Action states
  const [adminToChangeRole, setAdminToChangeRole] = useState<PlatformAdminRow | null>(null);
  const [newRoleSelection, setNewRoleSelection] = useState<string>("");
  const [roleChangeReason, setRoleChangeReason] = useState("");

  const [adminToToggleStatus, setAdminToToggleStatus] = useState<PlatformAdminRow | null>(null);
  const [statusToggleReason, setStatusToggleReason] = useState("");

  const [sessionToRevoke, setSessionToRevoke] = useState<ActiveSessionRow | null>(null);
  const [sessionRevokeReason, setSessionRevokeReason] = useState("");

  const [eventToResolve, setEventToResolve] = useState<SecurityEventRow | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const [selectedEventForDetail, setSelectedEventForDetail] = useState<SecurityEventRow | null>(null);

  // 1. Query: Security Overview Telemetry
  const { data: overview, refetch: refetchOverview, isRefetching } = useQuery<SecurityOverview>({
    queryKey: ["admin_security_center_overview"],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_get_security_center_overview");
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return (
        row || {
          total_admins: 0,
          active_admins: 0,
          disabled_admins: 0,
          mfa_enrolled_admins: 0,
          mfa_compliance_rate: 0,
          active_sessions_count: 0,
          failed_logins_24h: 0,
          high_risk_logins_24h: 0,
          unresolved_security_events: 0,
          critical_events_count: 0,
          active_support_sessions: 0,
          system_security_posture: "OPTIMAL",
        }
      );
    },
    refetchInterval: 15000,
  });

  // 2. Query: Platform Admins
  const { data: adminsList = [], isLoading: isLoadingAdmins } = useQuery<PlatformAdminRow[]>({
    queryKey: ["platform_admins_list", adminSearch],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_platform_admins", {
        _search: adminSearch.trim() || null,
        _limit: 50,
      });
      if (error) throw new Error(error.message);
      return (data as any[]) || [];
    },
  });

  // 3. Query: Active Sessions
  const { data: activeSessions = [], isLoading: isLoadingSessions } = useQuery<ActiveSessionRow[]>({
    queryKey: ["platform_active_sessions_list", sessionSearch],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_platform_sessions", {
        _search: sessionSearch.trim() || null,
        _status: "active",
        _limit: 50,
      });
      if (error) throw new Error(error.message);
      return (data as any[]) || [];
    },
    refetchInterval: 15000,
  });

  // 4. Query: Login Activity
  const { data: loginActivity = [], isLoading: isLoadingLogins } = useQuery<LoginActivityRow[]>({
    queryKey: ["platform_login_activity_list", loginSearch],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_login_activity", {
        _search: loginSearch.trim() || null,
        _limit: 50,
      });
      if (error) throw new Error(error.message);
      return (data as any[]) || [];
    },
    refetchInterval: 20000,
  });

  // 5. Query: Security Events
  const { data: securityEvents = [], isLoading: isLoadingEvents } = useQuery<SecurityEventRow[]>({
    queryKey: ["platform_security_events_list", eventSearch],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_security_events", {
        _search: eventSearch.trim() || null,
        _limit: 50,
      });
      if (error) throw new Error(error.message);
      return (data as any[]) || [];
    },
    refetchInterval: 20000,
  });

  // 6. Query: Active Support Sessions
  const { data: activeSupportSessions = [] } = useQuery({
    queryKey: ["active_support_sessions_for_security"],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_support_sessions", {
        _status: "active",
        _limit: 10,
      });
      if (error) throw new Error(error.message);
      return (data as any[]) || [];
    },
    refetchInterval: 15000,
  });

  // Handlers
  const handleToggleAdminStatus = async () => {
    if (!adminToToggleStatus) return;
    const targetStatus = !adminToToggleStatus.is_active;
    try {
      const { error } = await db.rpc("admin_set_platform_admin_status", {
        _admin_id: adminToToggleStatus.user_id,
        _is_active: targetStatus,
        _reason: statusToggleReason.trim() || undefined,
      });
      if (error) throw new Error(error.message);

      toast.success(
        targetStatus
          ? `Administrator account for ${adminToToggleStatus.email} enabled.`
          : `Administrator account for ${adminToToggleStatus.email} disabled and sessions revoked.`
      );
      setAdminToToggleStatus(null);
      setStatusToggleReason("");
      queryClient.invalidateQueries({ queryKey: ["platform_admins_list"] });
      queryClient.invalidateQueries({ queryKey: ["platform_active_sessions_list"] });
      refetchOverview();
    } catch (err: any) {
      toast.error(err.message || "Failed to update administrator status");
    }
  };

  const handleChangeRole = async () => {
    if (!adminToChangeRole || !newRoleSelection) return;
    try {
      const { error } = await db.rpc("admin_set_platform_admin_role", {
        _admin_id: adminToChangeRole.user_id,
        _new_role: newRoleSelection,
        _reason: roleChangeReason.trim() || undefined,
      });
      if (error) throw new Error(error.message);

      toast.success(`Platform role for ${adminToChangeRole.email} changed to ${newRoleSelection}.`);
      setAdminToChangeRole(null);
      setRoleChangeReason("");
      queryClient.invalidateQueries({ queryKey: ["platform_admins_list"] });
      refetchOverview();
    } catch (err: any) {
      toast.error(err.message || "Failed to change platform role");
    }
  };

  const handleRevokeSession = async () => {
    if (!sessionToRevoke) return;
    try {
      const { error } = await db.rpc("admin_revoke_platform_session", {
        _session_id: sessionToRevoke.id,
        _reason: sessionRevokeReason.trim() || undefined,
      });
      if (error) throw new Error(error.message);

      toast.success("Platform session revoked immediately.");
      setSessionToRevoke(null);
      setSessionRevokeReason("");
      queryClient.invalidateQueries({ queryKey: ["platform_active_sessions_list"] });
      refetchOverview();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke session");
    }
  };

  const handleRevokeAllSessions = async (userId: string, email: string) => {
    try {
      const { data, error } = await db.rpc("admin_revoke_all_admin_sessions", {
        _user_id: userId,
        _reason: "Bulk revocation triggered from Security Center",
      });
      if (error) throw new Error(error.message);

      toast.success(`Revoked ${data ?? 0} active sessions for ${email}.`);
      queryClient.invalidateQueries({ queryKey: ["platform_active_sessions_list"] });
      refetchOverview();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke sessions");
    }
  };

  const handleResolveEvent = async () => {
    if (!eventToResolve) return;
    try {
      const { error } = await db.rpc("admin_resolve_security_event", {
        _event_id: eventToResolve.id,
        _resolution_note: resolutionNote.trim() || undefined,
      });
      if (error) throw new Error(error.message);

      toast.success("Security event resolved.");
      setEventToResolve(null);
      setResolutionNote("");
      queryClient.invalidateQueries({ queryKey: ["platform_security_events_list"] });
      refetchOverview();
    } catch (err: any) {
      toast.error(err.message || "Failed to resolve security event");
    }
  };

  const getPostureBadge = (posture?: string) => {
    switch (posture) {
      case "THREAT_DETECTED":
        return (
          <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 text-xs px-2.5 py-1 flex items-center gap-1.5 animate-pulse">
            <ShieldAlert className="h-4 w-4" />
            Threat Detected — Immediate Review Advised
          </Badge>
        );
      case "ATTENTION_REQUIRED":
        return (
          <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 text-xs px-2.5 py-1 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Attention Required — Security Anomalies Present
          </Badge>
        );
      default:
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs px-2.5 py-1 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Optimal Security Posture — Zero Active Threats
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-primary" />
            Super Admin Security Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Platform-level threat telemetry, administrator access control, session governance, and incident mitigation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {getPostureBadge(overview?.system_security_posture)}

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchOverview()}
            disabled={isRefetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button asChild size="sm" variant="default" className="gap-1.5 bg-primary">
            <Link to="/super-admin/security/audit">
              <FileText className="h-3.5 w-3.5" />
              Audit Log
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Overview Telemetry */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Admins & MFA */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Administrators</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overview?.active_admins ?? 0}
              <span className="text-xs font-normal text-muted-foreground ml-1.5">
                ({overview?.disabled_admins ?? 0} disabled)
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Lock className="h-3 w-3 text-emerald-500" />
              <span>{overview?.mfa_compliance_rate ?? 0}% MFA Enforced</span>
            </div>
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Platform Sessions</CardTitle>
            <Laptop className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {overview?.active_sessions_count ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Revocable server-side authentication tokens
            </p>
          </CardContent>
        </Card>

        {/* Login Activity & Failed Attempts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Logins (24h)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {overview?.failed_logins_24h ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview?.high_risk_logins_24h ?? 0} high-risk IP detections
            </p>
          </CardContent>
        </Card>

        {/* Unresolved Incidents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Incidents</CardTitle>
            <Siren className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {overview?.unresolved_security_events ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview?.critical_events_count ?? 0} critical unresolved signals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Interactive Security Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto p-1 bg-muted/80 gap-1 w-full sm:w-auto">
          <TabsTrigger value="overview" className="text-xs gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Posture Overview
          </TabsTrigger>
          <TabsTrigger value="admins" className="text-xs gap-1.5">
            <Users className="h-3.5 w-3.5" /> Platform Admins ({adminsList.length})
          </TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs gap-1.5">
            <Laptop className="h-3.5 w-3.5" /> Active Sessions ({activeSessions.length})
          </TabsTrigger>
          <TabsTrigger value="logins" className="text-xs gap-1.5">
            <Key className="h-3.5 w-3.5" /> Login Activity ({loginActivity.length})
          </TabsTrigger>
          <TabsTrigger value="events" className="text-xs gap-1.5">
            <Siren className="h-3.5 w-3.5" /> Security Incidents ({securityEvents.length})
          </TabsTrigger>
          <TabsTrigger value="roles" className="text-xs gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Roles & Permissions
          </TabsTrigger>
          <TabsTrigger value="support" className="text-xs gap-1.5">
            <Headphones className="h-3.5 w-3.5" /> Support Sessions ({activeSupportSessions.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Overview & Posture ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Security Baseline & Compliance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Platform Defense & Control Matrix
                </CardTitle>
                <CardDescription className="text-xs">
                  Zero-trust security rules and authentication protections enforced platform-wide.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="font-semibold">MFA Enforcement Policy</p>
                      <p className="text-[11px] text-muted-foreground">
                        Two-factor authentication requirement for all platform administrators
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none">
                    Enforced
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="font-semibold">Append-Only Audit Log</p>
                      <p className="text-[11px] text-muted-foreground">
                        PostgreSQL trigger locks rows against modification and deletion
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none">
                    Immutable
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="font-semibold">Zero Credential Exposure</p>
                      <p className="text-[11px] text-muted-foreground">
                        Support sessions use time-bounded delegation without password sharing
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none">
                    Active
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="font-semibold">Instant Session Revocation</p>
                      <p className="text-[11px] text-muted-foreground">
                        Sever active JWT/refresh sessions server-side in under 1 second
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none">
                    Active
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions & High-Risk Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" />
                  Security Administrator Quick Actions
                </CardTitle>
                <CardDescription className="text-xs">
                  Immediate privileged remediation actions for authorized security officers.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-auto p-3 flex flex-col items-start gap-1 text-left justify-start"
                  onClick={() => setActiveTab("admins")}
                >
                  <Users className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-xs">Manage Admins</span>
                  <span className="text-[10px] text-muted-foreground">
                    Disable accounts & change roles
                  </span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto p-3 flex flex-col items-start gap-1 text-left justify-start"
                  onClick={() => setActiveTab("sessions")}
                >
                  <Laptop className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold text-xs">Revoke Sessions</span>
                  <span className="text-[10px] text-muted-foreground">
                    Terminate live authentications
                  </span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto p-3 flex flex-col items-start gap-1 text-left justify-start"
                  onClick={() => setActiveTab("logins")}
                >
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold text-xs">Failed Logins</span>
                  <span className="text-[10px] text-muted-foreground">
                    Review brute-force signals
                  </span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto p-3 flex flex-col items-start gap-1 text-left justify-start"
                  onClick={() => navigate({ to: "/super-admin/security/audit" })}
                >
                  <FileText className="h-4 w-4 text-emerald-500" />
                  <span className="font-semibold text-xs">Platform Audit</span>
                  <span className="text-[10px] text-muted-foreground">
                    Inspect immutable change logs
                  </span>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 2: Platform Administrators ── */}
        <TabsContent value="admins" className="space-y-4">
          <Card>
            <CardHeader className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base">Platform Administrators</CardTitle>
                <CardDescription className="text-xs">
                  Accounts authorized with platform-level privileges across NimbusERP.
                </CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <Input
                  placeholder="Search admin email or role…"
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Administrator</TableHead>
                    <TableHead>Platform Role</TableHead>
                    <TableHead>MFA Status</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Active Sessions</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingAdmins ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1 text-primary" />
                        Loading platform admins…
                      </TableCell>
                    </TableRow>
                  ) : adminsList.map((adm) => (
                    <TableRow key={adm.user_id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-xs">{adm.email}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            ID: {adm.user_id.slice(0, 8)}…
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-medium border-primary/30">
                          {PLATFORM_ROLE_LABELS[adm.platform_role as PlatformRole] || adm.platform_role}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {adm.mfa_enrolled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <ShieldCheck className="h-3.5 w-3.5" /> Enrolled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" /> Enforced (Pending)
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        {adm.is_active ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none text-[10px]">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            Disabled
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {adm.active_sessions} live
                        </Badge>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {adm.last_seen_at ? new Date(adm.last_seen_at).toLocaleString() : "Never"}
                      </TableCell>

                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Admin Actions</DropdownMenuLabel>
                            {canManageAdmins && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setAdminToChangeRole(adm);
                                  setNewRoleSelection(adm.platform_role);
                                }}
                              >
                                <Layers className="h-4 w-4 mr-2" />
                                Change Platform Role
                              </DropdownMenuItem>
                            )}

                            {canManageSecurity && (
                              <DropdownMenuItem
                                onClick={() => handleRevokeAllSessions(adm.user_id, adm.email)}
                              >
                                <LogOut className="h-4 w-4 mr-2" />
                                Revoke All Sessions
                              </DropdownMenuItem>
                            )}

                            {canManageAdmins && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setAdminToToggleStatus(adm)}
                                  className={adm.is_active ? "text-destructive" : "text-emerald-600"}
                                >
                                  {adm.is_active ? (
                                    <>
                                      <UserX className="h-4 w-4 mr-2" /> Disable Account
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="h-4 w-4 mr-2" /> Enable Account
                                    </>
                                  )}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Active Platform Sessions ── */}
        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base">Active Platform Sessions</CardTitle>
                <CardDescription className="text-xs">
                  Active authentication tokens and devices logged into the Super Admin console.
                </CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <Input
                  placeholder="Search session IP, email, or device…"
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Administrator</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>IP & Location</TableHead>
                    <TableHead>Device & Browser</TableHead>
                    <TableHead>Time Remaining</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead className="text-right">Revoke</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingSessions ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1 text-primary" />
                        Loading sessions…
                      </TableCell>
                    </TableRow>
                  ) : activeSessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No active sessions found matching criteria.
                      </TableCell>
                    </TableRow>
                  ) : activeSessions.map((sess) => (
                    <TableRow key={sess.id}>
                      <TableCell>
                        <span className="font-semibold text-xs">{sess.admin_email}</span>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {sess.admin_role}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col text-xs font-mono">
                          <span>{sess.client_ip || "Internal"}</span>
                          <span className="text-[10px] text-muted-foreground font-sans">
                            {sess.location_hint || "Direct Connection"}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span>{sess.browser || "Browser"} • {sess.os || "OS"}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {sess.device_type || "Desktop"}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                          {Math.round(sess.minutes_remaining)}m left
                        </span>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(sess.last_active_at).toLocaleTimeString()}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setSessionToRevoke(sess)}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Login Activity & Threat Detection ── */}
        <TabsContent value="logins" className="space-y-4">
          <Card>
            <CardHeader className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base">Login Activity & Failed Attempts</CardTitle>
                <CardDescription className="text-xs">
                  Real-time authentication log with risk score evaluation and anomaly detection.
                </CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <Input
                  placeholder="Filter by email, country, or IP…"
                  value={loginSearch}
                  onChange={(e) => setLoginSearch(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Account Email</TableHead>
                    <TableHead>Risk Score</TableHead>
                    <TableHead>IP & Location</TableHead>
                    <TableHead>Device / User Agent</TableHead>
                    <TableHead>Failure Reason</TableHead>
                    <TableHead className="text-right">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLogins ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1 text-primary" />
                        Loading login records…
                      </TableCell>
                    </TableRow>
                  ) : loginActivity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No login activity records found.
                      </TableCell>
                    </TableRow>
                  ) : loginActivity.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {log.status === "success" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none text-[10px]">
                            Success
                          </Badge>
                        ) : log.status === "mfa_required" ? (
                          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-none text-[10px]">
                            MFA Challenged
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            {log.status}
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="font-semibold text-xs">{log.email}</TableCell>

                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`font-mono text-[10px] ${
                            log.risk_score >= 50
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30"
                              : "text-muted-foreground"
                          }`}
                        >
                          Risk: {log.risk_score}/100
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col text-xs font-mono">
                          <span>{log.ip_address || "—"}</span>
                          <span className="text-[10px] text-muted-foreground font-sans">
                            {log.city ? `${log.city}, ${log.country}` : log.country || "—"}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={log.user_agent || ""}>
                        {log.user_agent || "—"}
                      </TableCell>

                      <TableCell className="text-xs text-rose-600 dark:text-rose-400">
                        {log.failure_reason || "—"}
                      </TableCell>

                      <TableCell className="text-right text-xs font-mono text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 5: Security Incidents ── */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base">Security Events & Incident Queue</CardTitle>
                <CardDescription className="text-xs">
                  Automated threat signals, rate-limit warnings, and anomalous activity detection.
                </CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <Input
                  placeholder="Search events or actors…"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Actor / IP</TableHead>
                    <TableHead>Tenant Context</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingEvents ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1 text-primary" />
                        Loading security events…
                      </TableCell>
                    </TableRow>
                  ) : securityEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        <ShieldCheck className="h-8 w-8 mx-auto mb-1 text-emerald-500 opacity-60" />
                        No active security incidents in queue.
                      </TableCell>
                    </TableRow>
                  ) : securityEvents.map((evt) => (
                    <TableRow key={evt.id}>
                      <TableCell>
                        <Badge
                          variant={evt.severity === "critical" ? "destructive" : "secondary"}
                          className="text-[10px] uppercase font-semibold"
                        >
                          {evt.severity}
                        </Badge>
                      </TableCell>

                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {evt.event_type}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span>{evt.actor_email || "System Signal"}</span>
                          {evt.ip_address && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {evt.ip_address}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-xs">
                        {evt.tenant_name || (
                          <span className="text-muted-foreground italic">Platform Scope</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {evt.resolved ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none text-[10px]">
                            Resolved
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-rose-600 border-rose-500/30 text-[10px]">
                            Open
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {new Date(evt.created_at).toLocaleString()}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setSelectedEventForDetail(evt)}
                          >
                            <Eye className="h-3 w-3 mr-1" /> Inspect
                          </Button>

                          {!evt.resolved && canManageSecurity && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                              onClick={() => setEventToResolve(evt)}
                            >
                              Resolve
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 6: Roles & Permissions Matrix ── */}
        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Platform Roles & Capabilities</CardTitle>
              <CardDescription className="text-xs">
                Granular permission assignments defined across platform roles according to the principle of least privilege.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  PLATFORM_ROLES.superAdmin,
                  PLATFORM_ROLES.securityAdmin,
                  PLATFORM_ROLES.platformAdmin,
                  PLATFORM_ROLES.supportAdmin,
                  PLATFORM_ROLES.billingAdmin,
                  PLATFORM_ROLES.readonly,
                ].map((role) => (
                  <div key={role} className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
                    <p className="font-semibold text-primary">{PLATFORM_ROLE_LABELS[role]}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {PLATFORM_ROLE_DESCRIPTIONS[role]}
                    </p>
                    <p className="font-mono text-[9px] text-muted-foreground/60">{role}</p>
                  </div>
                ))}
              </div>

              <div className="border rounded-lg overflow-x-auto max-h-96">
                <table className="w-full text-xs">
                  <thead className="bg-muted/70 sticky top-0">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-semibold">Permission Code</th>
                      <th className="px-3 py-2 text-left font-semibold">Label</th>
                      <th className="px-3 py-2 text-center font-semibold">Super Admin</th>
                      <th className="px-3 py-2 text-center font-semibold">Security Admin</th>
                      <th className="px-3 py-2 text-center font-semibold">Support Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLATFORM_PERMISSION_GROUPS.flatMap((grp) =>
                      grp.permissions.map((p) => (
                        <tr key={p.code} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                            {p.code}
                          </td>
                          <td className="px-3 py-1.5 font-medium">{p.label}</td>
                          <td className="px-3 py-1.5 text-center">
                            <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLES.securityAdmin].includes(p.code) ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLES.supportAdmin].includes(p.code) ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 7: Support Sessions ── */}
        <TabsContent value="support" className="space-y-4">
          <Card>
            <CardHeader className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base">Active Support Sessions & Tenant Impersonation</CardTitle>
                <CardDescription className="text-xs">
                  Active delegated sessions troubleshooting customer tenants.
                </CardDescription>
              </div>
              <Button asChild size="sm" variant="outline" className="text-xs gap-1">
                <Link to="/super-admin/support-sessions">
                  Support Sessions Console <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target Tenant</TableHead>
                    <TableHead>Impersonated User</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Time Remaining</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSupportSessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No active support sessions in progress.
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeSupportSessions.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-semibold text-xs">
                          {s.target_tenant_name}
                        </TableCell>
                        <TableCell className="text-xs">
                          {s.target_user_email || <span className="text-muted-foreground italic">General Context</span>}
                        </TableCell>
                        <TableCell className="text-xs">{s.admin_email}</TableCell>
                        <TableCell className="text-xs truncate max-w-xs">{s.reason}</TableCell>
                        <TableCell className="font-mono text-xs text-amber-600 font-semibold">
                          {Math.round(s.minutes_remaining)}m left
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => endSupportSession("Terminated from Security Center", s.id)}
                          >
                            Terminate
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Modal: Change Admin Role ── */}
      <Dialog
        open={Boolean(adminToChangeRole)}
        onOpenChange={(open) => !open && setAdminToChangeRole(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Modify Platform Role
            </DialogTitle>
            <DialogDescription className="text-xs">
              Change the platform role and permissions for{" "}
              <strong>{adminToChangeRole?.email}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select New Role</Label>
              <Select value={newRoleSelection} onValueChange={setNewRoleSelection}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select platform role" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLATFORM_ROLES).map(([key, roleName]) => (
                    <SelectItem key={roleName} value={roleName}>
                      {PLATFORM_ROLE_LABELS[roleName]} ({roleName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Administrative Reason</Label>
              <Textarea
                placeholder="e.g., Security promotion to Platform Admin following operational review"
                value={roleChangeReason}
                onChange={(e) => setRoleChangeReason(e.target.value)}
                className="text-xs resize-none"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminToChangeRole(null)}>
              Cancel
            </Button>
            <Button onClick={handleChangeRole} className="bg-primary">
              Confirm Role Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Enable / Disable Admin Account ── */}
      <Dialog
        open={Boolean(adminToToggleStatus)}
        onOpenChange={(open) => !open && setAdminToToggleStatus(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {adminToToggleStatus?.is_active ? (
                <UserX className="h-5 w-5 text-destructive" />
              ) : (
                <UserCheck className="h-5 w-5 text-emerald-500" />
              )}
              {adminToToggleStatus?.is_active
                ? "Disable Administrator Account"
                : "Enable Administrator Account"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {adminToToggleStatus?.is_active
                ? `Disabling ${adminToToggleStatus.email} will immediately revoke all active sessions and block console access.`
                : `Enabling ${adminToToggleStatus?.email} will restore platform console access according to their assigned role.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold">Reason for Action</Label>
            <Input
              placeholder="e.g., Temporary suspension pending credential audit"
              value={statusToggleReason}
              onChange={(e) => setStatusToggleReason(e.target.value)}
              className="text-xs"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminToToggleStatus(null)}>
              Cancel
            </Button>
            <Button
              variant={adminToToggleStatus?.is_active ? "destructive" : "default"}
              onClick={handleToggleAdminStatus}
            >
              {adminToToggleStatus?.is_active ? "Disable Account Now" : "Enable Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Revoke Active Session ── */}
      <Dialog
        open={Boolean(sessionToRevoke)}
        onOpenChange={(open) => !open && setSessionToRevoke(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <LogOut className="h-5 w-5" />
              Revoke Platform Session
            </DialogTitle>
            <DialogDescription className="text-xs">
              This will immediately terminate the session for{" "}
              <strong>{sessionToRevoke?.admin_email}</strong> (IP: {sessionToRevoke?.client_ip || "Internal"}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold">Revocation Justification</Label>
            <Input
              placeholder="e.g., Unrecognized device or suspicious concurrent session"
              value={sessionRevokeReason}
              onChange={(e) => setSessionRevokeReason(e.target.value)}
              className="text-xs"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSessionToRevoke(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevokeSession}>
              Revoke Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Resolve Security Event ── */}
      <Dialog
        open={Boolean(eventToResolve)}
        onOpenChange={(open) => !open && setEventToResolve(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Resolve Security Incident
            </DialogTitle>
            <DialogDescription className="text-xs">
              Close incident <strong>{eventToResolve?.event_type}</strong> and record resolution notes in the audit log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold">Resolution Note</Label>
            <Textarea
              placeholder="e.g., Verified with user; expected sign-in from approved branch VPN."
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              className="text-xs resize-none"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEventToResolve(null)}>
              Cancel
            </Button>
            <Button onClick={handleResolveEvent} className="bg-primary">
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Drawer: Inspect Security Event Details ── */}
      <Sheet
        open={Boolean(selectedEventForDetail)}
        onOpenChange={(open) => !open && setSelectedEventForDetail(null)}
      >
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-mono text-base flex items-center gap-2">
              <Siren className="h-5 w-5 text-primary" />
              {selectedEventForDetail?.event_type}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Logged at {selectedEventForDetail && new Date(selectedEventForDetail.created_at).toLocaleString()}
            </SheetDescription>
          </SheetHeader>

          {selectedEventForDetail && (
            <div className="mt-6 space-y-4 text-xs">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Severity:</span>
                  <Badge variant={selectedEventForDetail.severity === "critical" ? "destructive" : "secondary"}>
                    {selectedEventForDetail.severity}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actor:</span>
                  <span className="font-semibold">{selectedEventForDetail.actor_email || "System"}</span>
                </div>
                {selectedEventForDetail.ip_address && (
                  <div className="flex justify-between font-mono">
                    <span className="text-muted-foreground">IP:</span>
                    <span>{selectedEventForDetail.ip_address}</span>
                  </div>
                )}
                {selectedEventForDetail.tenant_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tenant:</span>
                    <span className="font-semibold">{selectedEventForDetail.tenant_name}</span>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Event Payload & Context
                </Label>
                <div className="rounded-lg border bg-muted/60 p-3 overflow-x-auto max-h-64">
                  <pre className="font-mono text-[11px]">
                    {JSON.stringify(selectedEventForDetail.detail, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
