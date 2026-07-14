import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bell, Moon, Search, Sun, HelpCircle, LogOut, User, Settings, Building2 } from "lucide-react";
import { useTheme } from "./theme-provider";
import { useRouterState, Link } from "@tanstack/react-router";
import { navGroups } from "@/lib/nav";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";

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
        {tenant && (
          <div className="hidden md:flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-xs">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{tenant.name}</span>
          </div>
        )}
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search customers, invoices, items…"
            className="h-8 w-72 pl-8 text-sm bg-muted/50 border-transparent focus-visible:bg-background" />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8"><HelpCircle className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] bg-destructive text-destructive-foreground">3</Badge>
        </Button>

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
