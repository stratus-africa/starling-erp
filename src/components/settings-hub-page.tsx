import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
  Building2,
  Users,
  Percent,
  Settings,
  FileText,
  Workflow,
  KeyRound,
  BookText,
  Landmark,
  Boxes,
  Receipt,
  ShoppingBag,
} from "lucide-react";

// ─── Catalogue ────────────────────────────────────────────────────────────────

interface SettingLink {
  label: string;
  url: string;
}

interface SettingRow {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  links: SettingLink[];
}

interface SettingSection {
  heading: string;
  rows: SettingRow[];
}

const SECTIONS: SettingSection[] = [
  {
    heading: "Organization Settings",
    rows: [
      {
        title: "Organization",
        description: "Company profile, base currency, and warehouse locations.",
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
        description: "Manage team members, permissions, and access roles.",
        icon: Users,
        color: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
        links: [
          { label: "Users", url: "/settings/users" },
          { label: "Roles & Permissions", url: "/settings/roles" },
        ],
      },
      {
        title: "Taxes & Compliance",
        description: "VAT rates, tax codes, and GL account mappings for Output and Input VAT.",
        icon: Percent,
        color: "bg-red-500/10 text-red-700 dark:text-red-400",
        links: [{ label: "Tax Rates (VAT)", url: "/settings/taxes" }],
      },
      {
        title: "Setup & Configuration",
        description: "Payment terms, document numbering sequences, and units of measure.",
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
        description: "Email templates and in-app notification preferences.",
        icon: FileText,
        color: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        links: [
          { label: "Email Templates", url: "/settings/templates" },
          { label: "Notifications", url: "/settings/notifications" },
        ],
      },
      {
        title: "Automation",
        description: "Approval workflow rules and multi-step approval chains.",
        icon: Workflow,
        color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
        links: [{ label: "Approval Workflows", url: "/settings/workflows" }],
      },
      {
        title: "Developer",
        description: "API keys for external integrations and third-party applications.",
        icon: KeyRound,
        color: "bg-muted text-muted-foreground",
        links: [{ label: "API Keys", url: "/settings/api-keys" }],
      },
    ],
  },
  {
    heading: "Module Settings",
    rows: [
      {
        title: "Accounting",
        description: "Chart of accounts, VAT rates, posting configuration, and accounting periods.",
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
        description: "Bank account definitions and reconciliation settings.",
        icon: Landmark,
        color: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
        links: [
          { label: "Bank Accounts", url: "/accounting/banking" },
          { label: "Bank Reconciliation", url: "/accounting/reconciliation" },
        ],
      },
      {
        title: "Inventory",
        description: "Warehouse locations and units of measurement for stock items.",
        icon: Boxes,
        color: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        links: [
          { label: "Warehouses", url: "/settings/warehouses" },
          { label: "Units of Measure", url: "/settings/uom" },
        ],
      },
      {
        title: "Sales",
        description: "Customer-facing document numbering, payment terms, and email templates.",
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
        description: "Supplier payment terms and purchasing approval workflows.",
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
    <div className="flex flex-col gap-8 p-6 md:p-8">
      {SECTIONS.map((section) => (
        <section key={section.heading}>
          {/* Section heading */}
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
            {section.heading}
          </h2>

          {/* Table */}
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {section.rows.map((row, idx) => {
                  const Icon = row.icon;
                  return (
                    <tr
                      key={row.title}
                      className={`group border-b last:border-0 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      {/* Icon + title */}
                      <td className="px-5 py-4 w-56">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${row.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="font-semibold text-foreground whitespace-nowrap">{row.title}</span>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="px-4 py-4 text-muted-foreground text-xs leading-relaxed max-w-xs">
                        {row.description}
                      </td>

                      {/* Links */}
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {row.links.map((link) => (
                            <Link
                              key={link.url + link.label}
                              to={link.url as never}
                              className="text-xs text-primary/80 hover:text-primary hover:underline underline-offset-2 transition-colors whitespace-nowrap"
                            >
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      </td>

                      {/* Chevron — links to the first item on click */}
                      <td className="px-4 py-4 text-right w-10">
                        <Link
                          to={row.links[0]?.url as never}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
