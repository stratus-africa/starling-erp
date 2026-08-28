/**
 * Super Admin Shell — /super-admin
 *
 * Security layers:
 *   1. Unauthenticated → /auth
 *   2. No Supabase session → /auth
 *   3. admin_ping() RPC returns false (not in platform_admins + user_roles) → wall
 *   4. Every child page additionally calls canPlatform(requiredPermission) before
 *      rendering its content.
 *
 * This layout is completely isolated from the tenant /_authenticated layout.
 * It uses its own providers, its own sidebar, and its own topbar.
 * No tenant UI components leak in; no super-admin components leak out.
 */

import { createFileRoute, Outlet, Navigate, Link, useRouterState } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { PlatformAuthProvider, usePlatformAuth } from "@/hooks/use-platform-auth";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "@/components/super-admin/super-admin-sidebar";
import { SuperAdminBreadcrumbs } from "@/components/super-admin/super-admin-breadcrumbs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, ExternalLink, Loader2, LogOut, ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PLATFORM_ROLE_LABELS } from "@/lib/platform-permissions";
import type { PlatformRole } from "@/lib/platform-permissions";

// ─── Route definition ─────────────────────────────────────────────────────────

export const Route = createFileRoute("/_admin")({
  ssr: false,
  component: () => (
    <AuthProvider>
      <PlatformAuthProvider>
        <SuperAdminGate />
      </PlatformAuthProvider>
    </AuthProvider>
  ),
});

// ─── Gate — DB-enforced guard ─────────────────────────────────────────────────

function SuperAdminGate() {
  const { session, loading: authLoading } = useAuth();
  const { isPlatformAdmin, loading: platformLoading } = usePlatformAuth();

  if (authLoading || platformLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Verifying platform access…</p>
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" />;

  // DB-level check failed — render hard wall, not a redirect
  if (!isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-7 w-7 text-destructive" />
            </div>
          </div>
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            The Super Admin area is restricted to platform administrators. Your account has not been granted platform
            access.
          </p>
          <p className="text-xs text-muted-foreground/60">
            If you require access, contact a platform super administrator.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">Return to workspace</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in as another user</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <SuperAdminSidebar />
        <SidebarInset className="min-w-0 flex-1">
          <SuperAdminTopbar />
          <SupportSessionBanner />
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

function SuperAdminTopbar() {
  const { profile } = useAuth();
  const { adminProfile, supportSession, endSupportSession } = usePlatformAuth();
  const navigate = useNavigate();

  const displayName = adminProfile?.fullName ?? adminProfile?.email ?? profile?.full_name ?? "Admin";
  const displayEmail = adminProfile?.email ?? profile?.email ?? "";
  const initials = displayName
    .split(/\s+/)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const roleLabel = adminProfile?.platformRole
    ? (PLATFORM_ROLE_LABELS[adminProfile.platformRole as PlatformRole] ?? adminProfile.platformRole)
    : "Platform Admin";

  const handleSignOut = async () => {
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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="h-8 w-8" />
      <Separator orientation="vertical" className="h-5" />

      {/* Breadcrumbs */}
      <SuperAdminBreadcrumbs />

      <div className="ml-auto flex items-center gap-2">
        {/* Platform badge */}
        <Badge
          variant="outline"
          className="hidden sm:flex gap-1 text-[10px] border-amber-500/40 bg-amber-500/8 text-amber-700 dark:text-amber-300"
        >
          <ShieldCheck className="h-3 w-3" />
          Platform Admin
        </Badge>

        <Separator orientation="vertical" className="h-5 hidden sm:block" />

        {/* Exit to tenant workspace */}
        <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 text-xs hidden sm:flex">
          <Link to="/">
            <ExternalLink className="h-3.5 w-3.5" />
            Workspace
          </Link>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md pl-1 pr-2 py-1 hover:bg-muted transition-colors">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold ring-1 ring-amber-500/30">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start leading-tight">
                <span className="text-xs font-medium">{displayName}</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400">{roleLabel}</span>
              </div>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span>Super Admin Console</span>
              <span className="text-xs font-normal text-muted-foreground">{displayEmail}</span>
            </DropdownMenuLabel>
            <div className="px-2 pb-1.5">
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">
                {roleLabel}
              </Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/">
                <ExternalLink className="h-4 w-4 mr-2" />
                Exit to tenant workspace
              </Link>
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

// ─── Support session banner ───────────────────────────────────────────────────

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
          ? "bg-destructive/8 border-destructive/20 text-destructive"
          : "bg-amber-500/8 border-amber-500/20 text-amber-700 dark:text-amber-300"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          Viewing tenant <span className="font-semibold">{supportSession.targetTenantName}</span> —{" "}
          {supportSession.reason}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`tabular-nums ${isExpiringSoon ? "font-semibold" : "opacity-70"}`}>{minsLeft} min left</span>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={handleEnd}>
          End session
        </Button>
      </div>
    </div>
  );
}
