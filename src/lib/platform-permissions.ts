// ─────────────────────────────────────────────────────────────────────────────
// Platform Permission Constants
//
// These are PLATFORM-LEVEL permissions — completely separate from the
// tenant-level permission codes in src/lib/permissions.ts.
//
// Platform permissions are stored in public.platform_permissions and checked
// server-side by public.has_platform_permission(code).
//
// IMPORTANT: Never use these codes in tenant-facing can() checks.
//            Use usePlatformAuth().canPlatform() instead of useAuth().can().
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_PERMISSIONS = {
  // ── Tenant management ────────────────────────────────────────────────────
  /** View list of all tenants and their metadata */
  tenantsRead:    "platform.tenants.read",
  /** Create a new tenant workspace */
  tenantsCreate:  "platform.tenants.create",
  /** Edit tenant metadata (name, slug, currency) */
  tenantsUpdate:  "platform.tenants.update",
  /** Suspend or reactivate a tenant */
  tenantsSuspend: "platform.tenants.suspend",
  /** Hard-delete a tenant (irreversible) */
  tenantsDelete:  "platform.tenants.delete",

  // ── User management ───────────────────────────────────────────────────────
  /** View all users across all tenants */
  usersRead:        "platform.users.read",
  /** Open a support session inside a tenant (controlled impersonation) */
  usersImpersonate: "platform.users.impersonate",
  /** Assign or change tenant-level roles for any user */
  usersSetRoles:    "platform.users.set_roles",

  // ── Plans & billing ───────────────────────────────────────────────────────
  /** View the plan catalogue */
  plansRead:            "platform.plans.read",
  /** Create new subscription plans */
  plansCreate:          "platform.plans.create",
  /** Edit plan details and pricing */
  plansUpdate:          "platform.plans.update",
  /** Delete a plan (only if no active subscriptions) */
  plansDelete:          "platform.plans.delete",
  /** View tenant subscription records */
  subscriptionsRead:    "platform.subscriptions.read",
  /** Assign a plan to a tenant */
  subscriptionsAssign:  "platform.subscriptions.assign",

  // ── Feature flags ─────────────────────────────────────────────────────────
  /** Enable or disable feature flags per tenant */
  featuresManage: "platform.features.manage",

  // ── Audit ─────────────────────────────────────────────────────────────────
  /** Read the platform audit log */
  auditRead: "platform.audit.read",

  // ── Admin management ──────────────────────────────────────────────────────
  /** View the list of platform administrators */
  adminsRead:   "platform.admins.read",
  /** Grant or revoke platform admin access */
  adminsManage: "platform.admins.manage",

  // ── Security ──────────────────────────────────────────────────────────────
  /** View platform security events */
  securityRead:   "platform.security.read",
  /** Manage security policies and resolve security events */
  securityManage: "platform.security.manage",
} as const;

export type PlatformPermission =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

// ─────────────────────────────────────────────────────────────────────────────
// Platform Role names (must match platform_roles.name in DB)
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_ROLES = {
  superAdmin: "super_admin",
  support:    "support",
  billing:    "billing",
  readonly:   "readonly",
} as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

// ─────────────────────────────────────────────────────────────────────────────
// Role capability matrix (mirrors the DB seed in the migration)
// Used for display in the admin UI — NOT for authorization decisions.
// Authorization is always server-side via has_platform_permission().
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "Super Admin",
  support:     "Support",
  billing:     "Billing",
  readonly:    "Read Only",
};

export const PLATFORM_ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
  super_admin: "Full platform access. Can manage tenants, plans, features, and other admins.",
  support:     "Read tenant data and open support sessions. Cannot modify plans or billing.",
  billing:     "Manage plans and subscriptions. Cannot impersonate tenants.",
  readonly:    "Read-only view of platform data for auditors.",
};

/** Convenience: permissions included in each platform role (for display only) */
export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  super_admin: Object.values(PLATFORM_PERMISSIONS),
  support: [
    PLATFORM_PERMISSIONS.tenantsRead,
    PLATFORM_PERMISSIONS.usersRead,
    PLATFORM_PERMISSIONS.usersImpersonate,
    PLATFORM_PERMISSIONS.auditRead,
    PLATFORM_PERMISSIONS.securityRead,
    PLATFORM_PERMISSIONS.subscriptionsRead,
    PLATFORM_PERMISSIONS.plansRead,
  ],
  billing: [
    PLATFORM_PERMISSIONS.tenantsRead,
    PLATFORM_PERMISSIONS.plansRead,
    PLATFORM_PERMISSIONS.plansCreate,
    PLATFORM_PERMISSIONS.plansUpdate,
    PLATFORM_PERMISSIONS.plansDelete,
    PLATFORM_PERMISSIONS.subscriptionsRead,
    PLATFORM_PERMISSIONS.subscriptionsAssign,
    PLATFORM_PERMISSIONS.featuresManage,
    PLATFORM_PERMISSIONS.auditRead,
  ],
  readonly: [
    PLATFORM_PERMISSIONS.tenantsRead,
    PLATFORM_PERMISSIONS.usersRead,
    PLATFORM_PERMISSIONS.plansRead,
    PLATFORM_PERMISSIONS.subscriptionsRead,
    PLATFORM_PERMISSIONS.auditRead,
    PLATFORM_PERMISSIONS.securityRead,
    PLATFORM_PERMISSIONS.adminsRead,
  ],
};
