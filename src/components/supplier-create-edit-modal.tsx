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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Building2, CircleHelp, Loader2, Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SUPPLIER_TABS = [
  { value: "basic", label: "Basic Information" },
  { value: "contact", label: "Contact Information" },
  { value: "address", label: "Address" },
  { value: "financial", label: "Financial & Banking" },
  { value: "additional", label: "Additional Information" },
] as const;
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
  const [activeTab, setActiveTab] = useState<(typeof SUPPLIER_TABS)[number]["value"]>("basic");
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
  const fieldsByTab = useMemo(
    () => ({
      basic: fields.filter((field) => ["name", "code", "category", "status"].includes(field.key)),
      contact: fields.filter((field) =>
        ["contact_person", "email", "phone", "website"].includes(field.key),
      ),
      address: fields.filter((field) =>
        ["billing_address", "shipping_address"].includes(field.key),
      ),
      financial: fields.filter((field) =>
        ["currency", "payment_terms", "tax_id", "credit_limit", "balance"].includes(field.key),
      ),
      additional: fields.filter((field) => ["notes", "website"].includes(field.key)),
    }),
    [fields],
  );

  const tabForField = (key: string) => {
    if (fieldsByTab.contact.some((field) => field.key === key)) return "contact" as const;
    if (fieldsByTab.address.some((field) => field.key === key)) return "address" as const;
    if (fieldsByTab.financial.some((field) => field.key === key)) return "financial" as const;
    if (fieldsByTab.additional.some((field) => field.key === key)) return "additional" as const;
    return "basic" as const;
  };

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
    const firstError = Object.keys(next)[0];
    if (firstError) setActiveTab(tabForField(firstError));
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
        setActiveTab("basic");
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
      <section
        className="relative flex w-full flex-col overflow-hidden rounded-xl border bg-background shadow-sm"
        aria-label={isNew ? "Create Supplier" : "Edit Supplier"}
      >
        <header className="flex shrink-0 items-center justify-between border-b px-5 py-4 md:px-8">
          <div>
            <h1 className="flex items-center gap-3 text-lg font-semibold leading-none tracking-tight">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </span>
              {isNew ? "Create Supplier" : "Edit Supplier"}
            </h1>
            <p className="mt-2 pl-[52px] text-sm text-muted-foreground">
              {isNew
                ? "Add a new supplier account to your system"
                : "Update supplier account information"}
            </p>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="min-h-full">
            <main className="min-w-0 p-5 md:p-7">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as typeof activeTab)}
              >
                <TabsList className="mb-6 h-auto w-full justify-start overflow-x-auto bg-muted/50 p-1">
                  {SUPPLIER_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="whitespace-nowrap text-xs md:text-sm"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {SUPPLIER_TABS.map((tab) => (
                  <TabsContent key={tab.value} value={tab.value} className="mt-0">
                    <div className="mb-5">
                      <h2 className="text-lg font-semibold">{tab.label}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {tab.value === "basic"
                          ? "Set the supplier identity and account defaults."
                          : tab.value === "contact"
                            ? "Add the people and channels used to communicate."
                            : tab.value === "address"
                              ? "Keep supplier address information accurate."
                              : tab.value === "financial"
                                ? "Set currency, tax, payment, and credit information."
                                : "Add supplier notes and additional context."}
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {fieldsByTab[tab.value].map(renderField)}
                    </div>
                    {tab.value === "basic" && duplicates.length > 0 && (
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
                    {tab.value === "basic" && (
                      <div className="mt-5 flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                        <Badge variant="secondary">Supplier</Badge> Account type follows the
                        existing supplier master model.
                      </div>
                    )}
                    {tab.value === "address" && (
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
                    {tab.value === "additional" && (
                      <div className="mt-6 rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                        You can add more details in the other tabs, or save now and continue later.
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
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
            <Button onClick={() => save.mutate()} disabled={!canWrite || save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isNew ? "Create Supplier" : "Save Changes"}
            </Button>
          </div>
        </footer>
      </section>
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
