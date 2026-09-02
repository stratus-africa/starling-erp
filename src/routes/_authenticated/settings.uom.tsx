import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { UOM_CLASSES, UOM_CLASS_COLORS } from "@/lib/uom";
import type { FieldDef } from "@/components/data-module-page";

// Class badge renderer
const classBadge = (v: any) => {
  if (!v) return <span className="text-muted-foreground">—</span>;
  const cls = UOM_CLASS_COLORS[v as keyof typeof UOM_CLASS_COLORS] ?? "bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{v}</span>;
};

const uomFields: FieldDef[] = [
  {
    key: "code",
    label: "Code",
    required: true,
    render: (v) => <span className="font-mono text-xs font-medium">{v}</span>,
    validate: (v) => {
      if (!v?.trim()) return "Code is required";
      if (!/^[a-z0-9_]+$/i.test(v)) return "Code may only contain letters, digits, and underscores";
      if (v.length > 20) return "Code must be 20 characters or less";
      return null;
    },
  },
  {
    key: "name",
    label: "Name",
    required: true,
    render: (v) => <span className="font-medium text-foreground">{v}</span>,
    validate: (v) => (!v?.trim() ? "Name is required" : null),
  },
  {
    key: "uom_class",
    label: "Class",
    type: "select",
    options: UOM_CLASSES as unknown as string[],
    required: true,
    defaultValue: "Unit",
    render: classBadge,
  },
  {
    key: "symbol",
    label: "Symbol",
    render: (v) => <span className="font-mono text-xs">{v ?? "—"}</span>,
  },
  {
    key: "decimal_places",
    label: "Decimals",
    type: "number",
    className: "text-right",
    defaultValue: "2",
    validate: (v) => {
      const n = Number(v);
      if (isNaN(n) || n < 0 || n > 8) return "Must be 0 – 8";
      return null;
    },
  },
  {
    key: "is_base_unit",
    label: "Base Unit",
    type: "select",
    options: ["false", "true"],
    defaultValue: "false",
    hideInTable: true,
    render: (v) =>
      String(v) === "true" ? (
        <span className="text-xs text-success font-medium">Yes</span>
      ) : (
        <span className="text-xs text-muted-foreground">No</span>
      ),
  },
  {
    key: "is_active",
    label: "Active",
    type: "select",
    options: ["true", "false"],
    defaultValue: "true",
    render: (v) =>
      String(v) !== "false" ? (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-success/15 text-success">
          Active
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-muted text-muted-foreground">
          Inactive
        </span>
      ),
  },
  {
    key: "notes",
    label: "Notes",
    type: "textarea",
    hideInTable: true,
  },
];

export const Route = createFileRoute("/_authenticated/settings/uom")({
  component: UomSettingsPage,
});

function UomSettingsPage() {
  return (
    <DataModulePage
      title="Units of Measure"
      description="Define measurement units for stock, purchasing, sales, and manufacturing."
      table="units_of_measure"
      fields={uomFields}
      entityLabel="Unit"
      searchColumn="name"
      defaultOrder="uom_class"
      attachments={false}
      filterFields={[
        {
          key: "uom_class",
          label: "Class",
          options: UOM_CLASSES as unknown as string[],
        },
        {
          key: "is_active",
          label: "Status",
          options: ["true", "false"],
        },
      ]}
    />
  );
}
