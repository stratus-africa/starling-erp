export const FEATURES = {
  multiLocation: "multi_location",
  manufacturing: "manufacturing",
  pos: "pos",
  advancedInventory: "advanced_inventory",
  banking: "banking",
  payroll: "payroll",
  crm: "crm",
  advancedReports: "advanced_reports",
} as const;

export type Feature = typeof FEATURES[keyof typeof FEATURES];

export const featureLabels: Record<Feature, string> = {
  multi_location: "Multi-location",
  manufacturing: "Manufacturing",
  pos: "Point of Sale",
  advanced_inventory: "Advanced Inventory",
  banking: "Banking",
  payroll: "Payroll",
  crm: "CRM",
  advanced_reports: "Advanced Reports",
};


export const featureForPath = (pathname: string): Feature | null => {
  if (pathname.startsWith("/inventory/transfers")) return FEATURES.multiLocation;
  if (pathname.startsWith("/manufacturing/") || pathname === "/dashboards/production" || pathname.startsWith("/reports/manufacturing")) return FEATURES.manufacturing;
  if (pathname.startsWith("/accounting/banking") || pathname.startsWith("/accounting/reconciliation")) return FEATURES.banking;
  if (pathname.startsWith("/crm/")) return FEATURES.crm;
  return null;
};
