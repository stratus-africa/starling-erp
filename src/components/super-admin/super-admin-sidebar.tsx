import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity, AlertTriangle, BarChart3, Bell, Building2,
  CreditCard, FileText, Flag, Globe, Layers, LayoutDashboard,
  Loader, MessageSquare, ReceiptText, Server, Settings2,
  ShieldCheck, Siren, Terminal, Users, Wallet, Zap,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

// ─── Navigation structure ─────────────────────────────────────────────────────

interface NavItem {
  title:       string;
  url:         string;
  icon:        React.ElementType;
  permission?: string;   // if set, item is hidden when canPlatform returns false
}

interface NavGroup {
  label:       string;
  items:       NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Super Admin",
    items: [
      { title: "Dashboard", url: "/super-admin", icon: LayoutDashboard,
        permission: PLATFORM_PERMISSIONS.dashboardView },
    ],
  },
  {
    label: "Customers",
    items: [
      { title: "Tenants",          url: "/super-admin/tenants",          icon: Building2,
        permission: PLATFORM_PERMISSIONS.tenantsView },
      { title: "Users",            url: "/super-admin/users",            icon: Users,
        permission: PLATFORM_PERMISSIONS.usersView },
      { title: "Support Sessions", url: "/super-admin/support-sessions", icon: MessageSquare,
        permission: PLATFORM_PERMISSIONS.supportView },
    ],
  },
  {
    label: "Billing",
    items: [
      { title: "Plans",         url: "/super-admin/plans",         icon: Layers,
        permission: PLATFORM_PERMISSIONS.plansView },
      { title: "Subscriptions", url: "/super-admin/subscriptions", icon: ReceiptText,
        permission: PLATFORM_PERMISSIONS.billingView },
      { title: "Payments",      url: "/super-admin/payments",      icon: CreditCard,
        permission: PLATFORM_PERMISSIONS.billingView },
      { title: "Invoices",      url: "/super-admin/invoices",      icon: FileText,
        permission: PLATFORM_PERMISSIONS.billingView },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Feature Flags",  url: "/super-admin/features",      icon: Flag,
        permission: PLATFORM_PERMISSIONS.featuresView },
      { title: "Announcements",  url: "/super-admin/announcements", icon: Bell,
        permission: PLATFORM_PERMISSIONS.announcementsView },
      { title: "Settings",       url: "/super-admin/settings",      icon: Settings2,
        permission: PLATFORM_PERMISSIONS.settingsView },
      { title: "Integrations",   url: "/super-admin/integrations",  icon: Zap,
        permission: PLATFORM_PERMISSIONS.settingsView },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { title: "System Health",    url: "/super-admin/system",      icon: Activity,
        permission: PLATFORM_PERMISSIONS.systemView },
      { title: "Errors",           url: "/super-admin/errors",      icon: AlertTriangle,
        permission: PLATFORM_PERMISSIONS.systemView },
      { title: "Background Jobs",  url: "/super-admin/jobs",        icon: Loader,
        permission: PLATFORM_PERMISSIONS.systemView },
      { title: "API",              url: "/super-admin/api",         icon: Terminal,
        permission: PLATFORM_PERMISSIONS.systemView },
      { title: "Usage",            url: "/super-admin/usage",       icon: BarChart3,
        permission: PLATFORM_PERMISSIONS.systemView },
    ],
  },
  {
    label: "Security",
    items: [
      { title: "Platform Admins",    url: "/super-admin/admins",          icon: ShieldCheck,
        permission: PLATFORM_PERMISSIONS.adminsView },
      { title: "Roles & Permissions",url: "/super-admin/roles",           icon: Layers,
        permission: PLATFORM_PERMISSIONS.adminsView },
      { title: "Sessions",           url: "/super-admin/sessions",        icon: Globe,
        permission: PLATFORM_PERMISSIONS.securityView },
      { title: "Security Events",    url: "/super-admin/security-events", icon: Siren,
        permission: PLATFORM_PERMISSIONS.securityView },
      { title: "Audit Log",          url: "/super-admin/audit",           icon: Server,
        permission: PLATFORM_PERMISSIONS.auditView },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SuperAdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { canPlatform } = usePlatformAuth();

  return (
    <Sidebar collapsible="icon" className="border-r">
      {/* Logo / brand */}
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30">
            <ShieldCheck className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-sidebar-foreground truncate">
                NimbusERP
              </span>
              <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Super Admin
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((group) => {
          // Filter items the current admin has permission for
          const visibleItems = group.items.filter((item) =>
            !item.permission || canPlatform(item.permission as any),
          );
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label}>
              {!collapsed && (
                <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    // Exact match for dashboard, prefix match for children
                    const isActive = item.url === "/super-admin"
                      ? pathname === "/super-admin" || pathname === "/super-admin/"
                      : pathname.startsWith(item.url);

                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                          <Link to={item.url as never} className="flex items-center gap-2.5">
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
