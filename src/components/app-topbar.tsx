import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Moon, Sun, HelpCircle, LogOut, User, Settings, ShieldCheck } from "lucide-react";
import { useTheme } from "./theme-provider";
import { useRouterState, Link } from "@tanstack/react-router";
import { navGroups } from "@/lib/nav";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { TenantSwitcher } from "./tenant-switcher";
import { GlobalSearch } from "./global-search";
import { NotificationCenter } from "./notification-center";

function useBreadcrumbs() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return useMemo(() => {
    const all = navGroups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
    const match = all.find((i) => i.url === pathname);
    if (!match) return [{ label: "Dashboard", href: "/" }];
    if (match.url === "/") return [{ label: "Dashboard", href: "/" }];
    return [{ label: match.group, href: match.url }, { label: match.title, href: match.url }];
  }, [pathname]);
}

export function AppTopbar() {
  const { theme, toggle } = useTheme();
  const crumbs = useBreadcrumbs();
  const { profile, tenant, roles, signOut } = useAuth();
  const initials = (profile?.full_name ?? profile?.email ?? "??").split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const primaryRole = roles[0]?.replace("_", " ") ?? "Member";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur">
      <SidebarTrigger className="h-8 w-8" />
      <Separator orientation="vertical" className="h-5" />
      <nav className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={c.href + i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground/40">/</span>}
            <Link to={c.href} className={i === crumbs.length - 1 ? "text-foreground font-medium" : "hover:text-foreground"}>
              {c.label}
            </Link>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {roles.includes("super_admin") && (
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300">
            <Link to="/tenants"><ShieldCheck className="h-3.5 w-3.5" /> Platform Console</Link>
          </Button>
        )}
        <TenantSwitcher />
        <GlobalSearch />


        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8"><HelpCircle className="h-4 w-4" /></Button>
        <NotificationCenter />

        <Separator orientation="vertical" className="h-6" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md pl-1 pr-2 py-1 hover:bg-muted transition-colors">
              <Avatar className="h-7 w-7"><AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials}</AvatarFallback></Avatar>
              <div className="hidden md:flex flex-col items-start leading-tight">
                <span className="text-xs font-medium">{profile?.full_name ?? profile?.email}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{primaryRole}</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{tenant?.name ?? "Workspace"}</DropdownMenuLabel>
            <div className="px-2 pb-1.5 text-xs text-muted-foreground">{profile?.email}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem><User className="h-4 w-4 mr-2" /> Profile</DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/settings/company"><Settings className="h-4 w-4 mr-2" /> Workspace settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => signOut()}><LogOut className="h-4 w-4 mr-2" /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
