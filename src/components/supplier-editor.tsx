import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Building2, FileSpreadsheet, History,
  Loader2, Save, Trash2, Wallet,
} from "lucide-react";
import type { FieldDef } from "@/components/data-module-page";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const money = (v: any, currency = "USD") =>
  v == null
    ? "—"
    : `${currency} ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateFmt = (v: any) =>
  !v ? "—" : new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

const dateTimeFmt = (v: any) => (!v ? "—" : new Date(v).toLocaleString());

// ─── Supplier-specific field groups ──────────────────────────────────────────

const IDENTITY_KEYS  = ["code", "name", "category", "status"];
const CONTACT_KEYS   = ["email", "phone"];
const FINANCIAL_KEYS = ["currency", "balance"];

// ─── Transaction accordion ────────────────────────────────────────────────────

function TransactionAccordion({
  value, title, table, supplierId, amountKey, dateKey, currency,
}: {
  value: string; title: string; table: string; supplierId: string;
  amountKey: string; dateKey: string; currency: string;
}) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: [table, "by-supplier", supplierId],
    queryFn: async () => {
      const { data, error } = await db.from(table as any)
        .select("*")
        .eq("supplier_id", supplierId)
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
                  No {title.toLowerCase()} for this supplier yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.number ?? "—"}</TableCell>
                <TableCell className="text-sm">{dateFmt(r[dateKey])}</TableCell>
                <TableCell><Badge variant="secondary">{r.status ?? "Draft"}</Badge></TableCell>
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

// ─── Audit trail ─────────────────────────────────────────────────────────────

function AuditTrail({ supplierId }: { supplierId: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit_logs", "suppliers", supplierId],
    queryFn: async () => {
      const { data, error } = await db.from("audit_logs")
        .select("*")
        .eq("table_name", "suppliers")
        .eq("record_id", supplierId)
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
    return <div className="p-6 text-sm text-muted-foreground">No changes recorded for this supplier yet.</div>;

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
                      <span className="line-through">
                        {c.from == null || c.from === "" ? "empty" : String(c.from)}
                      </span>
                      {" → "}
                      <span className="text-foreground">
                        {c.to == null || c.to === "" ? "empty" : String(c.to)}
                      </span>
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

export function SupplierEditor({ id, fields }: { id: string; fields: FieldDef[] }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { tenant, hasRole } = useAuth();
  const canWrite = hasRole(["tenant_admin", "super_admin", "purchasing"]);
  const isNew = id === "new";
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ── Load record ──────────────────────────────────────────────────────────
  const { data: record, isLoading } = useQuery({
    queryKey: ["suppliers", "record", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("suppliers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // ── Bills YTD ────────────────────────────────────────────────────────────
  const ytdStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const { data: billsYtd } = useQuery({
    queryKey: ["bills", "ytd", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("bills")
        .select("grand_total, currency")
        .eq("supplier_id", id)
        .is("deleted_at", null)
        .gte("date", ytdStart);
      if (error) return { count: 0, total: 0 };
      const rows = data ?? [];
      return {
        count: rows.length,
        total: rows.reduce((s: number, r: any) => s + Number(r.grand_total ?? 0), 0),
      };
    },
  });

  // ── Form state ────────────────────────────────────────────────────────────
  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? (f.type === "number" ? 0 : "")])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (record) setValues(record);
  }, [record]);

  const set = (k: string, v: any) => {
    setValues((p) => ({ ...p, [k]: v }));
    setErrors((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  // ── Field groups ──────────────────────────────────────────────────────────
  const identityFields  = useMemo(() => fields.filter((f) => IDENTITY_KEYS.includes(f.key)),  [fields]);
  const contactFields   = useMemo(() => fields.filter((f) => CONTACT_KEYS.includes(f.key)),   [fields]);
  const financialFields = useMemo(() => fields.filter((f) => FINANCIAL_KEYS.includes(f.key)), [fields]);

  // ── Validation ────────────────────────────────────────────────────────────
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

  // ── Save ──────────────────────────────────────────────────────────────────
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
      payload.notes = values.notes ?? null;

      if (isNew) {
        const { data, error } = await db.from("suppliers")
          .insert({ ...payload, tenant_id: tenant.id })
          .select("id")
          .single();
        if (error) throw error;
        return (data as any).id as string;
      }
      const { error } = await db.from("suppliers").update(payload).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (newId) => {
      toast.success(isNew ? "Supplier created" : "Supplier saved");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (isNew) nav({ to: "/purchasing/suppliers/$id", params: { id: newId } });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  // ── Delete (soft) ─────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("suppliers")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supplier deleted");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      nav({ to: "/purchasing/suppliers" });
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  // ── Render field ──────────────────────────────────────────────────────────
  const renderField = (f: FieldDef) => (
    <div key={f.key} className={"grid gap-1.5 " + (f.type === "textarea" ? "md:col-span-3" : "")}>
      <Label>
        {f.label}
        {f.required && <span className="text-destructive"> *</span>}
      </Label>
      {f.type === "select" ? (
        <Select value={values[f.key] ?? ""} onValueChange={(v) => set(f.key, v)} disabled={!canWrite}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {(f.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : f.type === "textarea" ? (
        <Textarea
          rows={3}
          value={values[f.key] ?? ""}
          onChange={(e) => set(f.key, e.target.value)}
          disabled={!canWrite}
        />
      ) : (
        <Input
          type={f.type === "number" ? "number" : f.key === "email" ? "email" : "text"}
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!isNew && isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading supplier…
      </div>
    );
  }

  const currency = values.currency ?? "USD";

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col gap-4 p-4 md:p-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/purchasing/suppliers" })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-semibold">
                  {isNew ? "New Supplier" : values.name || "Supplier"}
                </h1>
                {values.status && <Badge variant="secondary">{values.status}</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isNew
                  ? "Create a new supplier account"
                  : [values.code, values.email, values.phone].filter(Boolean).join(" · ") || "Supplier details"}
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {!isNew && canWrite && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={() => setDeleteOpen(true)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          )}
          {canWrite && (
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <Save className="mr-1.5 h-4 w-4" />}
              {isNew ? "Create" : "Save"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {!isNew && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* Bills YTD */}
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Bills YTD</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                  {money(billsYtd?.total, currency)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {billsYtd?.count ?? 0} bill{(billsYtd?.count ?? 0) !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
            </div>
          </Card>

          {/* Outstanding Payable */}
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Outstanding Payable</p>
                <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${Number(values.balance) > 0 ? "text-amber-600" : ""}`}>
                  {money(values.balance, currency)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Accounts payable</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
          </Card>

          {/* Currency */}
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Currency</p>
            <p className="mt-1 text-sm font-medium">{currency}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Category: {values.category || "—"}</p>
          </Card>

          {/* Status */}
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-1 text-sm font-medium">{values.status || "—"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Since {dateFmt(record?.created_at)}
            </p>
          </Card>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="transactions" disabled={isNew}>Transactions</TabsTrigger>
          <TabsTrigger value="audit" disabled={isNew}>Audit Trail</TabsTrigger>
        </TabsList>

        {/* ── Details Tab ── */}
        <TabsContent value="details" className="mt-4 flex flex-col gap-4">

          {/* Identity */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Identity</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {identityFields.map(renderField)}
              </div>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Contact</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {contactFields.map(renderField)}
              </div>
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
                {/* balance shown in summary card — read-only here */}
                {financialFields.filter((f) => f.key !== "balance").map(renderField)}
                {!isNew && (
                  <div className="grid gap-1.5">
                    <Label>Payable Balance</Label>
                    <Input value={money(values.balance, currency)} disabled className="font-mono" />
                  </div>
                )}
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
                placeholder="Internal notes about this supplier…"
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
              <Accordion type="multiple" defaultValue={["purchase-orders"]}>
                <TransactionAccordion
                  value="purchase-orders"
                  title="Purchase Orders"
                  table="purchase_orders"
                  supplierId={id}
                  amountKey="grand_total"
                  dateKey="date"
                  currency={currency}
                />
                <TransactionAccordion
                  value="bills"
                  title="Bills"
                  table="bills"
                  supplierId={id}
                  amountKey="grand_total"
                  dateKey="date"
                  currency={currency}
                />
                <TransactionAccordion
                  value="expenses"
                  title="Expenses"
                  table="expenses"
                  supplierId={id}
                  amountKey="total"
                  dateKey="date"
                  currency={currency}
                />
                <TransactionAccordion
                  value="payments-made"
                  title="Payments Made"
                  table="payments_made"
                  supplierId={id}
                  amountKey="amount"
                  dateKey="date"
                  currency={currency}
                />
              </Accordion>
            </Card>
          )}
        </TabsContent>

        {/* ── Audit Trail Tab ── */}
        <TabsContent value="audit" className="mt-4">
          {!isNew && (
            <Card className="overflow-hidden p-0">
              <AuditTrail supplierId={id} />
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{values.name}</span> will be soft-deleted.
              Existing bills, purchase orders and payments linked to this supplier are not affected.
              This action can be reversed by a system administrator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete supplier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
