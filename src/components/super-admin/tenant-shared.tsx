/**
 * Shared types, helpers, and sub-components used by both
 * the tenant list and the tenant detail pages.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Tenant {
  id:         string;
  name:       string;
  slug:       string;
  currency:   string | null;
  status:     string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TenantSubscription {
  id:                   string;
  status:               string;
  plan_id:              string;
  plan_name:            string;
  plan_code:            string;
  price_usd:            number;
  max_users:            number | null;
  max_storage_gb:       number | null;
  trial_ends_at:        string | null;
  current_period_start: string;
  current_period_end:   string | null;
  cancelled_at:         string | null;
  external_id:          string | null;
  notes:                string | null;
  created_at:           string;
}

export interface TenantUser {
  id:         string;
  email:      string;
  full_name:  string | null;
  roles:      string[] | null;
  created_at: string;
  updated_at: string;
}

export type TenantStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled";

// ─── Status config ────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<string, {
  badge: string;
  dot:   string;
  label: string;
}> = {
  active:    { badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", dot: "bg-emerald-500", label: "Active"    },
  trial:     { badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",             dot: "bg-blue-500",    label: "Trial"     },
  past_due:  { badge: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",                 dot: "bg-red-500",     label: "Past Due"  },
  suspended: { badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",         dot: "bg-amber-500",   label: "Suspended" },
  cancelled: { badge: "bg-muted text-muted-foreground border-border",                                    dot: "bg-muted-foreground", label: "Cancelled" },
};

export function getStatusCfg(status?: string | null) {
  return STATUS_CONFIG[status ?? "active"] ?? STATUS_CONFIG.active;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const dateFmt = (iso: string | null | undefined) =>
  !iso ? "—"
  : new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

export const timeFmt = (iso: string | null | undefined) =>
  !iso ? "—"
  : new Date(iso).toLocaleString(undefined, {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

export const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—"
  : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ─── StatusBadge ─────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status?: string | null }) {
  const cfg = getStatusCfg(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
