// ─────────────────────────────────────────────────────────────────────────────
// Platform Permission Constants
//
// PLATFORM layer — entirely separate from src/lib/permissions.ts (tenant layer).
//
// Source of truth: public.platform_permissions table (seeded by migration
// 20260829010000_platform_authorization_system.sql).
//
// Server enforcement: every sensitive RPC calls
//   public.has_platform_permission(_code)
// before executing.  The frontend cache (canPlatform) is UX-only.
//
// NEVER use these codes inside tenant-facing useAuth().can() checks.
// NEVER use tenant permission codes inside usePlatformAuth().canPlatform().
// ─────────────────────────────────────────────────────────────────────────────

// ─── Permission codes ─────────────────────────────────────────────────────────

export const PLATFORM_PERMISSIONS = {
  // Dashboard
  dashboardView: "platform.dashboard.view",

  // Tenants
  tenantsView: "platform.tenants.view",
  tenantsCreate: "platform.tenants.create",
  tenantsUpdate: "platform.tenants.update",
  tenantsActivate: "platform.tenants.activate",
  tenantsSuspend: "platform.tenants.suspend",
  tenantsDelete: "platform.tenants.delete",

  // Users
  usersView: "platform.users.view",
  usersManage: "platform.users.manage",

  // Support / impersonation
  supportView: "platform.support.view",
  supportImpersonate: "platform.support.impersonate",

  // Billing
  billingView: "platform.billing.view",
  billingManage: "platform.billing.manage",

  // Plans
  plansView: "platform.plans.view",
  plansManage: "platform.plans.manage",

  // Features
  featuresView: "platform.features.view",
  featuresManage: "platform.features.manage",

  // Settings
  settingsView: "platform.settings.view",
  settingsManage: "platform.settings.manage",

  // Audit
  auditView: "platform.audit.view",

  // Security
  securityView: "platform.security.view",
  securityManage: "platform.security.manage",

  // System
  systemView: "platform.system.view",
  systemManage: "platform.system.manage",

  // Announcements
  announcementsView: "platform.announcements.view",
  announcementsManage: "platform.announcements.manage",

  // Admin management
  adminsView: "platform.admins.view",
  adminsManage: "platform.admins.manage",
} as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

// ─── Role names ───────────────────────────────────────────────────────────────
// Must exactly match platform_roles.name in the database.

export const PLATFORM_ROLES = {
  superAdmin: "super_admin",
  platformAdmin: "platform_admin",
  supportAdmin: "support_admin",
  billingAdmin: "billing_admin",
  securityAdmin: "security_admin",
  readonly: "readonly",
} as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

// ─── Role metadata ────────────────────────────────────────────────────────────

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "Super Admin",
  platform_admin: "Platform Admin",
  support_admin: "Support Admin",
  billing_admin: "Billing Admin",
  security_admin: "Security Admin",
  readonly: "Read Only",
};

export const PLATFORM_ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
  super_admin: "Full platform access. Can manage tenants, plans, features, admins, and security.",
  platform_admin:
    "Operational access: tenants, users, plans, features, billing. Cannot manage other admins or security policy.",
  support_admin: "View tenant data and open timed impersonation sessions. No billing or security write access.",
  billing_admin: "Manage plans and subscriptions. Can suspend or activate tenants. No impersonation.",
  security_admin: "View and resolve security events. Access to audit log and system metrics. No impersonation.",
  readonly: "Read-only view across all platform areas. No write operations permitted.",
};

// ─── Role → permission matrix (display only — NOT used for auth) ──────────────
// Authorization is always server-side. This mapping is for rendering the
// Roles & Permissions UI table. It mirrors the DB seed exactly.

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  super_admin: Object.values(PLATFORM_PERMISSIONS),

  platform_admin: Object.values(PLATFORM_PERMISSIONS).filter(
    (p) => !["platform.admins.manage", "platform.security.manage", "platform.system.manage"].includes(p),
  ),

  support_admin: [
    PLATFORM_PERMISSIONS.dashboardView,
    PLATFORM_PERMISSIONS.tenantsView,
    PLATFORM_PERMISSIONS.usersView,
    PLATFORM_PERMISSIONS.supportView,
    PLATFORM_PERMISSIONS.supportImpersonate,
    PLATFORM_PERMISSIONS.plansView,
    PLATFORM_PERMISSIONS.billingView,
    PLATFORM_PERMISSIONS.featuresView,
    PLATFORM_PERMISSIONS.auditView,
    PLATFORM_PERMISSIONS.announcementsView,
    PLATFORM_PERMISSIONS.adminsView,
  ],

  billing_admin: [
    PLATFORM_PERMISSIONS.dashboardView,
    PLATFORM_PERMISSIONS.tenantsView,
    PLATFORM_PERMISSIONS.tenantsActivate,
    PLATFORM_PERMISSIONS.tenantsSuspend,
    PLATFORM_PERMISSIONS.usersView,
    PLATFORM_PERMISSIONS.billingView,
    PLATFORM_PERMISSIONS.billingManage,
    PLATFORM_PERMISSIONS.plansView,
    PLATFORM_PERMISSIONS.plansManage,
    PLATFORM_PERMISSIONS.featuresView,
    PLATFORM_PERMISSIONS.featuresManage,
    PLATFORM_PERMISSIONS.auditView,
    PLATFORM_PERMISSIONS.announcementsView,
  ],

  security_admin: [
    PLATFORM_PERMISSIONS.dashboardView,
    PLATFORM_PERMISSIONS.tenantsView,
    PLATFORM_PERMISSIONS.usersView,
    PLATFORM_PERMISSIONS.supportView,
    PLATFORM_PERMISSIONS.auditView,
    PLATFORM_PERMISSIONS.securityView,
    PLATFORM_PERMISSIONS.securityManage,
    PLATFORM_PERMISSIONS.systemView,
    PLATFORM_PERMISSIONS.announcementsView,
    PLATFORM_PERMISSIONS.adminsView,
  ],

  readonly: Object.values(PLATFORM_PERMISSIONS).filter((p) => p.endsWith(".view")),
};

