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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, ArrowRight, Building2, Check, CircleHelp, Loader2, Save } from "lucide-react";

const STEPS = [
  "Basic Information",
  "Identity & Contact",
  "Addresses",
  "Financial & Tax",
  "Commercial Terms",
  "Additional Information",
];
const CURRENCIES = ["USD", "EUR", "GBP", "KES", "AED", "EGP", "INR", "ZAR"];
const TERMS = ["Due on Receipt", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60"];

type Values = Record<string, any>;

export function SupplierCreateEditWindow({
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
  const canWrite = hasRole(["tenant_admin", "super_admin", "purchasing"]);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(
      fields.map((field) => [field.key, field.defaultValue ?? (field.type === "number" ? "" : "")]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [sameAddress, setSameAddress] = useState(true);

  const { data: record, isLoading } = useQuery({
    queryKey: ["suppliers", "record", id],
    enabled: !isNew && open,
    queryFn: async () => {
      const { data, error } = await db.from("suppliers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Values | null;
    },
  });
  const { data: nextCode } = useQuery({
    queryKey: ["suppliers", "next-code", tenant?.id],
    enabled: isNew && open && !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("suppliers")
        .select("code")
        .eq("tenant_id", tenant!.id)
        .not("code", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const numbers = (data ?? [])
        .map((row: Values) => Number(String(row.code ?? "").match(/(\d+)$/)?.[1] ?? 0))
        .filter(Boolean);
      return `SUP-${String(Math.max(0, ...numbers) + 1).padStart(3, "0")}`;
    },
  });
  const { data: duplicates = [] } = useQuery({
    queryKey: ["suppliers", "possible-duplicates", values.name],
    enabled: isNew && String(values.name ?? "").trim().length >= 3,
    queryFn: async () => {
      const { data, error } = await db
        .from("suppliers")
        .select("id,name,code,country")
        .ilike("name", `%${String(values.name).trim()}%`)
        .is("deleted_at", null)
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Values[];
    },
  });

  useEffect(() => {
    if (record) setValues(record);
  }, [record]);
  useEffect(() => {
    if (nextCode && isNew && !values.code)
      setValues((previous) => ({ ...previous, code: nextCode }));
  }, [nextCode, isNew, values.code]);

  const set = (key: string, value: any) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    setDirty(true);
  };
  const fieldsByStep = useMemo(
    () => ({
      0: fields.filter((field) => ["name", "code", "category", "status"].includes(field.key)),
      1: fields.filter((field) => ["email", "phone"].includes(field.key)),
      2: fields.filter((field) => ["billing_address", "shipping_address"].includes(field.key)),
      3: fields.filter((field) =>
        ["currency", "payment_terms", "tax_id", "credit_limit", "balance"].includes(field.key),
      ),
      4: fields.filter((field) => ["category"].includes(field.key)),
      5: fields.filter((field) => field.key === "notes"),
    }),
    [fields],
  );

  const validate = () => {
    const next: Record<string, string> = {};
    for (const field of fields) {
      const value = values[field.key];
      if (field.required && (value == null || String(value).trim() === ""))
        next[field.key] = `${field.label} is required`;
      const error = field.validate?.(value, values);
      if (error) next[field.key] = error;
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
      next.email = "Enter a valid email address";
    if (values.website && !/^https?:\/\//i.test(String(values.website)))
      next.website = "Enter a valid URL beginning with http:// or https://";
    if (
      values.credit_limit != null &&
      values.credit_limit !== "" &&
      Number(values.credit_limit) < 0
    )
      next.credit_limit = "Credit limit cannot be negative";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = useMutation({
    mutationFn: async ({ createAnother = false }: { createAnother?: boolean } = {}) => {
      if (!tenant?.id) throw new Error("No workspace selected");
      if (!validate()) throw new Error("Please fix the highlighted fields");
      const payload: Values = {};
      for (const field of fields) {
        let value = values[field.key];
        if (field.type === "number") value = value === "" || value == null ? null : Number(value);
        if (value === "") value = null;
        payload[field.key] = value;
      }
      if (sameAddress && payload.billing_address)
        payload.shipping_address = payload.billing_address;
      if (isNew) {
        const { data, error } = await db
          .from("suppliers")
          .insert({ ...payload, tenant_id: tenant.id })
          .select("id")
          .single();
        if (error) throw error;
        return { id: data.id, createAnother };
      }
      const { error } = await db.from("suppliers").update(payload).eq("id", id);
      if (error) throw error;
      return { id, createAnother: false };
    },
    onSuccess: ({ id: savedId, createAnother }) => {
      toast.success(isNew ? "Supplier created" : "Supplier saved");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setDirty(false);
      if (createAnother) {
        setValues(
          Object.fromEntries(
            fields.map((field) => [
              field.key,
              field.defaultValue ?? (field.type === "number" ? "" : ""),
            ]),
          ),
        );
        setStep(0);
        return;
      }
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
    return (
      <div key={field.key} className="grid gap-1.5">
        <Label htmlFor={`supplier-${field.key}`}>
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
        {field.type === "select" ? (
          <Select
            value={values[field.key] ?? ""}
            onValueChange={(value) => set(field.key, value)}
            disabled={!canWrite}
          >
            <SelectTrigger id={`supplier-${field.key}`}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {(field.key === "currency"
                ? CURRENCIES
                : field.key === "payment_terms"
                  ? TERMS
                  : (field.options ?? [])
              ).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.type === "textarea" ? (
          <Textarea
            id={`supplier-${field.key}`}
            rows={4}
            value={values[field.key] ?? ""}
            onChange={(event) => set(field.key, event.target.value)}
            disabled={!canWrite}
          />
        ) : (
          <Input
            id={`supplier-${field.key}`}
            type={field.type === "number" ? "number" : field.key === "email" ? "email" : "text"}
            value={values[field.key] ?? ""}
            onChange={(event) => set(field.key, event.target.value)}
            disabled={!canWrite || (!isNew && field.key === "code")}
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
      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange?.(true) : close())}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100%-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-5">
            <DialogTitle className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </span>
              {isNew ? "Create Supplier" : "Edit Supplier"}
            </DialogTitle>
            <DialogDescription className="pl-[52px]">
              {isNew
                ? "Add a new supplier account to your system"
                : "Update supplier account information"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid min-h-full lg:grid-cols-[190px_minmax(0,1fr)_230px]">
              <nav className="border-b bg-muted/20 p-4 lg:border-b-0 lg:border-r">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Supplier setup
                </p>
                <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">
                  {STEPS.map((label, index) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setStep(index)}
                      className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors lg:w-full ${step === index ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${step === index ? "border-primary-foreground" : "border-current"}`}
                      >
                        {index < step ? <Check className="h-3 w-3" /> : index + 1}
                      </span>
                      {label}
                    </button>
                  ))}
                </div>
              </nav>
              <main className="min-w-0 p-5 md:p-7">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Step {step + 1} of {STEPS.length}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{STEPS[step]}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {step === 0
                      ? "Set the supplier account identity and status."
                      : step === 1
                        ? "Add the people and channels used to communicate."
                        : step === 2
                          ? "Keep billing and delivery information accurate."
                          : step === 3
                            ? "Set payables, tax, and credit information."
                            : step === 4
                              ? "Define purchasing preferences available in the current supplier model."
                              : "Add internal notes for your team."}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {fieldsByStep[step as keyof typeof fieldsByStep].map(renderField)}
                </div>
                {step === 0 && duplicates.length > 0 && (
                  <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-medium">Possible duplicate supplier</p>
                    {duplicates.map((duplicate) => (
                      <p key={duplicate.id} className="mt-1 text-xs">
                        {duplicate.name} · {duplicate.code ?? "No code"} ·{" "}
                        {duplicate.country ?? "Country not set"}
                      </p>
                    ))}
                  </div>
                )}
                {step === 0 && (
                  <div className="mt-5 flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <Badge variant="secondary">Supplier</Badge> Account type follows the existing
                    supplier master model.
                  </div>
                )}
                {step === 2 && (
                  <label className="mt-5 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={sameAddress}
                      onCheckedChange={(checked) => {
                        setSameAddress(Boolean(checked));
                        setDirty(true);
                      }}
                    />{" "}
                    Shipping address is same as billing
                  </label>
                )}
                {step === 5 && (
                  <div className="mt-6 rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                    You can add more details in the next steps, or save now and continue later.
                  </div>
                )}
              </main>
              <aside className="hidden border-l bg-muted/10 p-5 xl:block">
                <div className="rounded-lg border bg-background p-4">
                  <div className="flex items-center gap-2 font-medium">
                    <CircleHelp className="h-4 w-4 text-primary" /> Why this matters
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Accurate supplier information helps you manage payments, track purchase orders,
                    and maintain strong supplier relationships.
                  </p>
                </div>
                <div className="mt-4 rounded-lg border bg-background p-4">
                  <p className="text-sm font-medium">Quick Tips</p>
                  <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <li>✓ Use a unique supplier code</li>
                    <li>✓ Select the correct supplier category</li>
                    <li>✓ Add contact details for faster communication</li>
                    <li>✓ Set payment terms and lead time</li>
                    <li>✓ Include complete addresses</li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t bg-background px-5 py-3 md:flex-row md:items-center md:justify-between md:px-6">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <div className="flex gap-2">
              {isNew && (
                <Button
                  variant="outline"
                  onClick={() => save.mutate({ createAnother: true })}
                  disabled={!canWrite || save.isPending}
                >
                  Save & Create Another
                </Button>
              )}
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep((current) => current - 1)}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button
                  onClick={() => {
                    if (step === 0 && !validate()) return;
                    setStep((current) => current + 1);
                  }}
                  disabled={!canWrite}
                >
                  <ArrowRight className="mr-1.5 h-4 w-4" /> Next: {STEPS[step + 1]}
                </Button>
              ) : (
                <Button onClick={() => save.mutate()} disabled={!canWrite || save.isPending}>
                  {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {isNew ? "Create Supplier" : "Save Changes"}
                </Button>
              )}
            </div>
          </footer>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false);
                setDirty(false);
                onOpenChange?.(false);
              }}
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
