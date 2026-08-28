/**
 * Platform Console route guard
 *
 * Security model:
 *   1. Unauthenticated → redirect to /auth
 *   2. Authenticated but NOT a platform admin → access-denied wall
 *      (platform admin status is verified by admin_ping() RPC which checks
 *       BOTH user_roles.super_admin AND platform_admins table server-side)
 *   3. Authenticated + confirmed platform admin → render console
 *
 * The old pattern checked `roles.includes("super_admin")` — a value set
 * from the client-side user_roles query.  That check is now secondary:
 * the definitive check is the admin_ping() RPC inside PlatformAuthProvider,
 * which runs is_platform_admin() in SECURITY DEFINER context and requires
 * both the user_roles row AND a live platform_admins row.
 *
 * The AuthProvider from the tenant app is intentionally NOT re-used here.
 * Platform admins have their own context (PlatformAuthProvider) so the
 * two permission systems remain isolated.
 */

import { createFileRoute, Outlet, Navigate, Link } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { PlatformAuthProvider, usePlatformAuth } from "@/hooks/use-platform-auth";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogOut, Loader2, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin")({
  ssr: false,
  component: () => (
    // Both providers are needed: AuthProvider supplies the base session/profile
    // used by TenantSwitcher and signOut; PlatformAuthProvider handles the
    // platform-specific admin check and permission cache.
    <AuthProvider>
      <PlatformAuthProvider>
        <AdminGate />
      </PlatformAuthProvider>
    </AuthProvider>
  ),
});

// ─── Gate ─────────────────────────────────────────────────────────────────────

function AdminGate() {
  const { session, loading: authLoading } = useAuth();
  const { isPlatformAdmin, loading: platformLoading } = usePlatformAuth();

  const loading = authLoading || platformLoading;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Not logged in at all
  if (!session) return <Navigate to="/auth" />;

  // Logged in but not a platform admin (DB check failed)
  if (!isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md text-center text-slate-200 space-y-3">
          <ShieldAlert className="h-10 w-10 text-amber-400 mx-auto" />
          <h2 className="text-lg font-semibold">Platform Console</h2>
          <p className="text-sm text-slate-400">
            This area is restricted to platform administrators. Your account does not have platform admin access.
          </p>
          <p className="text-xs text-slate-500">
            If you believe this is an error, contact your platform administrator.
          </p>
          <Button asChild variant="secondary">
            <Link to="/">Return to workspace</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dark">
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-slate-950 text-slate-100">
          <AdminSidebar />
          <SidebarInset className="min-w-0 flex-1 bg-slate-950">
            <AdminTopbar />
            {/* Support session banner — shown whenever admin is inside a tenant */}
            <SupportSessionBanner />
            <main className="flex-1 min-w-0">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

function AdminTopbar() {
  const { profile } = useAuth();
  const { adminProfile, endSupportSession, supportSession } = usePlatformAuth();
  const navigate = useNavigate();

  const initials = (adminProfile?.fullName ?? adminProfile?.email ?? profile?.full_name ?? "??")
    .split(/\s+/)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel = adminProfile?.platformRole
    ? adminProfile.platformRole.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Platform Admin";

  const handleSignOut = async () => {
    // End any active support session before signing out
    if (supportSession) {
      try {
        await endSupportSession("Signed out");
      } catch {
        /* ignore */
      }
    }
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-950/90 px-3 backdrop-blur">
      <SidebarTrigger className="h-8 w-8 text-slate-300" />
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-medium text-slate-200">Platform Console</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <TenantSwitcher />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md pl-1 pr-2 py-1 hover:bg-slate-800 transition-colors">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-amber-500/20 text-amber-300 text-xs font-semibold ring-1 ring-amber-500/40">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start leading-tight">
                <span className="text-xs font-medium text-slate-100">
                  {adminProfile?.fullName ?? adminProfile?.email ?? profile?.full_name}
                </span>
                <span className="text-[10px] text-amber-400">{roleLabel}</span>
              </div>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span>Platform Console</span>
              <span className="text-xs font-normal text-muted-foreground">{adminProfile?.email ?? profile?.email}</span>
            </DropdownMenuLabel>
            <div className="px-2 pb-1.5">
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                {roleLabel}
              </Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/">Exit to tenant workspace</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

// ─── Support Session Banner ───────────────────────────────────────────────────
// Displayed whenever the platform admin is operating inside a tenant's context.
// This is a critical UX safety mechanism — makes impersonation always visible.

function SupportSessionBanner() {
  const { supportSession, endSupportSession } = usePlatformAuth();

  if (!supportSession) return null;

  const minsLeft = Math.round(supportSession.minutesRemaining);
  const isExpiringSoon = minsLeft <= 15;

  const handleEnd = async () => {
    try {
      await endSupportSession("Ended from banner");
      toast.success("Support session ended. Returned to admin context.");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to end support session");
    }
  };

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-xs font-medium border-b ${
        isExpiringSoon
          ? "bg-red-900/40 border-red-700/40 text-red-300"
          : "bg-amber-900/30 border-amber-700/30 text-amber-300"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          Support session active inside <span className="font-semibold">{supportSession.targetTenantName}</span> —{" "}
          {supportSession.reason}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={isExpiringSoon ? "text-red-400 font-semibold" : "text-amber-400/70"}>
          {minsLeft} min remaining
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px] border-amber-600/40 hover:bg-amber-900/40 text-amber-300"
          onClick={handleEnd}
        >
          End session
        </Button>
      </div>
    </div>
  );
}
