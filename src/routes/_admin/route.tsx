import { createFileRoute, Outlet, Navigate, Link } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Loader2, ShieldAlert } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_admin")({
  ssr: false,
  component: () => (
    <AuthProvider>
      <AdminGate />
    </AuthProvider>
  ),
});

function AdminGate() {
  const { session, loading, profile, roles } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (!session) return <Navigate to="/auth" />;
  if (!profile) return <Navigate to="/" />;
  if (!roles.includes("super_admin")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md text-center text-slate-200 space-y-3">
          <ShieldAlert className="h-10 w-10 text-amber-400 mx-auto" />
          <h2 className="text-lg font-semibold">Platform Console</h2>
          <p className="text-sm text-slate-400">This area is restricted to super administrators.</p>
          <Button asChild variant="secondary"><Link to="/">Back to workspace</Link></Button>
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
            <main className="flex-1 min-w-0">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

function AdminTopbar() {
  const { profile, signOut } = useAuth();
  const initials = (profile?.full_name ?? profile?.email ?? "??").split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-950/90 px-3 backdrop-blur">
      <SidebarTrigger className="h-8 w-8 text-slate-300" />
      <div className="text-sm font-medium text-slate-200">Platform Console</div>
      <div className="ml-auto flex items-center gap-2">
        <TenantSwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md pl-1 pr-2 py-1 hover:bg-slate-800 transition-colors">
              <Avatar className="h-7 w-7"><AvatarFallback className="bg-amber-500/20 text-amber-300 text-xs font-semibold ring-1 ring-amber-500/40">{initials}</AvatarFallback></Avatar>
              <div className="hidden md:flex flex-col items-start leading-tight">
                <span className="text-xs font-medium text-slate-100">{profile?.full_name ?? profile?.email}</span>
                <span className="text-[10px] text-amber-400">Super Admin</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Platform Console</DropdownMenuLabel>
            <div className="px-2 pb-1.5 text-xs text-muted-foreground">{profile?.email}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/">Exit to workspace</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => signOut()}><LogOut className="h-4 w-4 mr-2" /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
