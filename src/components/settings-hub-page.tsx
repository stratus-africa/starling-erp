import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Users,
  ShieldCheck,
  Globe,
  Warehouse,
  Percent,
  Landmark,
  Scale,
  BookText,
  Settings2,
  FileText,
  Hash,
  Mail,
  Bell,
  Workflow,
  KeyRound,
  CreditCard,
  CalendarRange,
  CheckSquare,
  ClipboardList,
  Ruler,
  ChevronRight,
  Search,
  X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Settings Registry
// Single source of truth for the Settings Hub UI.
// Routes and permissions are NEVER invented — they mirror what exists in the
// settings.*.tsx route files and the routes those pages guard with can().
// ─────────────────────────────────────────────────────────────────────────────

type SettingsCategory =
  | "organization"
  | "finance"
  | "operations"
  | "documents"
  | "automation"
  | "developer";

interface SettingEntry {
  id: string;
  title: string;
  description: string;
  category: SettingsCategory;
  subcategory: string;
  icon: LucideIcon;
  route: string;
  /** undefined = visible to all authenticated users */
  permission?: string | string[];
  keywords: string[];
  quickAccess?: boolean;
}

const REGISTRY: SettingEntry[] = [
  // ── Organization ────────────────────────────────────────────────────────────
  {
    id: "company-profile",
    title: "Company Profile",
    description: "Business identity, contact details, addresses, and document branding.",
    category: "organization",
    subcategory: "Organization",
    icon: Building2,
    route: "/settings/company",
    keywords: ["company", "profile", "identity", "logo", "address", "branding", "tax id", "vat"],
    quickAccess: true,
  },
  {
    id: "currencies",
    title: "Currencies",
    description: "Manage currencies your business transacts in.",
    category: "organization",
    subcategory: "Organization",
    icon: Globe,
    route: "/settings/currencies",
    keywords: ["currency", "currencies", "fx", "exchange", "usd", "eur", "kes"],
  },
  {
    id: "warehouses",
    title: "Warehouses",
    description: "Configure warehouses, inventory locations, and storage sites.",
    category: "organization",
    subcategory: "Organization",
    icon: Warehouse,
    route: "/settings/warehouses",
    keywords: ["warehouse", "location", "store", "stock", "inventory"],
  },
  {
    id: "users",
    title: "Users",
    description: "Manage team members and their assigned roles.",
    category: "organization",
    subcategory: "Users & Access",
    icon: Users,
    route: "/settings/users",
    permission: "settings.users",
    keywords: ["users", "team", "members", "invite", "staff", "employees"],
    quickAccess: true,
  },
  {
    id: "roles",
    title: "Roles & Permissions",
    description: "Define roles and control access to modules and actions.",
    category: "organization",
    subcategory: "Users & Access",
    icon: ShieldCheck,
    route: "/settings/roles",
    permission: "settings.roles",
    keywords: ["roles", "permissions", "access", "rbac", "security", "authorization"],
  },

  // ── Finance ─────────────────────────────────────────────────────────────────
  {
    id: "chart-of-accounts",
    title: "Chart of Accounts",
    description: "Manage the full ledger account structure for your business.",
    category: "finance",
    subcategory: "Accounting",
    icon: BookText,
    route: "/accounting/chart",
    permission: ["accounting.view", "accounting.read"],
    keywords: ["accounts", "chart", "gl", "general ledger", "coa", "accounting"],
    quickAccess: true,
  },
  {
    id: "tax-rates",
    title: "Tax Rates",
    description: "Configure VAT, GST, and other tax rates applied on transactions.",
    category: "finance",
    subcategory: "Accounting",
    icon: Percent,
    route: "/settings/taxes",
    keywords: ["tax", "vat", "gst", "rate", "percent", "compliance"],
    quickAccess: true,
  },
  {
    id: "posting-config",
    title: "Posting Configuration",
    description: "Map modules to ledger accounts for automatic journal posting.",
    category: "finance",
    subcategory: "Accounting",
    icon: Settings2,
    route: "/accounting/posting-config",
    permission: ["accounting.settings.manage", "accounting.update"],
    keywords: ["posting", "mapping", "accounts", "journal", "configuration", "accounting"],
  },
  {
    id: "accounting-periods",
    title: "Accounting Periods",
    description: "Open, close, and lock financial reporting periods.",
    category: "finance",
    subcategory: "Accounting",
    icon: CalendarRange,
    route: "/accounting/periods",
    permission: ["accounting.periods.manage", "accounting.update"],
    keywords: ["period", "close", "year", "month", "financial period", "lock"],
  },
  {
    id: "integrity-checks",
    title: "Integrity Checks",
    description: "Run accounting integrity diagnostics and reconciliation checks.",
    category: "finance",
    subcategory: "Accounting",
    icon: CheckSquare,
    route: "/accounting/integrity",
    permission: ["accounting.view", "accounting.read"],
    keywords: ["integrity", "check", "audit", "balance", "diagnostics"],
  },
  {
    id: "audit-trail",
    title: "Audit Trail",
    description: "Review a full chronological log of accounting transactions.",
    category: "finance",
    subcategory: "Accounting",
    icon: ClipboardList,
    route: "/accounting/audit-trail",
    permission: ["accounting.view", "accounting.read"],
    keywords: ["audit", "trail", "log", "history", "transactions", "journal"],
  },
  {
    id: "bank-accounts",
    title: "Bank Accounts",
    description: "Manage bank accounts connected to your general ledger.",
    category: "finance",
    subcategory: "Banking",
    icon: Landmark,
    route: "/accounting/banking",
    permission: ["banking.read"],
    keywords: ["bank", "account", "banking", "cash", "balance"],
  },
  {
    id: "bank-reconciliation",
    title: "Bank Reconciliation",
    description: "Reconcile bank statements against ledger entries.",
    category: "finance",
    subcategory: "Banking",
    icon: Scale,
    route: "/accounting/reconciliation",
    permission: ["banking.reconcile", "banking.read"],
    keywords: ["reconciliation", "bank", "statement", "match", "reconcile"],
  },
  {
    id: "payment-terms",
    title: "Payment Terms",
    description: "Define net-day terms used on invoices, bills, and purchase orders.",
    category: "finance",
    subcategory: "Finance Setup",
    icon: CreditCard,
    route: "/settings/payment-terms",
    keywords: ["payment", "terms", "net", "due date", "credit", "days"],
  },

  // ── Operations ───────────────────────────────────────────────────────────────
  {
    id: "uom",
    title: "Units of Measure",
    description: "Define measurement units used across inventory and production.",
    category: "operations",
    subcategory: "Inventory",
    icon: Ruler,
    route: "/settings/uom",
    keywords: ["unit", "measure", "uom", "kg", "litre", "piece", "inventory"],
  },

  // ── Documents & Communication ────────────────────────────────────────────────
  {
    id: "document-numbering",
    title: "Document Numbering",
    description: "Configure number series and prefixes for all document types.",
    category: "documents",
    subcategory: "Documents",
    icon: Hash,
    route: "/settings/numbering",
    keywords: ["numbering", "sequence", "prefix", "invoice", "po", "series", "document"],
  },
  {
    id: "email-templates",
    title: "Email Templates",
    description: "Customise email messages sent with invoices, orders, and statements.",
    category: "documents",
    subcategory: "Communication",
    icon: Mail,
    route: "/settings/templates",
    keywords: ["email", "template", "notification", "message", "invoice", "send"],
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Configure in-app and email notification preferences.",
    category: "documents",
    subcategory: "Communication",
    icon: Bell,
    route: "/settings/notifications",
    keywords: ["notification", "alert", "email", "push", "remind"],
  },

  // ── Automation ───────────────────────────────────────────────────────────────
  {
    id: "approval-workflows",
    title: "Approval Workflows",
    description: "Configure multi-step approval chains for purchasing, finance, and more.",
    category: "automation",
    subcategory: "Automation",
    icon: Workflow,
    route: "/settings/workflows",
    permission: ["approvals.read", "approvals.manage"],
    keywords: ["approval", "workflow", "automation", "authorize", "sign-off", "purchasing"],
    quickAccess: true,
  },

  // ── Developer ────────────────────────────────────────────────────────────────
  {
    id: "api-keys",
    title: "API Keys",
    description: "Generate and manage API keys for external integrations.",
    category: "developer",
    subcategory: "Developer",
    icon: KeyRound,
    route: "/settings/api-keys",
    keywords: ["api", "key", "token", "developer", "integration", "webhook"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Category display metadata
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES: { id: SettingsCategory; label: string; description: string }[] = [
  { id: "organization", label: "Organization", description: "Company identity, team access, and workspace configuration." },
  { id: "finance", label: "Finance", description: "Accounting, banking, taxes, and financial setup." },
  { id: "operations", label: "Operations", description: "Inventory, production, and operational configuration." },
  { id: "documents", label: "Documents & Communication", description: "Numbering, email templates, and notification preferences." },
  { id: "automation", label: "Automation", description: "Approval workflows and automated business rules." },
  { id: "developer", label: "Developer", description: "API access and integration tools." },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar category pill colors
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_ICON_COLOR: Record<SettingsCategory, string> = {
  organization: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  finance: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  operations: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  documents: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  automation: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  developer: "bg-muted text-muted-foreground",
};

// ─────────────────────────────────────────────────────────────────────────────
// SettingsHubPage
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsHubPage() {
  const { can } = useAuth();
  const [query, setQuery] = useState("");

  // Permission filter — reusable
  const isVisible = (entry: SettingEntry): boolean => {
    if (!entry.permission) return true;
    const perms = Array.isArray(entry.permission) ? entry.permission : [entry.permission];
    return perms.some((p) => can(p));
  };

  // All entries the user can see
  const visibleEntries = useMemo(
    () => REGISTRY.filter(isVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Searched entries
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return visibleEntries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.subcategory.toLowerCase().includes(q) ||
        e.category.includes(q) ||
        e.keywords.some((k) => k.includes(q)),
    );
  }, [query, visibleEntries]);

  // Quick-access entries (permission-filtered)
  const quickAccess = useMemo(
    () => visibleEntries.filter((e) => e.quickAccess),
    [visibleEntries],
  );

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* ── Left sidebar (desktop only) ──────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r bg-muted/20 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
        <div className="px-3 py-5">
          <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Settings
          </p>
          <nav className="space-y-0.5" aria-label="Settings navigation">
            {CATEGORIES.filter((cat) => visibleEntries.some((e) => e.category === cat.id)).map(
              (cat) => (
                <a
                  key={cat.id}
                  href={`#cat-${cat.id}`}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                >
                  <span className="truncate">{cat.label}</span>
                </a>
              ),
            )}
          </nav>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-5 py-8 md:px-8 space-y-10">

          {/* ── Page header ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Configure your business, users, modules, and system preferences.
              </p>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings…"
                aria-label="Search settings"
                className="w-full rounded-lg border bg-background pl-9 pr-9 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* ── Search results ───────────────────────────────────────────────── */}
          {searchResults !== null ? (
            <section aria-label="Search results">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {searchResults.length === 0
                  ? `No results for "${query}"`
                  : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"} for "${query}"`}
              </h2>
              {searchResults.length > 0 && (
                <SettingsGrid entries={searchResults} />
              )}
            </section>
          ) : (
            <>
              {/* ── Quick Access ──────────────────────────────────────────── */}
              {quickAccess.length > 0 && (
                <section aria-label="Quick access">
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Quick Access
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {quickAccess.map((e) => {
                      const Icon = e.icon;
                      return (
                        <Link
                          key={e.id}
                          to={e.route as never}
                          className="inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground/80 hover:border-primary/40 hover:text-foreground hover:bg-muted/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {e.title}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Mobile category nav ───────────────────────────────────── */}
              <nav
                className="lg:hidden flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-none"
                aria-label="Settings categories"
              >
                {CATEGORIES.filter((cat) =>
                  visibleEntries.some((e) => e.category === cat.id),
                ).map((cat) => (
                  <a
                    key={cat.id}
                    href={`#cat-${cat.id}`}
                    className="shrink-0 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground/70 hover:text-foreground hover:border-primary/40 transition-colors whitespace-nowrap"
                  >
                    {cat.label}
                  </a>
                ))}
              </nav>

              {/* ── Categorised settings ─────────────────────────────────── */}
              {CATEGORIES.filter((cat) =>
                visibleEntries.some((e) => e.category === cat.id),
              ).map((cat) => {
                const entries = visibleEntries.filter((e) => e.category === cat.id);
                return (
                  <section key={cat.id} id={`cat-${cat.id}`} aria-labelledby={`heading-${cat.id}`}>
                    <div className="mb-4 flex flex-col gap-0.5">
                      <h2
                        id={`heading-${cat.id}`}
                        className="text-sm font-semibold text-foreground"
                      >
                        {cat.label}
                      </h2>
                      <p className="text-xs text-muted-foreground">{cat.description}</p>
                      <div className="mt-2 h-px bg-border" />
                    </div>
                    <SettingsGrid entries={entries} />
                  </section>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SettingsGrid — renders a permission-filtered grid of setting cards
// ─────────────────────────────────────────────────────────────────────────────

function SettingsGrid({ entries }: { entries: SettingEntry[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <SettingCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SettingCard — a single fully-clickable setting entry
// ─────────────────────────────────────────────────────────────────────────────

function SettingCard({ entry }: { entry: SettingEntry }) {
  const Icon = entry.icon;
  const iconColor = CATEGORY_ICON_COLOR[entry.category];

  return (
    <Link
      to={entry.route as never}
      className="group relative flex items-start gap-3.5 rounded-xl border bg-card p-4 text-left hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
    >
      {/* Icon */}
      <div
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColor}`}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-snug">{entry.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {entry.description}
        </p>
      </div>

      {/* Arrow */}
      <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    </Link>
  );
}
