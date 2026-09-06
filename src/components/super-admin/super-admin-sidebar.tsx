import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  FileText,
  Flag,
  Globe,
  Layers,
  LayoutDashboard,
  Loader,
  MessageSquare,
  ReceiptText,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Terminal,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

// ─── Navigation structure ─────────────────────────────────────────────────────

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  permission?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Super Admin",
    items: [
      {
        title: "Dashboard",
        url: "/super-admin",
        icon: LayoutDashboard,
        permission: PLATFORM_PERMISSIONS.dashboardView,
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        title: "Tenants",
        url: "/super-admin/tenants",
        icon: Building2,
        permission: PLATFORM_PERMISSIONS.tenantsView,
      },
      {
        title: "Users",
        url: "/super-admin/users",
        icon: Users,
        permission: PLATFORM_PERMISSIONS.usersView,
      },
      {
        title: "Support Sessions",
        url: "/super-admin/support-sessions",
        icon: MessageSquare,
        permission: PLATFORM_PERMISSIONS.supportView,
      },
    ],
  },
  {
    label: "Billing",
    items: [
      {
        title: "Plans",
        url: "/super-admin/billing/plans",
        icon: Layers,
        permission: PLATFORM_PERMISSIONS.plansView,
      },
      {
        title: "Subscriptions",
        url: "/super-admin/billing/subscriptions",
        icon: ReceiptText,
        permission: PLATFORM_PERMISSIONS.billingView,
      },
      {
        title: "Payments",
        url: "/super-admin/payments",
        icon: CreditCard,
        permission: PLATFORM_PERMISSIONS.billingView,
      },
      {
        title: "Invoices",
        url: "/super-admin/invoices",
        icon: FileText,
        permission: PLATFORM_PERMISSIONS.billingView,
      },
    ],
  },
  {
    label: "Platform",
    items: [
      {
        title: "Feature Flags",
        url: "/super-admin/platform/features",
        icon: Flag,
        permission: PLATFORM_PERMISSIONS.featuresView,
      },
      {
        title: "Announcements",
        url: "/super-admin/announcements",
        icon: Bell,
        permission: PLATFORM_PERMISSIONS.announcementsView,
      },
      {
        title: "Settings",
        url: "/super-admin/settings",
        icon: Settings2,
        permission: PLATFORM_PERMISSIONS.settingsView,
      },
      {
        title: "Integrations",
        url: "/super-admin/integrations",
        icon: Zap,
        permission: PLATFORM_PERMISSIONS.settingsView,
      },
    ],
  },
  {
    label: "Monitoring",
    items: [
      {
        title: "System Health",
        url: "/super-admin/system",
        icon: Activity,
        permission: PLATFORM_PERMISSIONS.systemView,
      },
      {
        title: "Errors",
        url: "/super-admin/errors",
        icon: AlertTriangle,
        permission: PLATFORM_PERMISSIONS.systemView,
      },
      {
        title: "Background Jobs",
        url: "/super-admin/jobs",
        icon: Loader,
        permission: PLATFORM_PERMISSIONS.systemView,
      },
      {
        title: "API",
        url: "/super-admin/api",
        icon: Terminal,
        permission: PLATFORM_PERMISSIONS.systemView,
      },
      {
        title: "Usage",
        url: "/super-admin/usage",
        icon: BarChart3,
        permission: PLATFORM_PERMISSIONS.systemView,
      },
    ],
  },
  {
    label: "Security",
    items: [
      {
        title: "Security Center",
        url: "/super-admin/security",
        icon: ShieldAlert,
        permission: PLATFORM_PERMISSIONS.securityView,
      },
      {
        title: "Platform Admins",
        url: "/super-admin/admins",
        icon: ShieldCheck,
        permission: PLATFORM_PERMISSIONS.adminsView,
      },
      {
        title: "Roles & Permissions",
        url: "/super-admin/roles",
        icon: Layers,
        permission: PLATFORM_PERMISSIONS.adminsView,
      },
      {
        title: "Sessions",
        url: "/super-admin/sessions",
        icon: Globe,
        permission: PLATFORM_PERMISSIONS.securityView,
      },
      {
        title: "Security Events",
        url: "/super-admin/security-events",
        icon: Siren,
        permission: PLATFORM_PERMISSIONS.securityView,
      },
      {
        title: "Audit Log",
        url: "/super-admin/security/audit",
        icon: Server,
        permission: PLATFORM_PERMISSIONS.auditView,
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SuperAdminSidebar() {
  const { canPlatform } = usePlatformAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar className="border-r border-border/70 bg-card">
      <SidebarHeader className="h-14 flex items-center px-4 border-b border-border/70">
        <div className="flex items-center gap-2 font-bold text-sm text-foreground">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-extrabold text-xs">
            N
          </div>
          <span>Nimbus Super Admin</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {NAV.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (!item.permission) return true;
            return canPlatform(item.permission as any);
          });

          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-3 py-1">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    const isActive =
                      pathname === item.url || (item.url !== "/super-admin" && pathname.startsWith(item.url));
                    const Icon = item.icon;

                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className={`text-xs h-8 px-3 rounded-md transition-colors ${
                            isActive
                              ? "bg-primary/10 text-primary font-semibold"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          }`}
                        >
                          <Link to={item.url as any}>
                            <Icon className="h-4 w-4 mr-2 shrink-0" />
                            <span>{item.title}</span>
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
