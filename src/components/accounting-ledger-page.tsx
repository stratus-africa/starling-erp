import { QueryError } from "@/components/query-state";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, Loader2, Printer, Wallet } from "lucide-react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { formatBaseCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TxnKind =
  | "invoice"
  | "credit_note"
  | "payment_received"
  | "bill"
  | "payment_made"
  | "expense"
  | "bank";

const KIND_LABELS: Record<TxnKind, string> = {
  invoice: "Invoice",
  credit_note: "Credit Note",
  payment_received: "Payment Received",
  bill: "Bill",
  payment_made: "Payment Made",
  expense: "Expense",
  bank: "Bank Transaction",
};

const KIND_PATHS: Partial<Record<TxnKind, string>> = {
  invoice: "/sales/invoices",
  credit_note: "/sales/credit-notes",
  payment_received: "/sales/payments",
  bill: "/purchasing/bills",
  payment_made: "/purchasing/payments",
  expense: "/expenses",
};

interface Txn {
  id: string;
  kind: TxnKind;
  date: string;
  number: string | null;
  party: string;
  description: string;
  status: string | null;
  posted: boolean;
  /** Positive = money in / income, negative = money out / cost. */
  signed: number;
  amount: number;
  cash: number;
}

interface AccountBalance {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  debit: number;
  credit: number;
  movement: number;
  balance: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

export function AccountingLedgerPage() {
  const { tenant } = useAuth();
  const currency = tenant?.currency ?? "KES";
  const [dateFrom, setDateFrom] = useState(startOfYear);
  const [dateTo, setDateTo] = useState(today);
  const [kind, setKind] = useState<"all" | TxnKind>("all");
  const [search, setSearch] = useState("");
  const [postedOnly, setPostedOnly] = useState(true);

  const money = (value: number) =>
    formatBaseCurrency(value, currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const query = useQuery({
    queryKey: ["accounting-ledger", tenant?.id, dateFrom, dateTo],
    enabled: Boolean(tenant?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const range = (table: string, columns: string, dateColumn = "date") =>
        db
          .from(table)
          .select(columns)
          .is("deleted_at", null)
          .gte(dateColumn, dateFrom)
          .lte(dateColumn, dateTo)
          .order(dateColumn, { ascending: false })
          .limit(1000);

      const [
        invoices,
        creditNotes,
        received,
        bills,
        made,
        expenses,
        bankTxns,
        customers,
        suppliers,
        accounts,
        banks,
        entries,
      ] = await Promise.all([
        range("invoices", "id,number,date,customer_id,grand_total,amount_paid,balance_due,status,posted_at,notes"),
        range("credit_notes", "id,number,date,customer_id,grand_total,amount,status,posted_at,reason"),
        range("payments_received", "id,number,date,customer_id,amount,mode,reference,status,posted_at"),
        range("bills", "id,number,date,supplier_id,grand_total,amount_paid,balance_due,status,posted_at,notes"),
        range("payments_made", "id,number,date,supplier_id,amount,mode,reference,status,posted_at"),
        range("expenses", "id,number,date,supplier_id,total,amount,category,status,posted_at,merchant"),
        range("bank_transactions", "id,number,date,bank_account_id,type,amount,payee,description,status,posted_at"),
        db.from("customers").select("id,name").is("deleted_at", null),
        db.from("suppliers").select("id,name").is("deleted_at", null),
        db
          .from("chart_of_accounts")
          .select("id,code,name,type,normal_balance,balance,opening_balance")
          .is("deleted_at", null)
          .order("code"),
        db.from("bank_accounts").select("id,name,bank,currency,balance").is("deleted_at", null),
        db
          .from("journal_entries")
          .select("id,entry_date,status")
          .is("deleted_at", null)
          .gte("entry_date", dateFrom)
          .lte("entry_date", dateTo)
          .limit(2000),
      ]);

      const firstError = [
        invoices,
        creditNotes,
        received,
        bills,
        made,
        expenses,
        bankTxns,
        customers,
        suppliers,
        accounts,
        banks,
        entries,
      ].find((result: any) => result?.error)?.error;
      if (firstError) throw firstError;

      const entryIds = (entries.data ?? []).map((row: any) => row.id);
      let lines: any[] = [];
      if (entryIds.length) {
        const chunks: string[][] = [];
        for (let index = 0; index < entryIds.length; index += 200)
          chunks.push(entryIds.slice(index, index + 200));
        const results = await Promise.all(
          chunks.map((chunk) =>
            db.from("journal_lines").select("journal_id,account_id,debit,credit").in("journal_id", chunk),
          ),
        );
        const lineError = results.find((result: any) => result?.error)?.error;
        if (lineError) throw lineError;
        lines = results.flatMap((result: any) => result.data ?? []);
      }

      const customerName = new Map<string, string>(
        (customers.data ?? []).map((row: any) => [row.id, row.name]),
      );
      const supplierName = new Map<string, string>(
        (suppliers.data ?? []).map((row: any) => [row.id, row.name]),
      );
      const bankName = new Map<string, string>(
        (banks.data ?? []).map((row: any) => [row.id, row.name]),
      );

      const num = (value: unknown) => Number(value ?? 0) || 0;
      const isPosted = (row: any) => Boolean(row.posted_at);

      const txns: Txn[] = [
        ...(invoices.data ?? []).map((row: any) => ({
          id: row.id,
          kind: "invoice" as TxnKind,
          date: row.date,
          number: row.number,
          party: customerName.get(row.customer_id) ?? "—",
          description: row.notes ?? "Customer invoice",
          status: row.status,
          posted: isPosted(row),
          signed: num(row.grand_total),
          amount: num(row.grand_total),
          cash: 0,
        })),
        ...(creditNotes.data ?? []).map((row: any) => ({
          id: row.id,
          kind: "credit_note" as TxnKind,
          date: row.date,
          number: row.number,
          party: customerName.get(row.customer_id) ?? "—",
          description: row.reason ?? "Customer credit note",
          status: row.status,
          posted: isPosted(row),
          signed: -num(row.grand_total ?? row.amount),
          amount: num(row.grand_total ?? row.amount),
          cash: 0,
        })),
        ...(received.data ?? []).map((row: any) => ({
          id: row.id,
          kind: "payment_received" as TxnKind,
          date: row.date,
          number: row.number,
          party: customerName.get(row.customer_id) ?? "—",
          description: [row.mode, row.reference].filter(Boolean).join(" · ") || "Customer payment",
          status: row.status,
          posted: isPosted(row),
          signed: 0,
          amount: num(row.amount),
          cash: num(row.amount),
        })),
        ...(bills.data ?? []).map((row: any) => ({
          id: row.id,
          kind: "bill" as TxnKind,
          date: row.date,
          number: row.number,
          party: supplierName.get(row.supplier_id) ?? "—",
          description: row.notes ?? "Supplier bill",
          status: row.status,
          posted: isPosted(row),
          signed: -num(row.grand_total),
          amount: num(row.grand_total),
          cash: 0,
        })),
        ...(made.data ?? []).map((row: any) => ({
          id: row.id,
          kind: "payment_made" as TxnKind,
          date: row.date,
          number: row.number,
          party: supplierName.get(row.supplier_id) ?? "—",
          description: [row.mode, row.reference].filter(Boolean).join(" · ") || "Supplier payment",
          status: row.status,
          posted: isPosted(row),
          signed: 0,
          amount: num(row.amount),
          cash: -num(row.amount),
        })),
        ...(expenses.data ?? []).map((row: any) => ({
          id: row.id,
          kind: "expense" as TxnKind,
          date: row.date,
          number: row.number,
          party: row.merchant ?? supplierName.get(row.supplier_id) ?? "—",
          description: row.category ?? "Expense",
          status: row.status,
          posted: isPosted(row),
          signed: -num(row.total ?? row.amount),
          amount: num(row.total ?? row.amount),
          cash: -num(row.total ?? row.amount),
        })),
        ...(bankTxns.data ?? []).map((row: any) => {
          const inflow = String(row.type ?? "").toLowerCase().includes("deposit") ||
            String(row.type ?? "").toLowerCase().includes("receipt") ||
            String(row.type ?? "").toLowerCase().includes("in");
          return {
            id: row.id,
            kind: "bank" as TxnKind,
            date: row.date,
            number: row.number,
            party: row.payee ?? bankName.get(row.bank_account_id) ?? "—",
            description: row.description ?? row.type ?? "Bank transaction",
            status: row.status,
            posted: isPosted(row),
            signed: 0,
            amount: num(row.amount),
            cash: inflow ? num(row.amount) : -num(row.amount),
          };
        }),
      ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

      const totals = new Map<string, { debit: number; credit: number }>();
      for (const line of lines) {
        const current = totals.get(line.account_id) ?? { debit: 0, credit: 0 };
        current.debit += num(line.debit);
        current.credit += num(line.credit);
        totals.set(line.account_id, current);
      }

      const accountBalances: AccountBalance[] = (accounts.data ?? []).map((row: any) => {
        const total = totals.get(row.id) ?? { debit: 0, credit: 0 };
        const credited = String(row.normal_balance ?? "").toLowerCase() === "credit";
        const movement = credited ? total.credit - total.debit : total.debit - total.credit;
        return {
          id: row.id,
          code: row.code,
          name: row.name,
          type: row.type,
          debit: total.debit,
          credit: total.credit,
          movement,
          balance: num(row.balance),
        };
      });

      return {
        txns,
        accounts: accountBalances,
        banks: (banks.data ?? []) as Array<{ id: string; name: string; bank: string | null; balance: number }>,
      };
    },
  });

  const txns = query.data?.txns ?? [];
  const accounts = query.data?.accounts ?? [];
  const banks = query.data?.banks ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return txns.filter((txn) => {
      if (kind !== "all" && txn.kind !== kind) return false;
      if (postedOnly && !txn.posted) return false;
      if (!term) return true;
      return (
        (txn.number ?? "").toLowerCase().includes(term) ||
        txn.party.toLowerCase().includes(term) ||
        txn.description.toLowerCase().includes(term)
      );
    });
  }, [txns, kind, postedOnly, search]);

  const summary = useMemo(() => {
    const posted = txns.filter((txn) => txn.posted);
    const income = posted
      .filter((txn) => txn.kind === "invoice" || txn.kind === "credit_note")
      .reduce((sum, txn) => sum + txn.signed, 0);
    const costs = posted
      .filter((txn) => txn.kind === "bill" || txn.kind === "expense")
      .reduce((sum, txn) => sum + Math.abs(txn.signed), 0);
    const cashIn = posted.filter((txn) => txn.cash > 0).reduce((sum, txn) => sum + txn.cash, 0);
    const cashOut = posted.filter((txn) => txn.cash < 0).reduce((sum, txn) => sum - txn.cash, 0);
    const outstandingIn = txns
      .filter((txn) => txn.kind === "invoice" && txn.posted)
      .reduce((sum, txn) => sum + txn.signed, 0) - cashIn;
    return {
      income,
      costs,
      profit: income - costs,
      cashIn,
      cashOut,
      netCash: cashIn - cashOut,
      outstandingIn,
      bankBalance: banks.reduce((sum, bank) => sum + (Number(bank.balance) || 0), 0),
    };
  }, [txns, banks]);

  const byType = useMemo(() => {
    const groups = new Map<string, AccountBalance[]>();
    for (const account of accounts) {
      const key = account.type ?? "Other";
      groups.set(key, [...(groups.get(key) ?? []), account]);
    }
    return Array.from(groups.entries());
  }, [accounts]);

  const exportCsv = () => {
    const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const header = ["Date", "Type", "Number", "Party", "Description", "Status", "Amount", "Cash Effect"];
    const body = filtered.map((txn) =>
      [
        txn.date,
        KIND_LABELS[txn.kind],
        txn.number ?? "",
        txn.party,
        txn.description,
        txn.status ?? "",
        txn.amount.toFixed(2),
        txn.cash.toFixed(2),
      ].map(cell).join(","),
    );
    const blob = new Blob([[header.map(cell).join(","), ...body].join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `accounting-ledger-${dateFrom}-to-${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
          <div>
            <p className="text-xs text-muted-foreground">Accounting</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
              <Wallet className="h-6 w-6 text-primary" />
              Accounting Ledger
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every invoice, payment, credit, bill, expense and bank transaction, with account
              balances, cash movement and profit for the period.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </div>
        </header>

        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="grid min-w-36 gap-1.5">
            <Label>Date from</Label>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="grid min-w-36 gap-1.5">
            <Label>Date to</Label>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <div className="grid min-w-44 gap-1.5">
            <Label>Transaction type</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All transactions</SelectItem>
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-48 flex-1 gap-1.5">
            <Label>Search</Label>
            <Input
              placeholder="Number, party or description"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button
            variant={postedOnly ? "default" : "outline"}
            onClick={() => setPostedOnly((value) => !value)}
          >
            {postedOnly ? "Posted only" : "Including drafts"}
          </Button>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Income (posted)" value={money(summary.income)} tone="text-emerald-700" />
          <Kpi label="Costs & expenses" value={money(summary.costs)} tone="text-orange-700" />
          <Kpi
            label="Net profit"
            value={money(summary.profit)}
            tone={summary.profit >= 0 ? "text-emerald-700" : "text-destructive"}
          />
          <Kpi label="Bank balance" value={money(summary.bankBalance)} tone="text-blue-700" />
          <Kpi label="Cash in" value={money(summary.cashIn)} tone="text-emerald-700" />
          <Kpi label="Cash out" value={money(summary.cashOut)} tone="text-orange-700" />
          <Kpi
            label="Net cash movement"
            value={money(summary.netCash)}
            tone={summary.netCash >= 0 ? "text-emerald-700" : "text-destructive"}
          />
          <Kpi label="Awaiting collection" value={money(Math.max(summary.outstandingIn, 0))} tone="text-amber-700" />
        </div>

        {query.isLoading ? (
          <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading ledger…
          </Card>
        ) : query.isError ? (
          <QueryError error={query.error} retry={() => query.refetch()} label="We couldn't load the ledger." />
        ) : (
          <Tabs defaultValue="transactions">
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              <TabsTrigger value="transactions">Transactions ({filtered.length})</TabsTrigger>
              <TabsTrigger value="accounts">Chart of Accounts</TabsTrigger>
              <TabsTrigger value="cash">Cash & Profit</TabsTrigger>
            </TabsList>

            <TabsContent value="transactions" className="mt-4">
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-3 text-left">Date</th>
                        <th className="p-3 text-left">Type</th>
                        <th className="p-3 text-left">Number</th>
                        <th className="p-3 text-left">Party</th>
                        <th className="p-3 text-left">Description</th>
                        <th className="p-3 text-left">Status</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3 text-right">Cash effect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((txn) => {
                        const path = KIND_PATHS[txn.kind];
                        return (
                          <tr className="border-t hover:bg-muted/30" key={`${txn.kind}-${txn.id}`}>
                            <td className="whitespace-nowrap p-3">{txn.date}</td>
                            <td className="whitespace-nowrap p-3">{KIND_LABELS[txn.kind]}</td>
                            <td className="whitespace-nowrap p-3 font-mono text-xs">
                              {path ? (
                                <Link className="text-primary hover:underline" to={`${path}/${txn.id}` as string as never}>
                                  {txn.number ?? "—"}
                                </Link>
                              ) : (
                                (txn.number ?? "—")
                              )}
                            </td>
                            <td className="p-3">{txn.party}</td>
                            <td className="max-w-72 truncate p-3 text-muted-foreground">
                              {txn.description}
                            </td>
                            <td className="p-3">
                              <Badge variant={txn.posted ? "secondary" : "outline"}>
                                {txn.status ?? (txn.posted ? "Posted" : "Draft")}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap p-3 text-right font-mono">
                              {money(txn.amount)}
                            </td>
                            <td
                              className={`whitespace-nowrap p-3 text-right font-mono ${
                                txn.cash > 0
                                  ? "text-emerald-700"
                                  : txn.cash < 0
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {txn.cash ? money(txn.cash) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    No transactions for this period and filter.
                  </p>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="accounts" className="mt-4 space-y-4">
              {byType.map(([type, list]) => (
                <Card className="overflow-hidden" key={type}>
                  <div className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide">
                    {type}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="p-3 text-left">Code</th>
                          <th className="p-3 text-left">Account</th>
                          <th className="p-3 text-right">Debits</th>
                          <th className="p-3 text-right">Credits</th>
                          <th className="p-3 text-right">Period movement</th>
                          <th className="p-3 text-right">Current balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((account) => (
                          <tr className="border-t" key={account.id}>
                            <td className="p-3 font-mono text-xs">{account.code ?? "—"}</td>
                            <td className="p-3">{account.name}</td>
                            <td className="p-3 text-right font-mono">{money(account.debit)}</td>
                            <td className="p-3 text-right font-mono">{money(account.credit)}</td>
                            <td className="p-3 text-right font-mono">{money(account.movement)}</td>
                            <td className="p-3 text-right font-mono font-semibold">
                              {money(account.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
              {!accounts.length && (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                  No accounts found in the chart of accounts.
                </Card>
              )}
            </TabsContent>

            <TabsContent value="cash" className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="text-sm font-semibold">Cash position</h2>
                <table className="mt-3 w-full text-sm">
                  <tbody>
                    {banks.map((bank) => (
                      <tr className="border-t" key={bank.id}>
                        <td className="py-2">{bank.name}</td>
                        <td className="py-2 text-xs text-muted-foreground">{bank.bank ?? ""}</td>
                        <td className="py-2 text-right font-mono">
                          {money(Number(bank.balance) || 0)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 font-semibold">
                      <td className="py-2" colSpan={2}>
                        Total bank & cash
                      </td>
                      <td className="py-2 text-right font-mono">{money(summary.bankBalance)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-4 grid gap-1.5 text-sm">
                  <Line label="Cash received in period" value={money(summary.cashIn)} />
                  <Line label="Cash paid in period" value={money(summary.cashOut)} />
                  <Line label="Net cash movement" value={money(summary.netCash)} strong />
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="text-sm font-semibold">Profit for the period</h2>
                <div className="mt-3 grid gap-1.5 text-sm">
                  <Line label="Invoiced sales" value={money(summary.income)} />
                  <Line label="Supplier bills & expenses" value={money(summary.costs)} />
                  <Line label="Net profit" value={money(summary.profit)} strong />
                </div>
                <h3 className="mt-5 text-sm font-semibold">Income & expense accounts</h3>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {accounts
                      .filter(
                        (account) =>
                          (account.type === "Income" || account.type === "Expense") &&
                          account.movement !== 0,
                      )
                      .map((account) => (
                        <tr className="border-t" key={account.id}>
                          <td className="py-2 font-mono text-xs">{account.code ?? "—"}</td>
                          <td className="py-2">{account.name}</td>
                          <td className="py-2 text-right font-mono">{money(account.movement)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${tone}`}>{value}</p>
    </Card>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between border-b py-1.5 last:border-0 ${
        strong ? "font-semibold" : ""
      }`}
    >
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
