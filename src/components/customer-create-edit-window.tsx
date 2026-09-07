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

const ADDRESS_FIELDS = ["billing_address", "shipping_address"] as const;
const FINANCIAL_FIELDS = [
  "currency",
  "payment_terms",
  "credit_limit",
  "tax_id",
  "balance",
] as const;
const CUSTOMER_TABS = [
  { value: "basic", label: "Basic Information" },
  { value: "contact", label: "Contact Information" },
  { value: "addresses", label: "Addresses" },
  { value: "financial", label: "Financial" },
  { value: "sales", label: "Sales & Additional" },
] as const;
const CURRENCIES = ["USD", "EUR", "GBP", "KES", "AED", "EGP", "INR", "ZAR"];
const TERMS = ["Due on Receipt", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60"];

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
    Object.fromEntries(
      fields.map((field) => [field.key, field.defaultValue ?? (field.type === "number" ? "" : "")]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<(typeof CUSTOMER_TABS)[number]["value"]>("basic");
  const [sameAddress, setSameAddress] = useState(true);

  const { data: record, isLoading } = useQuery({
    queryKey: ["customers", "record", id],
    enabled: !isNew && open,
    queryFn: async () => {
      const { data, error } = await db.from("customers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Values | null;
    },
  });
  const { data: nextCode } = useQuery({
    queryKey: ["customers", "next-code", tenant?.id],
    enabled: isNew && open && !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("customers")
        .select("code")
        .eq("tenant_id", tenant!.id)
        .not("code", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const numbers = (data ?? [])
        .map((row: Values) => Number(String(row.code ?? "").match(/(\d+)$/)?.[1] ?? 0))
        .filter(Boolean);
      return `CUS-${String(Math.max(0, ...numbers) + 1).padStart(3, "0")}`;
    },
  });
  const { data: duplicates = [] } = useQuery({
    queryKey: ["customers", "possible-duplicates", values.name],
    enabled: isNew && String(values.name ?? "").trim().length >= 3,
    queryFn: async () => {
      const { data, error } = await db
        .from("customers")
        .select("id,name,code,country")
        .ilike("name", `%${String(values.name).trim()}%`)
        .is("deleted_at", null)
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Values[];
    },
  });

  useEffect(() => {
    if (record) {
      setValues(record);
      setSameAddress(
        Boolean(record.billing_address && record.billing_address === record.shipping_address),
      );
    }
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
      basic: fields.filter((field) => ["name", "code", "industry", "status"].includes(field.key)),
      contact: fields.filter((field) =>
        ["contact_person", "email", "phone", "website", "salesperson_id"].includes(field.key),
      ),
      addresses: fields.filter((field) => ADDRESS_FIELDS.includes(field.key as any)),
      financial: fields.filter(
        (field) => FINANCIAL_FIELDS.includes(field.key as any) || field.group === "Financial",
      ),
      sales: fields.filter((field) => ["category", "notes"].includes(field.key)),
    }),
    [fields],
  );

  const tabForField = (key: string) => {
    if (fieldsByTab.contact.some((field) => field.key === key)) return "contact" as const;
    if (fieldsByTab.addresses.some((field) => field.key === key)) return "addresses" as const;
    if (fieldsByTab.financial.some((field) => field.key === key)) return "financial" as const;
    if (fieldsByTab.sales.some((field) => field.key === key)) return "sales" as const;
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
      payload.billing_address = values.billing_address ?? null;
      payload.shipping_address = sameAddress
        ? (values.billing_address ?? null)
        : (values.shipping_address ?? null);
      payload.notes = values.notes ?? null;

      if (isNew) {
        const { data, error } = await db
          .from("customers")
          .insert({ ...payload, tenant_id: tenant.id })
          .select("id")
          .single();
        if (error) throw error;
        return { id: data.id, createAnother };
      }

      const { error } = await db.from("customers").update(payload).eq("id", id);
      if (error) throw error;
      return { id, createAnother: false };
    },
    onSuccess: ({ id: savedId, createAnother }) => {
      toast.success(isNew ? "Customer created" : "Customer saved");
      qc.invalidateQueries({ queryKey: ["customers"] });
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
    const commonClass = "h-10";

    return (
      <div
        key={field.key}
        className={`grid gap-1.5 ${field.type === "textarea" ? "md:col-span-2" : ""}`}
      >
        <Label htmlFor={`customer-${field.key}`}>
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
        {field.type === "select" ? (
          <Select
            value={values[field.key] ?? ""}
            onValueChange={(value) => set(field.key, value)}
            disabled={!canWrite}
          >
            <SelectTrigger id={`customer-${field.key}`} className={commonClass}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {(field.key === "currency"
                ? CURRENCIES
                : field.key === "payment_terms"
                  ? TERMS
                  : (field.options ?? [])
              ).map((option) => (
                <SelectItem key={String(option)} value={String(option)}>
                  {String(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.type === "textarea" ? (
          <Textarea
            id={`customer-${field.key}`}
            rows={4}
            value={values[field.key] ?? ""}
            onChange={(event) => set(field.key, event.target.value)}
            disabled={!canWrite}
          />
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
      <section
        className="relative flex w-full flex-col overflow-hidden rounded-xl border bg-background shadow-sm"
        aria-label={isNew ? "Create Customer" : "Edit Customer"}
      >
        <header className="shrink-0 border-b px-5 py-5 md:px-8">
          <div>
            <h1 className="text-xl font-semibold leading-none tracking-tight">
              {isNew ? "Create Customer" : "Edit Customer"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isNew
                ? "Create a new customer in your system"
                : "Update customer account information"}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading customer…
            </div>
          ) : (
            <div className="min-h-[560px] xl:grid xl:grid-cols-[minmax(0,1fr)_320px]">
              <main className="min-w-0 px-5 py-6 md:px-8 md:py-8">
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setActiveTab(value as typeof activeTab)}
                >
                  <TabsList className="mb-6 h-auto w-full justify-start overflow-x-auto border bg-muted/30 p-1">
                    {CUSTOMER_TABS.map((tab) => (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="whitespace-nowrap text-xs md:text-sm"
                      >
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {CUSTOMER_TABS.map((tab) => (
                    <TabsContent key={tab.value} value={tab.value} className="mt-0">
                      <div className="mb-5">
                        <h2 className="text-lg font-semibold">{tab.label}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {tab.value === "basic"
                            ? "Set the customer identity and account defaults."
                            : tab.value === "contact"
                              ? "Add the people and channels used to communicate."
                              : tab.value === "addresses"
                                ? "Keep billing and delivery information accurate."
                                : tab.value === "financial"
                                  ? "Set currency, tax, payment, and credit information."
                                  : "Manage sales context and internal notes."}
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {fieldsByTab[tab.value].map(renderField)}
                      </div>
                      {tab.value === "basic" && duplicates.length > 0 && (
                        <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                          <p className="font-medium">Possible duplicate customer</p>
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
                          <Badge variant="secondary">Customer</Badge> Account type follows the
                          existing customer master model.
                        </div>
                      )}
                      {tab.value === "addresses" && (
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
                      {tab.value === "sales" && (
                        <div className="mt-6 rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                          Quick Actions: You can add more details in the other tabs, or save now and
                          continue later.
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </main>
              <aside className="hidden border-l bg-muted/10 px-6 py-8 xl:block">
                <div className="border-b pb-6">
                  <div className="flex items-center gap-2 font-medium">
                    <CircleHelp className="h-4 w-4 text-primary" /> Why this matters
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Accurate customer information helps you manage payments, track orders, and
                    maintain strong customer relationships.
                  </p>
                </div>
                <div className="pt-6">
                  <p className="text-sm font-medium">Quick Tips</p>
                  <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <li>✓ Use a unique customer code</li>
                    <li>✓ Select the correct customer category</li>
                    <li>✓ Add contact details for faster communication</li>
                    <li>✓ Set payment terms and credit limits</li>
                    <li>✓ Include complete addresses</li>
                  </ul>
                </div>
              </aside>
            </div>
          )}
        </div>
        <footer className="sticky bottom-0 z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-5 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] backdrop-blur md:px-8">
          <Button variant="ghost" onClick={close} disabled={save.isPending}>
            Cancel
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => save.mutate()} disabled={!canWrite || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button onClick={() => save.mutate()} disabled={!canWrite || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isNew ? "Create Customer" : "Save Changes"}
            </Button>
          </div>
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
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false);
                onOpenChange?.(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
