import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Activity,
  UserCircle2,
  FileText,
  ShoppingCart,
  Package,
  Truck,
  Receipt,
  Wallet,
  FileMinus,
  Store,
  ClipboardList,
  ShoppingBag,
  FileSpreadsheet,
  Coins,
  HandCoins,
  PiggyBank,
  Boxes,
  Warehouse,
  PackagePlus,
  ArrowLeftRight,
  BookOpen,
  Factory,
  ListTree,
  Cog,
  PlayCircle,
  BookText,
  Landmark,
  BookMarked,
  Scale,
  BarChart3,
  LineChart,
  PieChart,
  TrendingUp,
  Wallet2,
  Gauge,
  Bell,
  KeyRound,
  Layers,
  Percent,
  Globe,
  Ruler,
  Workflow,
  Hash,
  Mail,
  Truck as TruckIcon,
  HardHat,
  ShieldCheck,
  Settings2,
  LayoutList,
  CalendarRange,
  GitBranch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  feature?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Accounting", url: "/accounting", icon: Wallet2 },
      { title: "Sales", url: "/dashboards/sales", icon: TrendingUp },
      { title: "Logistics", url: "/dashboards/logistics", icon: TruckIcon },
      { title: "Production", url: "/dashboards/production", icon: HardHat, feature: "manufacturing" },
      { title: "Procurement", url: "/dashboards/procurement", icon: Gauge },
    ],
  },
  {
    label: "CRM",
    items: [{ title: "Customers", url: "/crm/customers", icon: UserCircle2, feature: "crm" }],
  },
  {
    label: "Sales",
    items: [
      { title: "Quotes", url: "/sales/quotes", icon: FileText },
      { title: "Sales Orders", url: "/sales/orders", icon: ShoppingCart },
      { title: "Packages", url: "/sales/packages", icon: Package },
      { title: "Shipments", url: "/sales/shipments", icon: Truck },
      { title: "Invoices", url: "/sales/invoices", icon: Receipt },
      { title: "Payments Received", url: "/sales/payments", icon: Wallet },
      { title: "Credit Notes", url: "/sales/credit-notes", icon: FileMinus },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { title: "Suppliers", url: "/purchasing/suppliers", icon: Store },
      { title: "Requisitions", url: "/purchasing/requisitions", icon: ClipboardList },
      { title: "Purchase Orders", url: "/purchasing/orders", icon: ShoppingBag },
      { title: "Bills", url: "/purchasing/bills", icon: FileSpreadsheet },
      { title: "Expenses", url: "/purchasing/expenses", icon: Coins },
      { title: "Supplier Credits", url: "/purchasing/credits", icon: HandCoins },
      { title: "Payments Made", url: "/purchasing/payments", icon: PiggyBank },
    ],
  },
  {
    label: "Inventory",
    items: [
      { title: "Items", url: "/inventory/items", icon: Boxes },
      { title: "Warehouses", url: "/inventory/warehouses", icon: Warehouse },
      { title: "Adjustments", url: "/inventory/adjustments", icon: PackagePlus },
      { title: "Stock Transfers", url: "/inventory/transfers", icon: ArrowLeftRight, feature: "multi_location" },
      { title: "Inventory Ledger", url: "/inventory/ledger", icon: BookOpen },
    ],
  },
  {
    label: "Manufacturing",
    items: [
      { title: "Production Items", url: "/manufacturing/items", icon: Factory, feature: "manufacturing" },
      { title: "Bill of Materials", url: "/manufacturing/bom", icon: ListTree, feature: "manufacturing" },
      { title: "Production Orders", url: "/manufacturing/orders", icon: Cog, feature: "manufacturing" },
      { title: "Production Runs", url: "/manufacturing/runs", icon: PlayCircle, feature: "manufacturing" },
    ],
  },
  {
    label: "Accounting",
    items: [
      { title: "Chart of Accounts", url: "/accounting/chart", icon: BookText },
      { title: "Manual Journals", url: "/accounting/journals", icon: BookMarked },
      { title: "Accounting Periods", url: "/accounting/periods", icon: CalendarRange },
      { title: "Banking", url: "/accounting/banking", icon: Landmark },
      { title: "Bank Reconciliation", url: "/accounting/reconciliation", icon: Scale },
      { title: "Posting Config", url: "/accounting/posting-config", icon: Settings2 },
      { title: "Integrity Checks", url: "/accounting/integrity", icon: ShieldCheck },
      { title: "Audit Trail", url: "/accounting/audit-trail", icon: GitBranch },
    ],
  },
  {
    label: "Reports",
    items: [
      { title: "General Ledger", url: "/accounting/ledger", icon: BookOpen },
      { title: "Trial Balance", url: "/accounting/trial-balance", icon: Scale },
      { title: "Profit & Loss", url: "/accounting/profit-loss", icon: TrendingUp },
      { title: "Balance Sheet", url: "/accounting/balance-sheet", icon: LayoutList },
      { title: "VAT Report", url: "/accounting/tax-report", icon: Percent },
      { title: "Sales Reports", url: "/reports/sales", icon: BarChart3 },
      { title: "Purchase Reports", url: "/reports/purchases", icon: LineChart },
      { title: "Inventory Reports", url: "/reports/inventory", icon: PieChart },
      { title: "Manufacturing Reports", url: "/reports/manufacturing", icon: Activity, feature: "manufacturing" },
    ],
  },
  {
    label: "Settings",
    items: [{ title: "Settings", url: "/settings", icon: Settings2 }],
  },
];

export const adminNavGroups: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { title: "Tenants", url: "/admin/tenants", icon: Building2 },
      { title: "Subscription Plans", url: "/admin/plans", icon: CreditCard },
      { title: "Platform Users", url: "/admin/users", icon: Users },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Audit Logs", url: "/admin/audit", icon: ShieldCheck },
      { title: "System Settings", url: "/admin/settings", icon: Settings2 },
    ],
  },
];
