import { BarChart3, BookOpen, FileBarChart, LayoutList, Percent, Scale, TrendingUp, WalletCards } from "lucide-react";
import { ReportsListingPage, type ReportsListingConfig } from "@/components/reports-listing-page";

const config: ReportsListingConfig = {
  module: "financial",
  title: "Financial Reports",
  description: "View, analyze and export your accounting reports.",
  categories: ["All", "Accounting", "Tax", "Management"],
  kpis: [
    { label: "Revenue YTD", value: null, tone: "bg-emerald-500/10 text-emerald-700", icon: TrendingUp },
    { label: "Expenses YTD", value: null, tone: "bg-orange-500/10 text-orange-700", icon: BarChart3 },
    { label: "Net Profit", value: null, tone: "bg-blue-500/10 text-blue-700", icon: WalletCards },
    { label: "VAT Payable", value: null, tone: "bg-rose-500/10 text-rose-700", icon: Percent },
  ],
  reports: [
    { id: "general-ledger", title: "General Ledger", description: "Full transaction-level view of every posted journal entry with account, source, and running balance detail.", url: "/accounting/ledger", category: "Accounting", icon: BookOpen, iconClass: "bg-blue-500/10 text-blue-700" },
    { id: "trial-balance", title: "Trial Balance", description: "Aggregated debit and credit balances for every account at a selected date.", url: "/accounting/trial-balance", category: "Accounting", icon: Scale, iconClass: "bg-violet-500/10 text-violet-700" },
    { id: "profit-loss", title: "Profit & Loss", description: "Revenue, cost of goods sold, operating expenses, and net profit for a selected period.", url: "/accounting/profit-loss", category: "Management", icon: TrendingUp, iconClass: "bg-emerald-500/10 text-emerald-700" },
    { id: "balance-sheet", title: "Balance Sheet", description: "Point-in-time snapshot of assets, liabilities, equity, and current year profit.", url: "/accounting/balance-sheet", category: "Management", icon: LayoutList, iconClass: "bg-amber-500/10 text-amber-700" },
    { id: "vat-report", title: "VAT Report", description: "Output VAT, input VAT, and net VAT payable from posted VAT control account entries.", url: "/accounting/tax-report", category: "Tax", icon: Percent, iconClass: "bg-rose-500/10 text-rose-700" },
  ],
  reportingInformation: "Reports are generated from posted transactions and update as transactions are posted. Draft transactions do not affect financial figures.",
  accent: "blue",
  currencyKpis: true,
};

export function FinancialReportsHub() { return <ReportsListingPage config={config} />; }
