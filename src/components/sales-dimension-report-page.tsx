import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2, Printer, RefreshCw } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SalesReportFilters,
  type SalesReportFilterValues,
} from "@/components/sales-report-filters";

type ReportKind =
  "customers" | "products" | "salespeople" | "quote-conversion" | "fulfillment" | "profitability";
const today = new Date().toISOString().slice(0, 10);
const start = `${new Date().getFullYear()}-01-01`;
const initial: SalesReportFilterValues = {
  dateFrom: start,
  dateTo: today,
  customerId: "",
  salespersonId: "",
  productId: "",
  categoryId: "",
  warehouseId: "",
  currency: "",
};
const titles: Record<ReportKind, string> = {
  customers: "Sales by Customer",
  products: "Sales by Product",
  salespeople: "Sales by Salesperson",
  "quote-conversion": "Quote Conversion",
  fulfillment: "Order Fulfillment",
  profitability: "Sales Profitability",
};
function useSalesReportRealtime(kind: ReportKind, tenantId: string | undefined, refetch: () => Promise<unknown>) {
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase.channel(`sales-report-${kind}-${tenantId}`);

    const refresh = () => {
      void refetch();
    };

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_orders", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_quotes", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments_received", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [kind, refetch, tenantId]);
}

export function SalesDimensionReportPage({ kind }: { kind: ReportKind }) {
  const { tenant } = useAuth();
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(0);
  const [emailOpen] = useState(false);
  useEffect(() => {
    if (tenant?.currency && !filters.currency) {
      setFilters((current) => ({ ...current, currency: tenant.currency }));
    }
  }, [filters.currency, tenant?.currency]);
  const query = useQuery({
    queryKey: ["sales", kind, filters, page],
    enabled: !!tenant?.id && !!filters.currency,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const names: Record<ReportKind, string> = {
        customers: "get_sales_by_customer",
        products: "get_sales_by_product",
        salespeople: "get_sales_by_salesperson",
        "quote-conversion": "get_quote_conversion_report",
        fulfillment: "get_order_fulfillment_report",
        profitability: "get_sales_profitability",
      };
      const base = {
        _date_from: filters.dateFrom,
        _date_to: filters.dateTo,
        _currency: filters.currency || null,
      };
      const args =
        kind === "customers"
          ? {
              ...base,
              _customer_id: filters.customerId || null,
              _salesperson_id: filters.salespersonId || null,
              _limit: 50,
              _offset: page * 50,
            }
          : kind === "products"
            ? {
                ...base,
                _customer_id: filters.customerId || null,
                _salesperson_id: filters.salespersonId || null,
                _product_id: filters.productId || null,
                _limit: 50,
                _offset: page * 50,
              }
            : kind === "salespeople"
              ? { ...base, _limit: 50, _offset: page * 50 }
              : kind === "quote-conversion"
                ? {
                    ...base,
                    _customer_id: filters.customerId || null,
                    _salesperson_id: filters.salespersonId || null,
                  }
                : kind === "fulfillment"
                  ? {
                      ...base,
                      _customer_id: filters.customerId || null,
                      _limit: 50,
                      _offset: page * 50,
                    }
                  : {
                      ...base,
                      _group_by: "customer",
                      _customer_id: filters.customerId || null,
                      _limit: 50,
                      _offset: page * 50,
                    };
      const { data, error } = await db.rpc(names[kind], args);
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });
  useSalesReportRealtime(kind, tenant?.id, query.refetch);

  const rows = (query.data?.rows ?? []) as Array<Record<string, string | number>>;
  const funnel = query.data ?? {};
  const columns = useMemo(
    () =>
      kind === "customers"
        ? [
            "Customer",
            "Orders",
            "Invoices",
            "Gross Sales",
            "Net Sales",
            "COGS",
            "Gross Profit",
            "Margin %",
            "Paid",
            "Outstanding",
            "Overdue",
          ]
        : kind === "products"
          ? [
              "Product",
              "Units Sold",
              "Gross Sales",
              "Discounts",
              "Net Sales",
              "COGS",
              "Gross Profit",
              "Margin %",
            ]
          : kind === "salespeople"
            ? [
                "Salesperson",
                "Quotes",
                "Quoted Value",
                "Accepted Quotes",
                "Conversion Rate",
                "Orders",
                "Order Value",
                "Invoices",
                "Sales",
                "Gross Profit",
                "Margin %",
              ]
            : kind === "fulfillment"
              ? [
                  "Order",
                  "Customer",
                  "Order Date",
                  "Promised Date",
                  "Order Value",
                  "Fulfillment %",
                  "Invoice %",
                  "Payment %",
                  "Status",
                ]
              : kind === "profitability"
                ? ["Group", "Revenue", "COGS", "Gross Profit", "Margin %"]
                : [],
    [kind],
  );
  const exportCsv = () => {
    const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const blob = new Blob(
      [
        columns.map(csv).join(",") +
          "\n" +
          rows
            .map((row) => columns.map((column) => csv(valueForColumn(column, row))).join(","))
            .join("\n"),
      ],
      { type: "text/csv" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${kind}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const exportPdf = () => {
    const pdf = new jsPDF({ orientation: columns.length > 8 ? "landscape" : "portrait" });
    pdf.setFontSize(14);
    pdf.text(titles[kind], 14, 16);
    pdf.setFontSize(8);
    pdf.text(`${filters.dateFrom} to ${filters.dateTo} - ${filters.currency}`, 14, 22);
    autoTable(pdf, {
      head: [columns],
      body: rows.map((row) => columns.map((column) => String(valueForColumn(column, row) ?? "—"))),
      startY: 27,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    pdf.save(`${kind}.pdf`);
  };
  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
          <div>
            <p className="text-xs text-muted-foreground">Reports / Sales</p>
            <h1 className="mt-1 text-2xl font-bold">{titles[kind]}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" onClick={exportPdf}>
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
          </div>
        </header>
        <SalesReportFilters
          values={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(0);
          }}
        />
        {query.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : query.isError ? (
          <Card className="p-5 text-sm text-destructive">
            Unable to load report. {query.error.message}
          </Card>
        ) : kind === "quote-conversion" ? (
          <Funnel data={funnel} />
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      {columns.map((column) => (
                        <th className="p-3 text-left" key={column}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr
                        className="border-t"
                        key={String(row.id ?? row.customer_id ?? row.item_id ?? index)}
                      >
                        {columns.map((column) => (
                          <td className="p-3" key={column}>
                            {String(valueForColumn(column, row) ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  No report data for this period.
                </p>
              )}
            </Card>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Page {page + 1} · Database pagination</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rows.length < 50}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function Funnel({ data }: { data: Record<string, unknown> }) {
  const items = [
    ["Created", data.created],
    ["Sent", data.sent],
    ["Viewed", data.viewed],
    ["Accepted", data.accepted],
    ["Orders", data.orders],
    ["Invoiced", data.invoiced],
    ["Paid", data.paid],
  ];
  return (
    <Card className="p-5">
      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {items.map(([label, value]) => (
          <div className="rounded border p-4 text-center" key={String(label)}>
            <p className="text-xs text-muted-foreground">{String(label)}</p>
            <p className="mt-2 font-mono text-2xl font-bold">{String(value ?? 0)}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-2 text-sm">
        <p>
          Quoted value: <strong>{String(data.quoted_value ?? 0)}</strong>
        </p>
        <p>
          Won value: <strong>{String(data.won_value ?? 0)}</strong>
        </p>
        <p>
          Acceptance rate: <strong>{String(data.acceptance_rate ?? 0)}%</strong>
        </p>
        <p>
          Quote to order rate: <strong>{String(data.conversion_rate ?? 0)}%</strong>
        </p>
      </div>
    </Card>
  );
}

function valueForColumn(column: string, row: Record<string, string | number>) {
  const keys: Record<string, string> = {
    Customer: "name",
    Product: "product",
    Salesperson: "salesperson",
    Orders: "orders",
    Invoices: "invoices",
    "Gross Sales": "gross_sales",
    "Net Sales": "net_sales",
    COGS: "cogs",
    "Gross Profit": "gross_profit",
    "Margin %": "margin_percent",
    Paid: "paid",
    Outstanding: "outstanding",
    Overdue: "overdue",
    "Units Sold": "units_sold",
    Discounts: "discounts",
    Quotes: "quotes",
    "Quoted Value": "quoted_value",
    "Accepted Quotes": "accepted_quotes",
    "Conversion Rate": "conversion_rate",
    "Order Value": "order_value",
    Sales: "sales",
    Order: "number",
    "Order Date": "order_date",
    "Promised Date": "promised_date",
    "Fulfillment %": "fulfillment_percent",
    "Invoice %": "invoice_percent",
    "Payment %": "payment_percent",
    Status: "status",
    Group: "group_name",
    Revenue: "revenue",
  };
  const key = keys[column];
  return key ? row[key] : row[column.toLowerCase().replaceAll(" ", "_")];
}
