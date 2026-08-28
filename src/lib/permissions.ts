// ─────────────────────────────────────────────────────────────────────────────
// Centralized permission constants
//
// Every permission code used in UI can() checks and RPC guards lives here.
// The DB is the source of truth; this file mirrors it for type safety.
//
// Naming convention:  PERMISSIONS.<module><Action> = "<module>.<action>"
// Granular sub-module: PERMISSIONS.accountingJournalPost = "accounting.journal.post"
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSIONS = {
  // ── CRM ────────────────────────────────────────────────────────────────────
  crmRead: "crm.read",
  crmCreate: "crm.create",
  crmUpdate: "crm.update",
  crmDelete: "crm.delete",

  // ── Sales ───────────────────────────────────────────────────────────────────
  salesRead: "sales.read",
  salesCreate: "sales.create",
  salesUpdate: "sales.update",
  salesDelete: "sales.delete",
  salesPost: "sales.post",
  salesAccountingPost: "sales.accounting_post",
  salesVoid: "sales.void",

  // ── Payments ────────────────────────────────────────────────────────────────
  paymentsRead: "payments.read",
  paymentsCreate: "payments.create",
  paymentsUpdate: "payments.update",
  paymentsPost: "payments.post",
  paymentsVoid: "payments.void",

  // ── Inventory ───────────────────────────────────────────────────────────────
  inventoryRead: "inventory.read",
  inventoryCreate: "inventory.create",
  inventoryUpdate: "inventory.update",
  inventoryAdjust: "inventory.adjust",
  inventoryTransfer: "inventory.transfer",
  inventoryVoid: "inventory.void",

  // ── Purchasing ──────────────────────────────────────────────────────────────
  purchasingRead: "purchasing.read",
  purchasingCreate: "purchasing.create",
  purchasingUpdate: "purchasing.update",
  purchasingPost: "purchasing.post",
  purchasingVoid: "purchasing.void",

  // ── Accounting — module-level (coarse, kept for backward compatibility) ─────
  accountingRead: "accounting.read",
  /** @deprecated Use accountingView instead */
  accountingCreate: "accounting.create",
  /** @deprecated Use granular accounting.journal.* or accounting.accounts.* */
  accountingUpdate: "accounting.update",
  accountingDelete: "accounting.delete",
  /** @deprecated Use accountingJournalPost */
  accountingPost: "accounting.post",
  /** @deprecated Use accountingJournalVoid */
  accountingReverse: "accounting.reverse",

  // ── Accounting — view / top-level ───────────────────────────────────────────
  /** View accounting module: GL, reports, chart of accounts */
  accountingView: "accounting.view",

  // ── Accounting — journal lifecycle ──────────────────────────────────────────
  /** Create draft manual journal entries */
  accountingJournalCreate: "accounting.journal.create",
  /** Edit draft journal entries (before posting) */
  accountingJournalUpdate: "accounting.journal.update",
  /** Post journal entries to the general ledger */
  accountingJournalPost: "accounting.journal.post",
  /** Void and reverse posted journal entries */
  accountingJournalVoid: "accounting.journal.void",

  // ── Accounting — chart of accounts ──────────────────────────────────────────
  /** Add new accounts to the chart of accounts */
  accountingAccountsCreate: "accounting.accounts.create",
  /** Edit existing accounts (name, type, settings) */
  accountingAccountsUpdate: "accounting.accounts.update",
  /** Soft-delete accounts from the chart */
  accountingAccountsDelete: "accounting.accounts.delete",

  // ── Accounting — reports ────────────────────────────────────────────────────
  /** View P&L, Balance Sheet, Trial Balance, General Ledger */
  accountingReportsView: "accounting.reports.view",

  // ── Accounting — periods ────────────────────────────────────────────────────
  /** Open, close, and lock accounting periods */
  accountingPeriodsManage: "accounting.periods.manage",

  // ── Accounting — reconciliation ─────────────────────────────────────────────
  /** View bank reconciliation screens */
  accountingReconciliationView: "accounting.reconciliation.view",
  /** Perform and approve bank reconciliations */
  accountingReconciliationManage: "accounting.reconciliation.manage",

  // ── Accounting — settings ───────────────────────────────────────────────────
  /** Manage accounting configuration and system account mappings */
  accountingSettingsManage: "accounting.settings.manage",

  // ── Banking ─────────────────────────────────────────────────────────────────
  bankingRead: "banking.read",
  bankingCreate: "banking.create",
  bankingUpdate: "banking.update",
  bankingReconcile: "banking.reconcile",
  bankingVoid: "banking.void",

  // ── Manufacturing ────────────────────────────────────────────────────────────
  manufacturingRead: "manufacturing.read",
  manufacturingCreate: "manufacturing.create",
  manufacturingUpdate: "manufacturing.update",
  manufacturingPost: "manufacturing.post",
  manufacturingVoid: "manufacturing.void",

  // ── Reports ──────────────────────────────────────────────────────────────────
  reportsRead: "reports.read",
  reportsExport: "reports.export",

  // ── Settings ─────────────────────────────────────────────────────────────────
  settingsFeaturesManage: "settings.features.manage",
  settingsUsers: "settings.users",
  settingsRoles: "settings.roles",

  // ── Approvals ────────────────────────────────────────────────────────────────
  approvalsRead: "approvals.read",
  approvalsRequest: "approvals.request",
  approvalsApprove: "approvals.approve",
  approvalsReject: "approvals.reject",
  approvalsManage: "approvals.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ─────────────────────────────────────────────────────────────────────────────
// Convenience helpers — call can() with an OR-array for any of these to pass
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the union of granular + legacy journal post codes.
 *  Use with can(JOURNAL_POST_PERMS) so both old and new role holders pass. */
export const JOURNAL_POST_PERMS = [
  PERMISSIONS.accountingJournalPost,
  PERMISSIONS.accountingPost, // legacy fallback
] as const;

export const JOURNAL_VOID_PERMS = [
  PERMISSIONS.accountingJournalVoid,
  PERMISSIONS.accountingReverse, // legacy fallback
] as const;

export const JOURNAL_CREATE_PERMS = [
  PERMISSIONS.accountingJournalCreate,
  PERMISSIONS.accountingCreate, // legacy fallback
] as const;

export const JOURNAL_UPDATE_PERMS = [
  PERMISSIONS.accountingJournalUpdate,
  PERMISSIONS.accountingUpdate, // legacy fallback
] as const;

export const ACCOUNTS_CREATE_PERMS = [
  PERMISSIONS.accountingAccountsCreate,
  PERMISSIONS.accountingCreate, // legacy fallback
] as const;

export const ACCOUNTS_UPDATE_PERMS = [
  PERMISSIONS.accountingAccountsUpdate,
  PERMISSIONS.accountingUpdate, // legacy fallback
] as const;

export const ACCOUNTS_DELETE_PERMS = [PERMISSIONS.accountingAccountsDelete, PERMISSIONS.accountingDelete] as const;

export const ACCOUNTING_VIEW_PERMS = [
  PERMISSIONS.accountingView,
  PERMISSIONS.accountingRead, // legacy fallback
] as const;

export const REPORTS_VIEW_PERMS = [PERMISSIONS.accountingReportsView, PERMISSIONS.reportsRead] as const;
