import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Mail, Printer, RefreshCw } from "lucide-react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { buildDocumentPdf, downloadDocumentPdf, type PdfDocInput } from "@/lib/document-pdf";
import { EmailDocumentDialog } from "@/components/email-document-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Statement = {
  opening_balance: number;
  total_debits: number;
  total_credits: number;
  closing_balance: number;
  transactions: Array<{
    date: string;
    transaction: string;
    reference: string | null;
    debit: number;
    credit: number;
    balance: number;
  }>;
};
export function CustomerStatementReportPage({ customerId }: { customerId: string }) {
  const { tenant } = useAuth();
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [emailOpen, setEmailOpen] = useState(false);
  const { data: customer } = useQuery({
    queryKey: ["customers", customerId, "statement"],
    queryFn: async () => {
      const { data, error } = await db
        .from("customers")
        .select("id,name,email,currency")
        .eq("id", customerId)
        .single();
      if (error) throw error;
      return data as { id: string; name: string; email: string | null; currency: string | null };
    },
  });
  const report = useQuery({
    queryKey: ["sales", "statement", customerId, from, to],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_customer_statement", {
        _customer_id: customerId,
        _date_from: from,
        _date_to: to,
      });
      if (error) throw error;
      return data as Statement;
    },
  });
  const currency = customer?.currency ?? tenant?.currency ?? "KES";
  const data = report.data;
  const pdf = (): PdfDocInput => ({
    title: "Customer Statement",
    number: customer?.name ?? customerId,
    companyName: tenant?.name ?? "Company",
    partyLabel: "Customer",
    partyName: customer?.name ?? "—",
    currency,
    meta: [
      { label: "From", value: from },
      { label: "To", value: to },
    ],
    lines: (data?.transactions ?? []).map((row) => ({
      description: `${row.transaction} ${row.reference ?? ""}`,
      quantity: 1,
      unit_price: row.debit - row.credit,
      discount_pct: 0,
      tax_pct: 0,
      line_total: row.debit - row.credit,
    })),
    totals: {
      subtotal: data?.total_debits ?? 0,
      discount_total: 0,
      tax_total: 0,
      grand_total: data?.closing_balance ?? 0,
    },
    branding: { accentColor: "#2563eb", logoUrl: "" },
    notes: `Opening balance: ${format(data?.opening_balance ?? 0, currency)}`,
  });
  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
          <div>
            <p className="text-xs text-muted-foreground">Reports / Sales / Customer Statement</p>
            <h1 className="mt-1 text-2xl font-bold">{customer?.name ?? "Customer Statement"}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" onClick={() => downloadDocumentPdf(pdf())}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <Button variant="outline" onClick={() => setEmailOpen(true)}>
              <Mail className="mr-2 h-4 w-4" />
              Email
            </Button>
            <Button variant="outline" onClick={() => report.refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <Field label="From" value={from} onChange={setFrom} />
          <Field label="To" value={to} onChange={setTo} />
        </Card>
        {report.isError ? (
          <Card className="p-5 text-sm text-destructive">
            Unable to load statement. {report.error.message}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Transaction</th>
                    <th className="p-3 text-left">Reference</th>
                    <th className="p-3 text-right">Debit</th>
                    <th className="p-3 text-right">Credit</th>
                    <th className="p-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.transactions ?? []).map((row, index) => (
                    <tr className="border-t" key={`${row.date}-${row.reference}-${index}`}>
                      <td className="p-3">{row.date}</td>
                      <td className="p-3">{row.transaction}</td>
                      <td className="p-3 font-mono text-xs">{row.reference ?? "—"}</td>
                      <td className="p-3 text-right font-mono">{format(row.debit, currency)}</td>
                      <td className="p-3 text-right font-mono">{format(row.credit, currency)}</td>
                      <td className="p-3 text-right font-mono">{format(row.balance, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 border-t bg-muted/20 p-4 text-sm sm:ml-auto sm:max-w-sm">
              <Summary
                label="Opening Balance"
                value={data?.opening_balance ?? 0}
                currency={currency}
              />
              <Summary label="Total Debits" value={data?.total_debits ?? 0} currency={currency} />
              <Summary label="Total Credits" value={data?.total_credits ?? 0} currency={currency} />
              <Summary
                label="Closing Balance"
                value={data?.closing_balance ?? 0}
                currency={currency}
              />
            </div>
          </Card>
        )}
      </div>
      {customer && (
        <EmailDocumentDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          defaultTo={customer.email}
          defaultSubject={`Statement for ${customer.name}`}
          defaultMessage={`Please find attached the customer statement for ${from} to ${to}.`}
          pdf={pdf}
          entityType="customer_statement"
          entityId={customerId}
        />
      )}
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
function Summary({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-mono">{format(value, currency)}</span>
    </div>
  );
}
function format(value: number, currency: string) {
  return `${currency} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