// ─── Helper: group permissions by module (for UI tables) ─────────────────────

export interface PermissionGroup {
  module: string;
  label: string;
  permissions: Array<{ code: PlatformPermission; label: string }>;
}

export const PLATFORM_PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: "dashboard",
    label: "Dashboard",
    permissions: [{ code: PLATFORM_PERMISSIONS.dashboardView, label: "View dashboard" }],
  },
  {
    module: "tenants",
    label: "Tenants",
    permissions: [
      { code: PLATFORM_PERMISSIONS.tenantsView, label: "View tenants" },
      { code: PLATFORM_PERMISSIONS.tenantsCreate, label: "Create tenants" },
      { code: PLATFORM_PERMISSIONS.tenantsUpdate, label: "Update tenant metadata" },
      { code: PLATFORM_PERMISSIONS.tenantsActivate, label: "Activate tenants" },
      { code: PLATFORM_PERMISSIONS.tenantsSuspend, label: "Suspend tenants" },
      { code: PLATFORM_PERMISSIONS.tenantsDelete, label: "Delete tenants" },
    ],
  },
  {
    module: "users",
    label: "Users",
    permissions: [
      { code: PLATFORM_PERMISSIONS.usersView, label: "View users" },
      { code: PLATFORM_PERMISSIONS.usersManage, label: "Manage users & roles" },
    ],
  },
  {
    module: "support",
    label: "Support",
    permissions: [
      { code: PLATFORM_PERMISSIONS.supportView, label: "View support sessions" },
      { code: PLATFORM_PERMISSIONS.supportImpersonate, label: "Impersonate tenant" },
    ],
  },
  {
    module: "billing",
    label: "Billing",
    permissions: [
      { code: PLATFORM_PERMISSIONS.billingView, label: "View billing" },
      { code: PLATFORM_PERMISSIONS.billingManage, label: "Manage billing" },
    ],
  },
  {
    module: "plans",
    label: "Plans",
    permissions: [
      { code: PLATFORM_PERMISSIONS.plansView, label: "View plans" },
      { code: PLATFORM_PERMISSIONS.plansManage, label: "Manage plans" },
    ],
  },
  {
    module: "features",
    label: "Features",
    permissions: [
      { code: PLATFORM_PERMISSIONS.featuresView, label: "View feature flags" },
      { code: PLATFORM_PERMISSIONS.featuresManage, label: "Manage feature flags" },
    ],
  },
  {
    module: "settings",
    label: "Settings",
    permissions: [
      { code: PLATFORM_PERMISSIONS.settingsView, label: "View settings" },
      { code: PLATFORM_PERMISSIONS.settingsManage, label: "Manage settings" },
    ],
  },
  {
    module: "audit",
    label: "Audit",
    permissions: [{ code: PLATFORM_PERMISSIONS.auditView, label: "View audit log" }],
  },
  {
    module: "security",
    label: "Security",
    permissions: [
      { code: PLATFORM_PERMISSIONS.securityView, label: "View security events" },
      { code: PLATFORM_PERMISSIONS.securityManage, label: "Manage security" },
    ],
  },
  {
    module: "system",
    label: "System",
    permissions: [
      { code: PLATFORM_PERMISSIONS.systemView, label: "View system metrics" },
      { code: PLATFORM_PERMISSIONS.systemManage, label: "Manage system" },
    ],
  },
  {
    module: "announcements",
    label: "Announcements",
    permissions: [
      { code: PLATFORM_PERMISSIONS.announcementsView, label: "View announcements" },
      { code: PLATFORM_PERMISSIONS.announcementsManage, label: "Manage announcements" },
    ],
  },
  {
    module: "admins",
    label: "Admins",
    permissions: [
      { code: PLATFORM_PERMISSIONS.adminsView, label: "View admin list" },
      { code: PLATFORM_PERMISSIONS.adminsManage, label: "Grant/revoke admin access" },
    ],
  },
];
