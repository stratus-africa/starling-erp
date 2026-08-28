import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { useFkOptions } from "@/hooks/use-module-data";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, History, Loader2, Save, User2, ShoppingCart, Wallet } from "lucide-react";
import type { FieldDef } from "@/components/data-module-page";
import { CustomerSchema, formatZodError } from "@/lib/module-validation-schemas";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = (v: any, currency = "USD") =>
  v == null
    ? "—"
    : `${currency} ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateFmt = (v: any) =>
  !v ? "—" : new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = (v: any) => (!v ? "—" : new Date(v).toLocaleString());

// Address stored as newline-separated: Line1\nCity\nTown\nCounty\nRegion\nCountry
const ADDR_KEYS = ["line1", "city", "town", "county", "region", "country"] as const;
type AddrKey = (typeof ADDR_KEYS)[number];
const ADDR_LABELS: Record<AddrKey, string> = {
  line1: "Address Line 1",
  city: "City",
  town: "Town",
  county: "County",
  region: "Region",
  country: "Country",
};

function parseAddress(raw: string | null | undefined): Record<AddrKey, string> {
  const parts = (raw ?? "").split("\n");
  return Object.fromEntries(ADDR_KEYS.map((k, i) => [k, parts[i] ?? ""])) as Record<AddrKey, string>;
}

function serializeAddress(addr: Record<AddrKey, string>): string {
  return ADDR_KEYS.map((k) => addr[k] ?? "")
    .join("\n")
    .replace(/\n+$/, "");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FkField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: any;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { data: options = [] } = useFkOptions(field.fkTable!, field.fkLabel ?? "name");
  return (
    <Select value={value ?? ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={`Select ${field.label.toLowerCase()}…`} />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 && (
          <SelectItem value="__none" disabled>
            No options available
          </SelectItem>
        )}
        {options.map((o: any) => (
          <SelectItem key={o.id} value={o.id}>
            {o[field.fkLabel ?? "name"] ?? "Unnamed"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddressBlock({
  label,
  addrKey,
  values,
  canWrite,
  onChange,
}: {
  label: string;
  addrKey: "billing_address" | "shipping_address";
  values: Record<string, any>;
  canWrite: boolean;
  onChange: (k: string, v: string) => void;
}) {
  const parsed = useMemo(() => parseAddress(values[addrKey]), [values, addrKey]);

  const handleField = (field: AddrKey, val: string) => {
    const next = { ...parsed, [field]: val };
    onChange(addrKey, serializeAddress(next));
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ADDR_KEYS.map((k) => (
          <div key={k} className={k === "line1" ? "sm:col-span-2" : ""}>
            <Label className="text-xs">{ADDR_LABELS[k]}</Label>
            <Input
              className="mt-1 h-8 text-sm"
              value={parsed[k]}
              onChange={(e) => handleField(k, e.target.value)}
              disabled={!canWrite}
              placeholder={ADDR_LABELS[k]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionAccordion({
  value,
  title,
  table,
  customerId,
  amountKey,
  dateKey,
  currency,
}: {
  value: string;
  title: string;
  table: string;
  customerId: string;
  amountKey: string;
  dateKey: string;
  currency: string;
}) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: [table, "by-customer", customerId],
    queryFn: async () => {
      const { data, error } = await db.from(table as any)
        .select("*")
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order(dateKey, { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const total = rows.reduce((s, r) => s + Number(r[amountKey] ?? 0), 0);

  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="px-4">
        <div className="flex w-full items-center justify-between pr-3">
          <span className="font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${rows.length} record${rows.length === 1 ? "" : "s"} · ${money(total, currency)}`}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="text-xs uppercase tracking-wider">Number</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Date</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  No {title.toLowerCase()} for this customer yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.number ?? "—"}</TableCell>
                <TableCell className="text-sm">{dateFmt(r[dateKey])}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.status ?? "Draft"}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-sm">
                  {money(r[amountKey], currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AccordionContent>
    </AccordionItem>
  );
}

