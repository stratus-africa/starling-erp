/**
 * Super Admin — Support Sessions & Tenant Impersonation
 *
 * Route: /super-admin/support-sessions
 *
 * Security Principles:
 *   - Only authorized administrators with `platform.support.impersonate` can begin sessions.
 *   - Sessions are strictly server-side time-bounded (TTL 5m to 8h) with auto-expiry.
 *   - Zero credential or password exposure: uses existing auth/switching mechanism.
 *   - Every action performed during an active support session is correlated
 *     to the support session ID in the immutable platform audit log.
 *   - Any active session can be terminated immediately by the admin or revoked by Super Admins.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { db } from "@/lib/typed-db";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ShieldAlert,
  Headphones,
  UserCheck,
  Building2,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  LogOut,
  ExternalLink,
  Activity,
  Info,
  ShieldOff,
  RefreshCw,
  Play,
  FileText,
  Lock,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/support-sessions")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.supportView}>
      <SupportSessionsPage />
    </PermissionGuard>
  ),
});

interface SupportSessionRow {
  id: string;
  admin_id: string;
  admin_email: string;
  admin_name: string;
  target_tenant_id: string;
  target_tenant_name: string;
  target_user_id: string | null;
  target_user_email: string | null;
  target_user_name: string | null;
  reason: string;
  status: "active" | "ended" | "expired" | "revoked";
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  end_reason: string | null;
  is_revoked: boolean;
  revoked_at: string | null;
  client_ip: string | null;
  user_agent: string | null;
  minutes_remaining: number;
  actions_count: number;
  total_count: number;
}

interface SessionActionRow {
  id: string;
  created_at: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  detail: any;
  ip_address: string | null;
  user_agent: string | null;
}

function SupportSessionsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {
    canPlatform,
    supportSession: activeSelfSession,
    beginSupportSession,
    endSupportSession,
    revokeSupportSession,
    refresh,
  } = usePlatformAuth();

  const canImpersonate = canPlatform(PLATFORM_PERMISSIONS.supportImpersonate);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");

  // Modals state
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [selectedSessionForActions, setSelectedSessionForActions] = useState<SupportSessionRow | null>(null);
  const [sessionToRevoke, setSessionToRevoke] = useState<SupportSessionRow | null>(null);
  const [revocationReason, setRevocationReason] = useState("");

  // Start Session Form state
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("none");
  const [sessionReason, setSessionReason] = useState("");
  const [sessionTtl, setSessionTtl] = useState<string>("120"); // 2 hours default
  const [isStarting, setIsStarting] = useState(false);

  // Query: Sessions list
  const {
    data: sessionsData = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<SupportSessionRow[]>({
    queryKey: ["admin_support_sessions", searchTerm, statusFilter, tenantFilter],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_support_sessions", {
        _search: searchTerm.trim() || null,
        _status: statusFilter === "all" ? null : statusFilter,
        _tenant_id: tenantFilter === "all" ? null : tenantFilter,
        _limit: 100,
        _offset: 0,
      });

      if (error) throw new Error(error.message);
      return (data as any[]) || [];
    },
    refetchInterval: 15000, // Real-time poll every 15s for active session monitor
  });

  // Query: Tenants for dropdown
  const { data: tenants = [] } = useQuery({
    queryKey: ["platform_tenants_dropdown"],
    queryFn: async () => {
      const { data, error } = await db
        .from("tenants")
        .select("id, name, slug, status")
        .is("deleted_at", null)
        .order("name");

      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  // Query: Tenant users when tenant is selected in Start Modal
  const { data: tenantUsers = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["tenant_users_for_impersonate", selectedTenantId],
    queryFn: async () => {
      if (!selectedTenantId) return [];
      const { data, error } = await db.rpc("list_tenant_users", {
        _tenant_id: selectedTenantId,
        _limit: 100,
      });
      if (error) {
        // Fallback to profiles directly if RPC fails
        const { data: fallbackProfiles } = await db
          .from("profiles")
          .select("id, email, full_name, is_active")
          .eq("tenant_id", selectedTenantId)
          .limit(100);
        return fallbackProfiles || [];
      }
      return data || [];
    },
    enabled: Boolean(selectedTenantId),
  });

  // Query: Correlated actions for selected session
  const { data: sessionActions = [], isLoading: isLoadingActions } = useQuery<SessionActionRow[]>({
    queryKey: ["admin_support_session_actions", selectedSessionForActions?.id],
    queryFn: async () => {
      if (!selectedSessionForActions) return [];
      const { data, error } = await db.rpc("admin_get_support_session_actions", {
        _session_id: selectedSessionForActions.id,
      });
      if (error) throw new Error(error.message);
      return (data as any[]) || [];
    },
    enabled: Boolean(selectedSessionForActions),
  });

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = sessionsData.length;
    let active = 0;
    let today = 0;
    let revoked = 0;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    sessionsData.forEach((s) => {
      if (s.status === "active") active++;
      if (s.is_revoked || s.status === "revoked") revoked++;
      if (new Date(s.started_at) >= startOfToday) today++;
    });

    return { total, active, today, revoked };
  }, [sessionsData]);

  // Handler: Start session
  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) {
      toast.error("Please select a target tenant");
      return;
    }
    if (!sessionReason || sessionReason.trim().length < 5) {
      toast.error("Please enter a valid reason (at least 5 characters)");
      return;
    }

    try {
      setIsStarting(true);
      const targetUserId = selectedUserId && selectedUserId !== "none" ? selectedUserId : null;
      const ttlMinutes = parseInt(sessionTtl, 10) || 120;

      await beginSupportSession(selectedTenantId, sessionReason.trim(), ttlMinutes, targetUserId);

      toast.success("Support session started! Tenant context activated.");
      setIsStartModalOpen(false);
      setSelectedTenantId("");
      setSelectedUserId("none");
      setSessionReason("");
      queryClient.invalidateQueries({ queryKey: ["admin_support_sessions"] });

      // Offer immediate transition to workspace
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message || "Failed to begin support session");
    } finally {
      setIsStarting(false);
    }
  };

  // Handler: Revoke session
  const handleConfirmRevoke = async () => {
    if (!sessionToRevoke) return;
    try {
      await revokeSupportSession(sessionToRevoke.id, revocationReason.trim() || "Emergency administrative revocation");
      toast.success("Support session revoked immediately.");
      setSessionToRevoke(null);
      setRevocationReason("");
      queryClient.invalidateQueries({ queryKey: ["admin_support_sessions"] });
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke support session");
    }
  };

  // Handler: Terminate active session
  const handleEndSession = async (session: SupportSessionRow) => {
    try {
      await endSupportSession("Terminated by admin from console", session.id);
      toast.success("Support session terminated.");
      queryClient.invalidateQueries({ queryKey: ["admin_support_sessions"] });
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to end support session");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </Badge>
        );
      case "ended":
        return (
          <Badge variant="outline" className="text-muted-foreground border-muted">
            Ended
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Expired</Badge>
        );
      case "revoked":
        return (
          <Badge className="bg-destructive/15 text-destructive border-destructive/30 flex items-center gap-1">
            <ShieldOff className="h-3 w-3" />
            Revoked
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Headphones className="h-7 w-7 text-primary" />
            Support Sessions & Tenant Impersonation
          </h1>
          <p className="text-sm text-muted-foreground">
            Audit-tracked, temporary troubleshooting sessions for customer tenants without password sharing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {canImpersonate && (
            <Button size="sm" onClick={() => setIsStartModalOpen(true)} className="gap-1.5 bg-primary shadow-sm">
              <Play className="h-3.5 w-3.5 fill-current" />
              Start Support Session
            </Button>
          )}
        </div>
      </div>

      {/* Active Session Alert if current admin is in one */}
      {activeSelfSession && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                <ShieldAlert className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    You have an active support session for {activeSelfSession.targetTenantName}
                  </span>
                  <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-200 border-none text-[10px]">
                    {Math.round(activeSelfSession.minutesRemaining)} min remaining
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Reason: {activeSelfSession.reason}
                  {activeSelfSession.targetUserEmail && ` • Impersonating ${activeSelfSession.targetUserEmail}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => navigate({ to: "/" })}>
                <ExternalLink className="h-3.5 w-3.5" />
                Go to Workspace
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => endSupportSession("Ended from Support Sessions page")}
              >
                <LogOut className="h-3.5 w-3.5" />
                End My Session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{metrics.active}</div>
            <p className="text-xs text-muted-foreground">Currently impersonating</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions Today</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.today}</div>
            <p className="text-xs text-muted-foreground">Initiated since 00:00 UTC</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Impersonations</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total}</div>
            <p className="text-xs text-muted-foreground">Historical tracked sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revoked Sessions</CardTitle>
            <ShieldOff className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{metrics.revoked}</div>
            <p className="text-xs text-muted-foreground">Early administrative revokes</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by tenant, user email, admin, or reason…"
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>

              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger className="w-[180px]">
                  <Building2 className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                  <SelectValue placeholder="Tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tenants</SelectItem>
                  {tenants.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardHeader className="px-6 py-4">
          <CardTitle className="text-base font-semibold">Audit Records & Active Sessions</CardTitle>
          <CardDescription className="text-xs">
            Showing all recorded support sessions. Privileged actions are automatically correlated.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Target User</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Reason & Duration</TableHead>
                <TableHead>Started / Expired</TableHead>
                <TableHead className="text-center">Actions Correlated</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading support sessions…
                  </TableCell>
                </TableRow>
              ) : sessionsData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <Headphones className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <p className="font-medium text-foreground">No support sessions found</p>
                    <p className="text-xs">
                      {searchTerm || statusFilter !== "all" || tenantFilter !== "all"
                        ? "Try clearing your filters."
                        : "Start a support session to troubleshoot a tenant safely."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                sessionsData.map((session) => {
                  const isCurrentActive = session.status === "active";
                  return (
                    <TableRow key={session.id} className="group">
                      <TableCell>{getStatusBadge(session.status)}</TableCell>

                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {session.target_tenant_name}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {session.target_tenant_id.slice(0, 8)}…
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        {session.target_user_email ? (
                          <div className="flex flex-col">
                            <span className="font-medium text-xs flex items-center gap-1">
                              <UserCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                              {session.target_user_name || "User"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{session.target_user_email}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">General Tenant Context</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">{session.admin_name}</span>
                          <span className="text-[11px] text-muted-foreground">{session.admin_email}</span>
                          {session.client_ip && (
                            <span className="text-[10px] font-mono text-muted-foreground/80">
                              IP: {session.client_ip}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="max-w-xs">
                        <div className="flex flex-col">
                          <span className="text-xs truncate font-medium" title={session.reason}>
                            {session.reason}
                          </span>
                          {isCurrentActive ? (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                              {Math.round(session.minutes_remaining)}m remaining
                            </span>
                          ) : session.end_reason ? (
                            <span className="text-[11px] text-muted-foreground/80 truncate" title={session.end_reason}>
                              End: {session.end_reason}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span>{new Date(session.started_at).toLocaleString()}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {session.ended_at
                              ? `Ended: ${new Date(session.ended_at).toLocaleTimeString()}`
                              : `Expires: ${new Date(session.expires_at).toLocaleTimeString()}`}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className="cursor-pointer hover:bg-secondary/80 font-mono text-xs"
                          onClick={() => setSelectedSessionForActions(session)}
                        >
                          <Activity className="h-3 w-3 mr-1 text-primary" />
                          {session.actions_count}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Session Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setSelectedSessionForActions(session)}>
                              <FileText className="h-4 w-4 mr-2" />
                              View Audit Trail ({session.actions_count})
                            </DropdownMenuItem>

                            {isCurrentActive && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => navigate({ to: "/" })}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Enter Tenant Workspace
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleEndSession(session)}
                                  className="text-amber-600 dark:text-amber-400"
                                >
                                  <LogOut className="h-4 w-4 mr-2" />
                                  End Session
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setSessionToRevoke(session)}
                                  className="text-destructive font-medium"
                                >
                                  <ShieldOff className="h-4 w-4 mr-2" />
                                  Revoke Immediately
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Start Support Session Modal */}
      <Dialog open={isStartModalOpen} onOpenChange={setIsStartModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleStartSession}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Headphones className="h-5 w-5 text-primary" />
                Start Support Session
              </DialogTitle>
              <DialogDescription>
                Open a temporary, audited support session inside a customer tenant. No passwords or secrets are ever
                exposed.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Security Banner */}
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2 font-semibold">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  Strict Audit & Zero Password Policy
                </div>
                <p className="mt-1 opacity-90">
                  Every data query and mutation executed during this session is immutably correlated to your admin
                  account and this session record.
                </p>
              </div>

              {/* Target Tenant */}
              <div className="space-y-1.5">
                <Label htmlFor="tenant-select" className="text-xs font-semibold">
                  Target Tenant <span className="text-destructive">*</span>
                </Label>
                <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger id="tenant-select">
                    <SelectValue placeholder="Select target tenant…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {tenants.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.slug || t.id.slice(0, 8)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Impersonated Tenant User (Optional) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="user-select" className="text-xs font-semibold">
                    Target Tenant User (Optional)
                  </Label>
                  <span className="text-[11px] text-muted-foreground">Leave as general for tenant admin</span>
                </div>
                <Select
                  value={selectedUserId}
                  onValueChange={setSelectedUserId}
                  disabled={!selectedTenantId || isLoadingUsers}
                >
                  <SelectTrigger id="user-select">
                    <SelectValue
                      placeholder={
                        !selectedTenantId
                          ? "Select a tenant first…"
                          : isLoadingUsers
                            ? "Loading tenant users…"
                            : "General Tenant Session (No specific user)"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="none">General Tenant Session (Default)</SelectItem>
                    {tenantUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Session Duration / TTL */}
              <div className="space-y-1.5">
                <Label htmlFor="ttl-select" className="text-xs font-semibold">
                  Session Expiration (TTL)
                </Label>
                <Select value={sessionTtl} onValueChange={setSessionTtl}>
                  <SelectTrigger id="ttl-select">
                    <SelectValue placeholder="Select session TTL" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes (Quick inspection)</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="120">2 hours (Standard)</SelectItem>
                    <SelectItem value="240">4 hours</SelectItem>
                    <SelectItem value="480">8 hours (Extended troubleshooting)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Mandatory Reason */}
              <div className="space-y-1.5">
                <Label htmlFor="reason-input" className="text-xs font-semibold">
                  Reason / Ticket ID <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="reason-input"
                  rows={3}
                  placeholder="e.g., Resolving Ticket #48291 — Troubleshooting stock reconciliation discrepancies reported by customer."
                  value={sessionReason}
                  onChange={(e) => setSessionReason(e.target.value)}
                  className="resize-none text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Minimum 5 characters. Stored permanently in audit logs.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsStartModalOpen(false)} disabled={isStarting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isStarting || !selectedTenantId || sessionReason.trim().length < 5}
                className="gap-2 bg-primary"
              >
                {isStarting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Begin Session & Enter
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revocation Confirmation Dialog */}
      <Dialog open={Boolean(sessionToRevoke)} onOpenChange={(open) => !open && setSessionToRevoke(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <ShieldOff className="h-5 w-5" />
              Revoke Support Session Immediately
            </DialogTitle>
            <DialogDescription>
              This will instantly terminate the active support session for{" "}
              <strong>{sessionToRevoke?.target_tenant_name}</strong> and sever any active tenant operations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="revocation-reason" className="text-xs font-semibold">
              Revocation Reason
            </Label>
            <Input
              id="revocation-reason"
              placeholder="e.g., Suspected unauthorized operation or security review"
              value={revocationReason}
              onChange={(e) => setRevocationReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSessionToRevoke(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmRevoke}>
              Revoke Session Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correlated Actions & Audit Trail Sheet */}
      <Sheet
        open={Boolean(selectedSessionForActions)}
        onOpenChange={(open) => !open && setSelectedSessionForActions(null)}
      >
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Session Audit Trail & Actions
            </SheetTitle>
            <SheetDescription>
              Privileged activities executed during support session{" "}
              <span className="font-mono text-xs">{selectedSessionForActions?.id.slice(0, 8)}…</span> in{" "}
              <strong>{selectedSessionForActions?.target_tenant_name}</strong>.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Session Metadata Summary */}
            {selectedSessionForActions && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin:</span>
                  <span className="font-semibold">{selectedSessionForActions.admin_email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Tenant:</span>
                  <span className="font-semibold">{selectedSessionForActions.target_tenant_name}</span>
                </div>
                {selectedSessionForActions.target_user_email && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Impersonated User:</span>
                    <span className="font-semibold">{selectedSessionForActions.target_user_email}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reason:</span>
                  <span className="font-semibold">{selectedSessionForActions.reason}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started At:</span>
                  <span>{new Date(selectedSessionForActions.started_at).toLocaleString()}</span>
                </div>
              </div>
            )}

            <Separator />

            {/* Actions Timeline */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Correlated Audit Log Events ({sessionActions.length})
              </h4>

              {isLoadingActions ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                  Loading correlated actions…
                </div>
              ) : sessionActions.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground border rounded-lg">
                  <Activity className="h-6 w-6 mx-auto mb-1 opacity-40" />
                  No specific mutations were logged under this support session.
                </div>
              ) : (
                <div className="space-y-3">
                  {sessionActions.map((action) => (
                    <div key={action.id} className="rounded-lg border bg-card p-3 text-xs space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-primary font-mono">{action.action}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(action.created_at).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-[11px]">
                        {action.target_type && (
                          <span>
                            Target: <strong className="text-foreground">{action.target_type}</strong>
                            {action.target_label && ` (${action.target_label})`}
                          </span>
                        )}
                        {action.ip_address && <span>IP: {action.ip_address}</span>}
                      </div>

                      {action.detail && Object.keys(action.detail).length > 0 && (
                        <div className="rounded bg-muted p-2 font-mono text-[10px] overflow-x-auto max-h-40">
                          <pre>{JSON.stringify(action.detail, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
