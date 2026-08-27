export const PERMISSIONS = {
  crmRead: "crm.read",
  crmCreate: "crm.create",
  crmUpdate: "crm.update",
  crmDelete: "crm.delete",
  salesRead: "sales.read",
  salesCreate: "sales.create",
  salesUpdate: "sales.update",
  salesDelete: "sales.delete",
  salesPost: "sales.post",
  salesAccountingPost: "sales.accounting_post",
  salesVoid: "sales.void",
  paymentsRead: "payments.read",
  paymentsCreate: "payments.create",
  paymentsUpdate: "payments.update",
  paymentsPost: "payments.post",
  inventoryRead: "inventory.read",
  inventoryCreate: "inventory.create",
  inventoryUpdate: "inventory.update",
  inventoryAdjust: "inventory.adjust",
  inventoryTransfer: "inventory.transfer",
  purchasingRead: "purchasing.read",
  purchasingCreate: "purchasing.create",
  purchasingUpdate: "purchasing.update",
  purchasingPost: "purchasing.post",
  accountingRead: "accounting.read",
  accountingCreate: "accounting.create",
  accountingUpdate: "accounting.update",
  accountingPost: "accounting.post",
  bankingRead: "banking.read",
  bankingCreate: "banking.create",
  bankingUpdate: "banking.update",
  bankingReconcile: "banking.reconcile",
  manufacturingRead: "manufacturing.read",
  manufacturingCreate: "manufacturing.create",
  manufacturingUpdate: "manufacturing.update",
  manufacturingPost: "manufacturing.post",
  reportsRead: "reports.read",
  reportsExport: "reports.export",
  settingsUsers: "settings.users",
  settingsRoles: "settings.roles",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type PermissionModule =
  | "crm"
  | "sales"
  | "payments"
  | "inventory"
  | "purchasing"
  | "accounting"
  | "banking"
  | "manufacturing"
  | "reports"
  | "settings";

export type PermissionAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "post"
  | "accounting_post"
  | "void"
  | "adjust"
  | "transfer"
  | "reconcile"
  | "export"
  | "users"
  | "roles";

export type PermissionKey = `${PermissionModule}.${PermissionAction}`;

export const permission = <M extends PermissionModule, A extends PermissionAction>(
  module: M,
  action: A,
): PermissionKey => `${module}.${action}`;
