import { Link } from "@tanstack/react-router";
import {
  Building2,
  Users,
  Layers,
  Globe,
  Percent,
  CreditCard,
  Hash,
  Mail,
  Bell,
  KeyRound,
  Warehouse,
  Ruler,
  Workflow,
  FileText,
  ShoppingCart,
  Package,
  Boxes,
  ShoppingBag,
  Coins,
  Receipt,
  Settings,
  BookText,
  Scale,
  Landmark,
} from "lucide-react";

// ─── Catalogue ────────────────────────────────────────────────────────────────

interface SettingLink {
  label: string;
  url: string;
}

interface SettingGroup {
  title: string;
  icon: React.ElementType;
  color: string; // bg + text for the icon pill
  links: SettingLink[];
}

interface SettingSection {
  heading: string;
  groups: SettingGroup[];
}

const SECTIONS: SettingSection[] = [
  {
    heading: "Organization Settings",
    groups: [
      {
        title: "Organization",
        icon: Building2,
        color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        links: [
          { label: "Company Profile", url: "/settings/company" },
          { label: "Currencies", url: "/settings/currencies" },
          { label: "Warehouses", url: "/settings/warehouses" },
        ],
      },
      {
        title: "Users & Roles",
        icon: Users,
        color: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
        links: [
          { label: "Users", url: "/settings/users" },
          { label: "Roles & Permissions", url: "/settings/roles" },
        ],
      },
      {
        title: "Taxes & Compliance",
        icon: Percent,
        color: "bg-red-500/10 text-red-700 dark:text-red-400",
        links: [{ label: "Tax Rates (VAT)", url: "/settings/taxes" }],
      },
      {
        title: "Setup & Configuration",
        icon: Settings,
        color: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
        links: [
          { label: "Payment Terms", url: "/settings/payment-terms" },
          { label: "Document Numbering", url: "/settings/numbering" },
          { label: "Units of Measure", url: "/settings/uom" },
        ],
      },
      {
        title: "Customization",
        icon: FileText,
        color: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        links: [
          { label: "Email Templates", url: "/settings/templates" },
          { label: "Notifications", url: "/settings/notifications" },
        ],
      },
      {
        title: "Automation",
        icon: Workflow,
        color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
        links: [{ label: "Approval Workflows", url: "/settings/workflows" }],
      },
      {
        title: "Developer",
        icon: KeyRound,
        color: "bg-muted text-muted-foreground",
        links: [{ label: "API Keys", url: "/settings/api-keys" }],
      },
    ],
  },
  {
    heading: "Module Settings",
    groups: [
      {
        title: "Accounting",
        icon: BookText,
        color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        links: [
          { label: "Chart of Accounts", url: "/accounting/chart" },
          { label: "Tax Rates (VAT)", url: "/settings/taxes" },
          { label: "Posting Config", url: "/accounting/posting-config" },
          { label: "Accounting Periods", url: "/accounting/periods" },
        ],
      },
      {
        title: "Banking",
        icon: Landmark,
        color: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
        links: [
          { label: "Bank Accounts", url: "/accounting/banking" },
          { label: "Bank Reconciliation", url: "/accounting/reconciliation" },
        ],
      },
      {
        title: "Inventory",
        icon: Boxes,
        color: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        links: [
          { label: "Warehouses", url: "/settings/warehouses" },
          { label: "Units of Measure", url: "/settings/uom" },
        ],
      },
      {
        title: "Sales",
        icon: Receipt,
        color: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
        links: [
          { label: "Payment Terms", url: "/settings/payment-terms" },
          { label: "Document Numbering", url: "/settings/numbering" },
          { label: "Email Templates", url: "/settings/templates" },
        ],
      },
      {
        title: "Purchasing",
        icon: ShoppingBag,
        color: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
        links: [
          { label: "Payment Terms", url: "/settings/payment-terms" },
          { label: "Approval Workflows", url: "/settings/workflows" },
        ],
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsHubPage() {
  return (
    <div className="flex flex-col gap-10 p-6 md:p-8">
      {SECTIONS.map((section) => (
        <section key={section.heading}>
          {/* Section heading */}
          <h2 className="text-base font-semibold tracking-tight mb-4 text-foreground">{section.heading}</h2>

          {/* Group grid — auto-fill columns that stretch to fill the row */}
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            {section.groups.map((group) => {
              const Icon = group.icon;
              return (
                <div
                  key={group.title}
                  className="rounded-xl border bg-card p-4 flex flex-col gap-3 hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  {/* Group header */}
                  <div className="flex items-center gap-2">
                    <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${group.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm font-semibold leading-snug">{group.title}</span>
                  </div>

                  {/* Links */}
                  <div className="flex flex-col gap-1.5">
                    {group.links.map((link) => (
                      <Link
                        key={link.url + link.label}
                        to={link.url as never}
                        className="text-sm text-primary/80 hover:text-primary hover:underline underline-offset-2 transition-colors leading-snug"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