function AuditTrail({ customerId }: { customerId: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit_logs", "customers", customerId],
    queryFn: async () => {
      const { data, error } = await db.from("audit_logs")
        .select("*")
        .eq("table_name", "customers")
        .eq("record_id", customerId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const changedFields = (log: any) => {
    const oldD = (log.old_data ?? {}) as Record<string, any>;
    const newD = (log.new_data ?? {}) as Record<string, any>;
    const skip = new Set(["updated_at", "created_at", "search_vec", "tenant_id", "id"]);
    return Object.keys(newD)
      .filter((k) => !skip.has(k) && JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
      .map((k) => ({ key: k, from: oldD[k], to: newD[k] }));
  };

  if (isLoading)
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading audit trail…
      </div>
    );
  if (logs.length === 0)
    return <div className="p-6 text-sm text-muted-foreground">No changes recorded for this customer yet.</div>;

  return (
    <div className="divide-y">
      {logs.map((log) => {
        const changes = log.action === "UPDATE" ? changedFields(log) : [];
        return (
          <div key={log.id} className="flex gap-3 p-4">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{log.action}</Badge>
                <span className="text-sm font-medium">{log.actor_email ?? "System"}</span>
                <span className="text-xs text-muted-foreground">{dateTimeFmt(log.created_at)}</span>
              </div>
              {changes.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {changes.map((c) => (
                    <li key={c.key}>
                      <span className="font-medium text-foreground">{c.key.replace(/_/g, " ")}</span>
                      {": "}
                      <span className="line-through">{c.from == null || c.from === "" ? "empty" : String(c.from)}</span>
                      {" → "}
                      <span className="text-foreground">{c.to == null || c.to === "" ? "empty" : String(c.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CustomerEditor({ id, fields }: { id: string; fields: FieldDef[] }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { tenant, hasRole } = useAuth();
  const canWrite = hasRole(["tenant_admin", "super_admin", "sales"]);
  const isNew = id === "new";

  const { data: record, isLoading } = useQuery({
    queryKey: ["customers", "record", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("customers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // Orders YTD
  const ytdStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const { data: ordersYtd } = useQuery({
    queryKey: ["sales_orders", "ytd", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("sales_orders")
        .select("grand_total, currency")
        .eq("customer_id", id)
        .is("deleted_at", null)
        .gte("date", ytdStart);
      if (error) return { count: 0, total: 0 };
      const rows = data ?? [];
      return {
        count: rows.length,
        total: rows.reduce((s, r) => s + Number(r.grand_total ?? 0), 0),
      };
    },
  });

  // Salesperson name lookup
  const { data: salespersonName } = useQuery({
    queryKey: ["profiles", "name", record?.salesperson_id],
    enabled: !!record?.salesperson_id,
    queryFn: async () => {
      const { data } = await db.from("profiles")
        .select("full_name")
        .eq("id", record.salesperson_id)
        .maybeSingle();
      return data?.full_name ?? null;
    },
  });

  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? (f.type === "number" ? 0 : "")])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (record) setValues(record);
  }, [record]);

  const set = (k: string, v: any) => {
    setValues((p) => ({ ...p, [k]: v }));
    setErrors((p) => {
      const n = { ...p };
      delete n[k];
      return n;
    });
  };

  // Fields for the identity / contact section (exclude financial, address, notes)
  const identityFields = useMemo(() => fields.filter((f) => f.group === "Identity" || f.group === "Contact"), [fields]);

  const financialFields = useMemo(() => fields.filter((f) => f.group === "Financial"), [fields]);

  const validateAll = () => {
    const next: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (f.required && (v === "" || v == null)) next[f.key] = `${f.label} is required`;
      else {
        const err = f.validate?.(v, values);
        if (err) next[f.key] = err;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No workspace selected");
      if (!validateAll()) throw new Error("Please fix the highlighted fields");
      const payload: Record<string, any> = {};
      for (const f of fields) {
        let v = values[f.key];
        if (f.type === "number") v = v === "" || v == null ? null : Number(v);
        if (v === "") v = null;
        payload[f.key] = v;
      }
      // Include address and notes which aren't in fields array
      payload.billing_address = values.billing_address ?? null;
      payload.shipping_address = values.shipping_address ?? null;
      payload.notes = values.notes ?? null;

      const validated = CustomerSchema.safeParse({ ...payload, tenant_id: tenant.id });
      if (!validated.success) throw new Error(formatZodError(validated.error));

      if (isNew) {
        const { data, error } = await db.from("customers")
          .insert(validated.data as any)
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      }
      const { tenant_id: _tid, ...update } = validated.data as any;
      const { error } = await db.from("customers").update(update).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (newId) => {
      toast.success(isNew ? "Customer created" : "Customer saved");
      qc.invalidateQueries({ queryKey: ["customers"] });
      if (isNew) nav({ to: "/crm/customers/$id", params: { id: newId } });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading customer…
      </div>
    );
  }

  const currency = values.currency ?? "USD";

  const renderField = (f: FieldDef) => (
    <div key={f.key} className={"grid gap-1.5 " + (f.type === "textarea" ? "md:col-span-3" : "")}>
      <Label>
        {f.label}
        {f.required && <span className="text-destructive"> *</span>}
      </Label>
      {f.type === "select" ? (
        <Select value={values[f.key] ?? ""} onValueChange={(v) => set(f.key, v)} disabled={!canWrite}>
          <SelectTrigger>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(f.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : f.type === "fk" ? (
        <FkField field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} disabled={!canWrite} />
      ) : f.type === "textarea" ? (
        <Textarea
          rows={3}
          value={values[f.key] ?? ""}
          onChange={(e) => set(f.key, e.target.value)}
          disabled={!canWrite}
        />
      ) : (
        <Input
          type={f.type === "number" ? "number" : "text"}
          step={f.type === "number" ? "any" : undefined}
          value={values[f.key] ?? ""}
          onChange={(e) => set(f.key, e.target.value)}
          disabled={!canWrite}
          aria-invalid={!!errors[f.key]}
        />
      )}
      {errors[f.key] && <p className="text-xs text-destructive">{errors[f.key]}</p>}
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-4 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/crm/customers" })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-semibold">{isNew ? "New Customer" : values.name || "Customer"}</h1>
                {values.status && <Badge variant="secondary">{values.status}</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isNew
                  ? "Create a new customer account"
                  : [values.code, values.email, values.phone].filter(Boolean).join(" · ") || "Customer details"}
              </p>
            </div>
          </div>
        </div>
        {canWrite && (
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{" "}
            Save
          </Button>
        )}
      </div>

      {/* ── Summary Cards ── */}
      {!isNew && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* Orders YTD */}
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Orders YTD</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{money(ordersYtd?.total, currency)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ordersYtd?.count ?? 0} order{(ordersYtd?.count ?? 0) !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </div>
          </Card>

          {/* Outstanding Balance */}
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                <p
                  className={`mt-1 font-mono text-lg font-semibold tabular-nums ${Number(values.balance) > 0 ? "text-amber-600" : ""}`}
                >
                  {money(values.balance, currency)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Limit: {money(values.credit_limit, currency)}</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
          </Card>

          {/* Payment Terms */}
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Payment Terms</p>
            <p className="mt-1 text-sm font-medium">{values.payment_terms || "—"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Currency: {currency}</p>
          </Card>

          {/* Salesperson */}
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Salesperson</p>
            <p className="mt-1 text-sm font-medium truncate">{salespersonName ?? "—"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Industry: {values.industry || "—"}</p>
          </Card>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="transactions" disabled={isNew}>
            Transactions
          </TabsTrigger>
          <TabsTrigger value="audit" disabled={isNew}>
            Audit Trail
          </TabsTrigger>
        </TabsList>

        {/* ── Details Tab ── */}
        <TabsContent value="details" className="mt-4 flex flex-col gap-4">
          {/* Identity & Contact */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Identity &amp; Contact</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{identityFields.map(renderField)}</div>
            </CardContent>
          </Card>

          {/* Financial */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Financial</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {financialFields
                  .filter((f) => !["balance"].includes(f.key)) // balance is read-only; shown in cards
                  .map(renderField)}
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Address</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <AddressBlock
                  label="Billing Address"
                  addrKey="billing_address"
                  values={values}
                  canWrite={canWrite}
                  onChange={set}
                />
                <div className="hidden md:block w-px bg-border self-stretch" />
                <AddressBlock
                  label="Shipping Address"
                  addrKey="shipping_address"
                  values={values}
                  canWrite={canWrite}
                  onChange={set}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Notes</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
              <Textarea
                rows={4}
                placeholder="Internal notes about this customer…"
                value={values.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                disabled={!canWrite}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Transactions Tab ── */}
        <TabsContent value="transactions" className="mt-4">
          {!isNew && (
            <Card className="overflow-hidden p-0">
              <Accordion type="multiple" defaultValue={["quotes"]}>
                <TransactionAccordion
                  value="quotes"
                  title="Quotes"
                  table="sales_quotes"
                  customerId={id}
                  amountKey="grand_total"
                  dateKey="date"
                  currency={currency}
                />
                <TransactionAccordion
                  value="orders"
                  title="Sales Orders"
                  table="sales_orders"
                  customerId={id}
                  amountKey="grand_total"
                  dateKey="date"
                  currency={currency}
                />
                <TransactionAccordion
                  value="invoices"
                  title="Invoices"
                  table="invoices"
                  customerId={id}
                  amountKey="grand_total"
                  dateKey="date"
                  currency={currency}
                />
                <TransactionAccordion
                  value="payments-received"
                  title="Payments Received"
                  table="payments_received"
                  customerId={id}
                  amountKey="amount"
                  dateKey="date"
                  currency={currency}
                />
                <TransactionAccordion
                  value="credit-notes"
                  title="Credit Notes"
                  table="credit_notes"
                  customerId={id}
                  amountKey="grand_total"
                  dateKey="date"
                  currency={currency}
                />
              </Accordion>
            </Card>
          )}
        </TabsContent>

        {/* ── Audit Tab ── */}
        <TabsContent value="audit" className="mt-4">
          {!isNew && (
            <Card className="overflow-hidden p-0">
              <AuditTrail customerId={id} />
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
