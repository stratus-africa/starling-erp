import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

// ─── Route label map ──────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  "/super-admin":                "Dashboard",
  "/super-admin/tenants":        "Tenants",
  "/super-admin/users":          "Users",
  "/super-admin/support-sessions":"Support Sessions",
  "/super-admin/plans":          "Plans",
  "/super-admin/subscriptions":  "Subscriptions",
  "/super-admin/payments":       "Payments",
  "/super-admin/invoices":       "Invoices",
  "/super-admin/features":       "Feature Flags",
  "/super-admin/announcements":  "Announcements",
  "/super-admin/settings":       "Settings",
  "/super-admin/integrations":   "Integrations",
  "/super-admin/system":         "System Health",
  "/super-admin/errors":         "Errors",
  "/super-admin/jobs":           "Background Jobs",
  "/super-admin/api":            "API",
  "/super-admin/usage":          "Usage",
  "/super-admin/admins":         "Platform Admins",
  "/super-admin/roles":          "Roles & Permissions",
  "/super-admin/sessions":       "Sessions",
  "/super-admin/security-events":"Security Events",
  "/super-admin/audit":          "Audit Log",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SuperAdminBreadcrumbs() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const crumbs = useMemo(() => {
    const base = { label: "Super Admin", href: "/super-admin" };

    // Normalise trailing slash
    const clean = pathname.replace(/\/$/, "") || "/super-admin";

    if (clean === "/super-admin") return [base];

    const label = ROUTE_LABELS[clean];

    // Handle dynamic segments like /super-admin/tenants/[id]
    if (!label) {
      const parts = clean.split("/").filter(Boolean); // ["super-admin", "tenants", "abc123"]
      const section = "/" + parts.slice(0, 2).join("/"); // "/super-admin/tenants"
      const sectionLabel = ROUTE_LABELS[section] ?? parts[1];
      return [
        base,
        { label: sectionLabel, href: section },
        { label: parts[2]?.slice(0, 8) + "…", href: clean },
      ];
    }

    return [base, { label, href: clean }];
  }, [pathname]);

  return (
    <nav className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <span className="text-muted-foreground/40 shrink-0">/</span>}
          <Link
            to={crumb.href as never}
            className={`truncate ${
              i === crumbs.length - 1
                ? "text-foreground font-medium"
                : "hover:text-foreground transition-colors"
            }`}
          >
            {crumb.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
