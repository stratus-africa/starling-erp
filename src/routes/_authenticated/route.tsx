import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { featureForPath } from "@/lib/features";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  ),
});

function Gate() {
  const { session, loading, profile, hasFeature } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!session) return <Navigate to="/auth" />;
  if (!profile?.tenant_id) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold">Setting up your workspace…</h2>
          <p className="text-sm text-muted-foreground">If this persists, please refresh the page.</p>
        </div>
      </div>
    );
  }
  const requiredFeature = featureForPath(pathname);
  if (requiredFeature && !hasFeature(requiredFeature)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold">Feature not available</h2>
          <p className="text-sm text-muted-foreground">Your current plan does not include this module. Contact your administrator to enable the feature.</p>
        </div>
      </div>
    );
  }
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="min-w-0 flex-1">
          <AppTopbar />
          <main className="flex-1 min-w-0"><Outlet /></main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
