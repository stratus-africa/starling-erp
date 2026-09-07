import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import type { FieldDef } from "@/components/data-module-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Save, User2 } from "lucide-react";

const ADDRESS_FIELDS = ["billing_address", "shipping_address"] as const;
const FINANCIAL_FIELDS = ["currency", "payment_terms", "credit_limit", "tax_id", "balance"] as const;

type Values = Record<string, any>;

export function CustomerCreateEditWindow({
  id,
  fields,
  open = true,
  onOpenChange,
  onSaved,
}: {
  id: string;
  fields: FieldDef[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (id: string) => void;
}) {
  const { tenant, hasRole } = useAuth();
  const qc = useQueryClient();
  const isNew = id === "new";
  const canWrite = hasRole(["tenant_admin", "super_admin", "sales"]);

  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.defaultValue ?? (field.type === "number" ? "" : "")])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const { data: record, isLoading } = useQuery({
    queryKey: ["customers", "record", id],
    enabled: !isNew && open,
    queryFn: async () => {
      const { data, error } = await db.from("customers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Values | null;
    },
  });

  useEffect(() => {
    if (record) setValues(record);
  }, [record]);

  const set = (key: string, value: any) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    setDirty(true);
  };

  const identityFields = useMemo(() => fields.filter((field) => ["name", "code", "status", "category", "industry", "email", "phone", "website", "contact_person"].includes(field.key)), [fields]);
  const addressFields = useMemo(() => fields.filter((field) => ADDRESS_FIELDS.includes(field.key as any)), [fields]);
  const financialFields = useMemo(() => fields.filter((field) => FINANCIAL_FIELDS.includes(field.key as any) || field.group === "Financial"), [fields]);
  const notesField = useMemo(() => fields.filter((field) => field.key === "notes"), [fields]);

  const validate = () => {
    const next: Record<string, string> = {};
    for (const field of fields) {
      const value = values[field.key];
      if (field.required && (value == null || String(value).trim() === ""))
        next[field.key] = `${field.label} is required`;
      const error = field.validate?.(value, values);
      if (error) next[field.key] = error;
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) next.email = "Enter a valid email address";
    if (values.credit_limit != null && values.credit_limit !== "" && Number(values.credit_limit) < 0) next.credit_limit = "Credit limit cannot be negative";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No workspace selected");
      if (!validate()) throw new Error("Please fix the highlighted fields");

      const payload: Values = {};
      for (const field of fields) {
        let value = values[field.key];
        if (field.type === "number") value = value === "" || value == null ? null : Number(value);
        if (value === "") value = null;
        payload[field.key] = value;
      }
      payload.billing_address = values.billing_address ?? null;
      payload.shipping_address = values.shipping_address ?? null;
      payload.notes = values.notes ?? null;

      if (isNew) {
        const { data, error } = await db.from("customers").insert({ ...payload, tenant_id: tenant.id }).select("id").single();
        if (error) throw error;
        return data.id;
      }

      const { error } = await db.from("customers").update(payload).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (savedId) => {
      toast.success(isNew ? "Customer created" : "Customer saved");
      qc.invalidateQueries({ queryKey: ["customers"] });
      setDirty(false);
      onSaved?.(savedId);
      onOpenChange?.(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const close = () => {
    if (dirty) setDiscardOpen(true);
    else onOpenChange?.(false);
  };

  const renderField = (field: FieldDef) => {
    const error = errors[field.key];
    const commonClass = "h-10";

    return (
      <div key={field.key} className={`grid gap-1.5 ${field.type === "textarea" ? "md:col-span-2" : ""}`}>
        <Label htmlFor={`customer-${field.key}`}>
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
        {field.type === "select" ? (
          <Select value={values[field.key] ?? ""} onValueChange={(value) => set(field.key, value)} disabled={!canWrite}>
            <SelectTrigger id={`customer-${field.key}`} className={commonClass}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={String(option)} value={String(option)}>
                  {String(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.type === "textarea" ? (
          <Textarea id={`customer-${field.key}`} rows={4} value={values[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)} disabled={!canWrite} />
        ) : (
          <Input
            id={`customer-${field.key}`}
            type={field.type === "number" ? "number" : field.key === "email" ? "email" : "text"}
            className={commonClass}
            value={values[field.key] ?? ""}
            onChange={(event) => set(field.key, event.target.value)}
            disabled={!canWrite}
            aria-invalid={!!error}
          />
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  if (!open) return null;

  return (
    <>
      <section className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-background" aria-label={isNew ? "Create Customer" : "Edit Customer"}>
          <header className="shrink-0 border-b px-6 py-5">
            <h1 className="flex items-center gap-3 text-lg font-semibold leading-none tracking-tight">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User2 className="h-5 w-5" />
              </span>
              {isNew ? "Create Customer" : "Edit Customer"}
            </h1>
            <p className="pl-[52px] text-sm text-muted-foreground">
              {isNew ? "Add a new customer account to your system" : "Update customer account information"}
            </p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading customer…
              </div>
            ) : (
              <div className="grid gap-6">
                <section className="grid gap-4 md:grid-cols-2">
                  <h3 className="md:col-span-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Basic information</h3>
                  {identityFields.map(renderField)}
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <h3 className="md:col-span-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Addresses</h3>
                  {addressFields.map(renderField)}
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <h3 className="md:col-span-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Financial & tax</h3>
                  {financialFields.map(renderField)}
                </section>

                {notesField.length > 0 && (
                  <section className="grid gap-4 md:grid-cols-2">
                    <h3 className="md:col-span-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Notes</h3>
                    {notesField.map(renderField)}
                  </section>
                )}
              </div>
            )}
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={close} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!canWrite || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              {isNew ? "Create Customer" : "Save Changes"}
            </Button>
          </footer>
      </section>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Closing this window will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDiscardOpen(false); onOpenChange?.(false); }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
