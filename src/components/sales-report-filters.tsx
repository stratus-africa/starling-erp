import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SalesReportFilterValues = {
  dateFrom: string;
  dateTo: string;
  customerId: string;
  salespersonId: string;
  productId: string;
  categoryId: string;
  warehouseId: string;
  currency: string;
};

export function SalesReportFilters({
  values,
  onChange,
  semantics = "Document Date",
}: {
  values: SalesReportFilterValues;
  onChange: (next: SalesReportFilterValues) => void;
  semantics?: string;
}) {
  const set = (key: keyof SalesReportFilterValues, value: string) =>
    onChange({ ...values, [key]: value });
  return (
    <Card className="flex flex-wrap items-end gap-3 p-4">
      <Field
        label="Date from"
        value={values.dateFrom}
        onChange={(value) => set("dateFrom", value)}
        type="date"
      />
      <Field
        label="Date to"
        value={values.dateTo}
        onChange={(value) => set("dateTo", value)}
        type="date"
      />
      <Field
        label="Customer ID"
        value={values.customerId}
        onChange={(value) => set("customerId", value)}
      />
      <Field
        label="Salesperson ID"
        value={values.salespersonId}
        onChange={(value) => set("salespersonId", value)}
      />
      <Field
        label="Product ID"
        value={values.productId}
        onChange={(value) => set("productId", value)}
      />
      <Field
        label="Category ID"
        value={values.categoryId}
        onChange={(value) => set("categoryId", value)}
      />
      <Field
        label="Warehouse ID"
        value={values.warehouseId}
        onChange={(value) => set("warehouseId", value)}
      />
      <Field
        label="Currency"
        value={values.currency}
        onChange={(value) => set("currency", value.toUpperCase())}
      />
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <CalendarDays className="h-4 w-4" />
        {semantics}
      </span>
    </Card>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="grid min-w-32 gap-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
