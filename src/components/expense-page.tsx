import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  MoreHorizontal,
  Percent,
  Save,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFkOptions } from "@/hooks/use-module-data";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { formatBaseCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const db = supabase as any;
const categories = [
  "Travel",
  "Meals",
  "Office Supplies",
  "Utilities",
  "Rent",
  "Software",
  "Marketing",
  "Freight",
  "Repairs",
  "Other",
];
const modes = ["Cash", "Bank Transfer", "Card", "Cheque", "Mobile Money"];
const currencies = ["USD", "EUR", "GBP", "KES", "AED", "EGP", "INR", "ZAR"];
const statusStyles: Record<string, string> = {
  Unbilled: "bg-slate-100 text-slate-700",
  Billed: "bg-blue-100 text-blue-700",
  Reimbursed: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-100 text-red-700",
};
type Row = Record<string, any>;
const money = (value: number, currency: string) =>
  formatBaseCurrency(value, currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const initialValues = (currency: string): Row => ({
  number: "",
  date: new Date().toISOString().slice(0, 10),
  category: "Other",
  supplier_id: "",
  account_id: "",
  bank_account_id: "",
  mode: "Cash",
  reference: "",
  currency,
  amount: "",
  tax_amount: 0,
  total: 0,
  status: "Draft",
  notes: "",
});

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <Badge className={`border-0 ${statusStyles[value] ?? "bg-muted text-muted-foreground"}`}>
      {value}
    </Badge>
  );
}
function Fk({
  table,
  value,
  onChange,
  label,
}: {
  table: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const { data = [] } = useFkOptions(table, "name");
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={`Select ${label}…`} />
      </SelectTrigger>
      <SelectContent>
        {data.map((item: any) => (
          <SelectItem key={item.id} value={item.id}>
            {item.name}
            {item.code ? ` · ${item.code}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function InfoGrid({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-medium">{value || "Not set"}</p>
        </div>
      ))}
    </div>
  );
}
function Kpi({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <Card className="flex min-h-[104px] flex-col justify-between p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
        {icon}
      </div>
      <p className="font-mono text-xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}
function Activity({ rows }: { rows: Row[] }) {
  return rows.length ? (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="border-l-2 border-primary/20 pl-3">
          <p className="text-sm font-medium">{row.action ?? row.event_type ?? "Expense updated"}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(row.created_at ?? row.occurred_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  ) : (
    <p className="py-6 text-sm text-muted-foreground">No activity recorded.</p>
  );
}

export function ExpensePage({ id }: { id: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { tenant, can } = useAuth();
  const isNew = id === "new";
  const canWrite = can(["purchasing.create", "purchasing.update", "purchasing.post"]);
  const [editMode, setEditMode] = useState(isNew);
  const [tab, setTab] = useState("overview");
  const [values, setValues] = useState<Row>(() => initialValues(tenant?.currency ?? "KES"));
  const [taxRate, setTaxRate] = useState(0);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const {
    data: expense,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["expenses", "record", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("expenses").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: audit = [] } = useQuery({
    queryKey: ["audit_logs", "expenses", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await db
        .from("audit_logs")
        .select("*")
        .eq("table_name", "expenses")
        .eq("record_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: events = [] } = useQuery({
    queryKey: ["business_events", "expense", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await db
        .from("business_events")
        .select("*")
        .eq("entity_type", "expense")
        .eq("entity_id", id)
        .order("occurred_at", { ascending: false });
      return data ?? [];
    },
  });
  useEffect(() => {
    if (expense) {
      setValues(expense);
      setTaxRate(
        Number(expense.amount)
          ? (Number(expense.tax_amount ?? 0) / Number(expense.amount)) * 100
          : 0,
      );
    }
  }, [expense]);
  const update = (key: string, value: any) =>
    setValues((current) => ({ ...current, [key]: value }));
  const amount = Number(values.amount) || 0;
  const taxAmount = Math.round(amount * taxRate) / 100;
  const total = Math.round((taxInclusive ? amount : amount + taxAmount) * 100) / 100;
  const currency = values.currency || tenant?.currency || "KES";
  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant selected");
      if (!values.date || !values.category || !values.account_id || amount <= 0 || !currency)
        throw new Error("Date, category, expense account, amount, and currency are required");
      const payload = {
        ...values,
        tenant_id: tenant.id,
        number: values.number || `EXP-${Date.now().toString().slice(-6)}`,
        amount,
        tax_amount: taxAmount,
        total,
        status: isNew ? "Draft" : (expense?.status ?? "Draft"),
        supplier_id: values.supplier_id || null,
        account_id: values.account_id || null,
        bank_account_id: values.bank_account_id || null,
        reference: values.reference || null,
        notes: values.notes || null,
      };
      ["id", "created_at", "updated_at", "deleted_at", "posted_at", "voided_at"].forEach(
        (key) => delete payload[key],
      );
      if (isNew) {
        const { data, error } = await db.from("expenses").insert(payload).select("id").single();
        if (error) throw error;
        return data.id;
      }
      const { error } = await db.from("expenses").update(payload).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (savedId) => {
      toast.success(isNew ? "Expense created" : "Expense saved");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      if (isNew) nav({ to: `/purchasing/expenses/${savedId}` as never });
      else setEditMode(false);
    },
    onError: (saveError: Error) => toast.error(saveError.message),
  });
  const transition = useMutation({
    mutationFn: async (newStatus: string) => {
      const { data, error } = await db.rpc("transition_expense", {
        _expense_id: id,
        _new_status: newStatus,
        _reason: `Expense transitioned to ${newStatus}`,
      });
      if (error) throw error;
      return String(data ?? newStatus);
    },
    onSuccess: () => {
      toast.success("Expense status updated");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses", "record", id] });
    },
    onError: (transitionError: Error) => toast.error(transitionError.message),
  });
  if (!isNew && isLoading)
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (error || (!isNew && !expense))
    return (
      <div className="m-6 rounded-lg border border-destructive/30 p-6">
        <p className="font-semibold">Unable to load expense.</p>
        <Button
          className="mt-4"
          onClick={() => qc.invalidateQueries({ queryKey: ["expenses", "record", id] })}
        >
          Try Again
        </Button>
      </div>
    );
  if (editMode)
    return (
      <ExpenseEditor
        id={id}
        values={values}
        update={update}
        taxRate={taxRate}
        setTaxRate={setTaxRate}
        taxInclusive={taxInclusive}
        setTaxInclusive={setTaxInclusive}
        amount={amount}
        taxAmount={taxAmount}
        total={total}
        currency={currency}
        canWrite={canWrite}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onCancel={() => (isNew ? nav({ to: "/purchasing/expenses" as never }) : setEditMode(false))}
      />
    );
  const status = expense.status ?? "Draft";
  const expenseAmount = Number(expense.amount ?? 0);
  const expenseTax = Number(expense.tax_amount ?? 0);
  const expenseTotal = Number(expense.total ?? expenseAmount + expenseTax);
  const progress =
    status === "Rejected"
      ? ["Draft", "Rejected"]
      : ["Draft", "Submitted", "Pending Approval", "Approved", "Posted"];
  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6 xl:p-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => nav({ to: "/purchasing/expenses" as never })}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{expense.number}</h1>
                <Status value={status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {expense.category} · {expense.date} · Reference {expense.reference ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {canWrite && !expense.posted_at && (
              <Button onClick={() => setEditMode(true)}>Edit</Button>
            )}
            {canWrite && status === "Draft" && (
              <Button variant="outline" onClick={() => transition.mutate("Submitted")}>Submit</Button>
            )}
            {canWrite && status === "Submitted" && (
              <Button variant="outline" onClick={() => transition.mutate("Pending Approval")}>Send to Approval</Button>
            )}
            {canWrite && status === "Pending Approval" && (
              <>
                <Button variant="outline" onClick={() => transition.mutate("Rejected")}>Reject</Button>
                <Button onClick={() => transition.mutate("Approved")}>Approve</Button>
              </>
            )}
            {canWrite && status === "Approved" && (
              <Button onClick={() => transition.mutate("Posted")}>Post Expense</Button>
            )}
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Expense"
            value={money(expenseAmount, currency)}
            icon={<FileText className="h-4 w-4 text-primary" />}
          />
          <Kpi
            label="Tax"
            value={money(expenseTax, currency)}
            icon={<Percent className="h-4 w-4 text-primary" />}
          />
          <Kpi
            label="Total"
            value={money(expenseTotal, currency)}
            icon={<WalletCards className="h-4 w-4 text-primary" />}
          />
          <Kpi
            label="Payment"
            value={status === "Reimbursed" ? "Paid" : "Outstanding"}
            icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
          />
        </section>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          </TabsList>
          <div className="mt-4 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <main className="space-y-5">
              <TabsContent value="overview" className="mt-0 space-y-5">
                <InfoCard title="Expense Summary">
                  <InfoGrid
                    items={[
                      ["Supplier", expense.supplier_id],
                      ["Category", expense.category],
                      ["Expense Account", expense.account_id],
                      ["Payment Mode", expense.mode],
                      ["Currency", currency],
                      ["Reference", expense.reference],
                      ["Date", expense.date],
                      ["Status", status],
                    ]}
                  />
                </InfoCard>
                <InfoCard title="Financial Summary">
                  <InfoGrid
                    items={[
                      ["Amount Excl. Tax", money(expenseAmount, currency)],
                      [
                        "Tax Rate",
                        `${expenseAmount ? ((expenseTax / expenseAmount) * 100).toFixed(2) : "0.00"}%`,
                      ],
                      ["Tax Amount", money(expenseTax, currency)],
                      ["Total Amount", money(expenseTotal, currency)],
                      [
                        "Amount Paid",
                        status === "Reimbursed"
                          ? money(expenseTotal, currency)
                          : money(0, currency),
                      ],
                      [
                        "Balance Due",
                        status === "Reimbursed"
                          ? money(0, currency)
                          : money(expenseTotal, currency),
                      ],
                    ]}
                  />
                </InfoCard>
              </TabsContent>
              <TabsContent value="payments" className="mt-0">
                <InfoCard title="Payments">
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No payment relationship is recorded for expenses in the current accounting
                    model.
                  </p>
                </InfoCard>
              </TabsContent>
              <TabsContent value="documents" className="mt-0">
                <InfoCard title="Documents">
                  <AttachmentsPanel entityType="expense" entityId={id} />
                </InfoCard>
              </TabsContent>
              <TabsContent value="activity" className="mt-0">
                <InfoCard title="Recent Activity">
                  <Activity rows={events} />
                </InfoCard>
              </TabsContent>
              <TabsContent value="audit" className="mt-0">
                <InfoCard title="Audit Trail">
                  <Activity rows={audit} />
                </InfoCard>
              </TabsContent>
            </main>
            <aside className="space-y-5">
              <InfoCard title="Status Progress">
                <div className="space-y-3">
                  {progress.map((item, index) => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${item === status ? "bg-primary text-primary-foreground" : index < progress.indexOf(status) ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                      >
                        {index < progress.indexOf(status) ? "✓" : index + 1}
                      </span>
                      <span className={item === status ? "font-semibold" : "text-muted-foreground"}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </InfoCard>
              <InfoCard title="Notes">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {expense.notes || "No notes added."}
                </p>
              </InfoCard>
            </aside>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function ExpenseEditor({
  id,
  values,
  update,
  taxRate,
  setTaxRate,
  taxInclusive,
  setTaxInclusive,
  amount,
  taxAmount,
  total,
  currency,
  canWrite,
  saving,
  onSave,
  onCancel,
}: any) {
  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6 xl:p-8">
      <div className="mx-auto flex max-w-[1300px] flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {id === "new" ? "New Expense" : "Edit Expense"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Create and maintain a posted-ready expense record.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!canWrite || saving} onClick={onSave}>
              <Save className="mr-1.5 h-4 w-4" /> Save Draft
            </Button>
            <Button disabled={!canWrite || saving} onClick={onSave}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {id === "new" ? "Save Expense" : "Save Changes"}
            </Button>
          </div>
        </header>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <main className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Expense Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Field label="Expense #">
                  <Input
                    value={values.number || "Auto-generated on save"}
                    readOnly
                    className="bg-muted/40"
                  />
                </Field>
                <Field label="Date" required>
                  <Input
                    type="date"
                    value={values.date ?? ""}
                    onChange={(e) => update("date", e.target.value)}
                  />
                </Field>
                <Field label="Category" required>
                  <Select
                    value={values.category ?? ""}
                    onValueChange={(v) => update("category", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Supplier">
                  <Fk
                    table="suppliers"
                    value={values.supplier_id}
                    onChange={(v) => update("supplier_id", v)}
                    label="supplier"
                  />
                </Field>
                <Field label="Expense Account" required>
                  <Fk
                    table="chart_of_accounts"
                    value={values.account_id}
                    onChange={(v) => update("account_id", v)}
                    label="expense account"
                  />
                </Field>
                <Field label="Paid Through">
                  <Fk
                    table="bank_accounts"
                    value={values.bank_account_id}
                    onChange={(v) => update("bank_account_id", v)}
                    label="payment account"
                  />
                </Field>
                <Field label="Payment Mode">
                  <Select value={values.mode ?? "Cash"} onValueChange={(v) => update("mode", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modes.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Reference">
                  <Input
                    value={values.reference ?? ""}
                    onChange={(e) => update("reference", e.target.value)}
                  />
                </Field>
                <Field label="Currency" required>
                  <Select
                    value={values.currency ?? currency}
                    onValueChange={(v) => update("currency", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Amount &amp; Tax</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-4">
                <Field label="Amount (Excl. Tax)" required>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={values.amount ?? ""}
                    onChange={(e) => update("amount", e.target.value)}
                  />
                </Field>
                <Field label="Tax Rate">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                  />
                </Field>
                <Field label="Tax Amount">
                  <Input value={money(taxAmount, currency)} readOnly className="bg-muted/40" />
                </Field>
                <Field label="Total Amount">
                  <Input
                    value={money(total, currency)}
                    readOnly
                    className="bg-muted/40 font-semibold"
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm md:col-span-4">
                  <input
                    type="checkbox"
                    checked={taxInclusive}
                    onChange={(e) => setTaxInclusive(e.target.checked)}
                  />{" "}
                  Tax Inclusive
                </label>
              </CardContent>
            </Card>
          </main>
          <aside className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Attachments</CardTitle>
              </CardHeader>
              <CardContent>
                {id === "new" ? (
                  <p className="text-sm text-muted-foreground">
                    Save the expense before adding attachments.
                  </p>
                ) : (
                  <AttachmentsPanel entityType="expense" entityId={id} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Add any additional notes about this expense…"
                  value={values.notes ?? ""}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </CardContent>
            </Card>
          </aside>
        </div>
        <footer className="flex items-center justify-between border-t pt-4">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!canWrite || saving} onClick={onSave}>
              Save Draft
            </Button>
            <Button disabled={!canWrite || saving} onClick={onSave}>
              {id === "new" ? "Save Expense" : "Save Changes"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
