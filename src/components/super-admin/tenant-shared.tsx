/**
 * Shared types, helpers, and micro-components for the Tenant Management module.
 *
 * Used by:
 *   /super-admin/tenants        (list page)
 *   /super-admin/tenants/$id    (detail page)
 *
 * Nothing here calls RPCs or uses hooks — it is pure presentational logic
 * so it can be imported freely without causing re-render issues.
 */

// ─── Core types ───────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  currency: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TenantSubscription {
  id: string;
  status: string;
  plan_id: string;
  plan_name: string;
  plan_code: string;
  price_usd: number;
  max_users: number | null;
  max_storage_gb: number | null;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string | null;
  cancelled_at: string | null;
  external_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface TenantUser {
  id: string;
  email: string;
  full_name: string | null;
  /** Array of app_role strings assigned to this user in this tenant */
  roles: string[] | null;
  created_at: string;
  updated_at: string;
}

// ─── Status definitions ───────────────────────────────────────────────────────
//
// These statuses are used across BOTH tenants.status (the workspace state)
// AND tenant_subscriptions.status (the billing state).  The same badge
// component handles both.

export type TenantStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled" | "archived";

export interface StatusCfg {
  /** Tailwind classes for the pill badge */
  badge: string;
  /** Tailwind class for the indicator dot */
  dot: string;
  /** Human-readable label */
  label: string;
  /** Icon name hint (optional — callers map to actual icons) */
  icon: "check" | "clock" | "alert" | "lock" | "x" | "archive";
}

export const STATUS_CONFIG: Record<string, StatusCfg> = {
  active: {
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    dot: "bg-emerald-500",
    label: "Active",
    icon: "check",
  },
  trial: {
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    dot: "bg-blue-500",
    label: "Trial",
    icon: "clock",
  },
  past_due: {
    badge: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
    dot: "bg-red-500",
    label: "Past Due",
    icon: "alert",
  },
  suspended: {
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    dot: "bg-amber-500",
    label: "Suspended",
    icon: "lock",
  },
  cancelled: {
    badge: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
    label: "Cancelled",
    icon: "x",
  },
  archived: {
    badge: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/50",
    label: "Archived",
    icon: "archive",
  },
};

/** Falls back to "active" config if the status is unknown */
export function getStatusCfg(status?: string | null): StatusCfg {
  return STATUS_CONFIG[status ?? "active"] ?? STATUS_CONFIG.active;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status?: string | null }) {
  const cfg = getStatusCfg(status);
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border
        px-2.5 py-0.5 text-[11px] font-semibold
        ${cfg.badge}
      `}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** Short date: "15 Sep 2026" */
export const dateFmt = (iso: string | null | undefined): string =>
  !iso
    ? "—"
    : new Date(iso).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

/** Full datetime: "15 Sep 2026, 14:23" */
export const timeFmt = (iso: string | null | undefined): string =>
  !iso
    ? "—"
    : new Date(iso).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

/** USD money: "$1,200" (no cents for whole amounts) */
export const fmtMoney = (n: number | null | undefined): string =>
  n == null
    ? "—"
    : "$" +
      Number(n).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });

/** Compact number: 1234 → "1.2k", 1234567 → "1.2M" */
export const fmtCompact = (n: number | null | undefined): string =>
  n == null ? "—" : Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** Relative time: "3 days ago", "just now" */
export const relativeTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the tenant's workspace is in an "open" state
 * (i.e. not suspended, cancelled, or archived).
 */
export function isTenantOpen(status?: string | null): boolean {
  return !["suspended", "cancelled", "archived"].includes(status ?? "");
}

/**
 * Derives a simple health colour from health counts.
 * Returns a Tailwind text colour class.
 */
export function healthColor(errors: number, warnings: number): string {
  if (errors > 0) return "text-destructive";
  if (warnings > 0) return "text-amber-600 dark:text-amber-400";
  return "text-success";
}
