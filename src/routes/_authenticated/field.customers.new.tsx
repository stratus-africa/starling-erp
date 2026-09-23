import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FieldHeader, StickyFooter, NoAccess, useFieldAccess, useCustomers } from "@/components/field/field-ui";
import { enqueue, newClientId } from "@/lib/field-sync";

export const Route = createFileRoute("/_authenticated/field/customers/new")({
  validateSearch: (s: Record<string, unknown>): { edit?: string } => (typeof s.edit === "string" ? { edit: s.edit } : {}),
  head: () => ({ meta: [{ title: "Customer — Field Sales" }] }),
  component: CustomerForm,
});

const empty = { name: "", industry: "Business", phone: "", email: "", billing_address: "", city: "", country: "", tax_id: "", currency: "", payment_terms: "", notes: "" };
const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function CustomerForm() {
  const { edit } = Route.useSearch();
  const a = useFieldAccess();
  const { tenant } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ ...empty });
  const [confirmDup, setConfirmDup] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: all = [] } = useCustomers();
  const { data: terms = [] } = useQuery({
    queryKey: ["tenant_payment_terms", "field"],
    queryFn: async () => ((await supabase.from("tenant_payment_terms").select("name").order("name")).data ?? []) as { name: string }[],
  });
  const { data: existing } = useQuery({
    queryKey: ["customers", edit],
    enabled: !!edit,
    queryFn: async () => (await supabase.from("customers").select("*").eq("id", edit!).maybeSingle()).data,
  });
  useEffect(() => {
    if (!existing) return;
    const addr = existing.billing_address ?? "";
    const [street, city = "", country = ""] = addr.split("\n");
    setF({ name: existing.name, industry: existing.industry ?? "Business", phone: existing.phone ?? "", email: existing.email ?? "", billing_address: street ?? "", city, country, tax_id: existing.tax_id ?? "", currency: existing.currency ?? "", payment_terms: existing.payment_terms ?? "", notes: existing.notes ?? "" });
  }, [existing]);

  const dups = useMemo(() => {
    if (edit) return [];
    return all.filter((c: any) =>
      (f.name.trim().length > 2 && norm(c.name) === norm(f.name)) ||
      (norm(f.phone).length > 5 && norm(c.phone) === norm(f.phone)) ||
      (f.email.includes("@") && norm(c.email) === norm(f.email)) ||
      (norm(f.tax_id).length > 3 && norm(c.tax_id) === norm(f.tax_id)));
  }, [all, f, edit]);

  if (!(edit ? a.customersEdit : a.customersCreate)) return <><FieldHeader title="Customer" back="/field/customers" /><NoAccess what={edit ? "editing customers" : "creating customers"} /></>;

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (!f.name.trim()) return toast.error("Customer name is required");
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return toast.error("Enter a valid email");
    if (dups.length && !confirmDup) { setConfirmDup(true); return; }
    if (!tenant) return;
    setSaving(true);
    const payload = {
      tenant_id: tenant.id,
      name: f.name.trim(), industry: f.industry || null, phone: f.phone || null, email: f.email || null,
      billing_address: [f.billing_address, f.city, f.country].some(Boolean) ? [f.billing_address, f.city, f.country].join("\n") : null,
      tax_id: f.tax_id || null, currency: f.currency || tenant.currency || "KES", payment_terms: f.payment_terms || null, notes: f.notes || null,
    };
    const id = edit ?? newClientId();
    const res = await enqueue({ id: edit ? newClientId() : id, kind: edit ? "customer_update" : "customer", label: `Customer ${payload.name}`, payload: edit ? { ...payload, id: edit } : { ...payload, status: "Active" } });
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["customers"] });
    if (res.status === "synced") { toast.success(edit ? "Customer updated" : "Customer created"); nav({ to: "/field/customers/$id", params: { id }, replace: true }); }
    else if (res.status === "failed") toast.error(res.error ?? "Could not save");
    else { toast.message("Saved offline — will sync when you reconnect"); nav({ to: "/field/customers" }); }
  };

  return (
    <div className="pb-20">
      <FieldHeader title={edit ? "Edit customer" : "New customer"} back="/field/customers" />
      <div className="space-y-4 p-4">
        <F label="Customer name *"><Input className="h-12 text-base" value={f.name} onChange={set("name")} autoFocus /></F>
        <F label="Customer type">
          <select value={f.industry} onChange={set("industry")} className="h-12 w-full rounded-md border bg-background px-3 text-base">
            {["Business", "Individual", "Retailer", "Distributor", "Wholesaler", "Government"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Phone"><Input className="h-12 text-base" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} /></F>
          <F label="Tax / PIN"><Input className="h-12 text-base" value={f.tax_id} onChange={set("tax_id")} /></F>
        </div>
        <F label="Email"><Input className="h-12 text-base" type="email" inputMode="email" value={f.email} onChange={set("email")} /></F>
        {dups.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> A similar customer already exists.</div>
            <ul className="mt-2 space-y-1">
              {dups.slice(0, 3).map((d: any) => <li key={d.id}><Link to="/field/customers/$id" params={{ id: d.id }} className="font-medium text-primary underline">{d.name}</Link> <span className="text-muted-foreground">{[d.phone, d.email, d.tax_id].filter(Boolean).join(" · ")}</span></li>)}
            </ul>
          </div>
        )}
        <F label="Address"><Input className="h-12 text-base" value={f.billing_address} onChange={set("billing_address")} /></F>
        <div className="grid grid-cols-2 gap-3">
          <F label="City"><Input className="h-12 text-base" value={f.city} onChange={set("city")} /></F>
          <F label="Country"><Input className="h-12 text-base" value={f.country} onChange={set("country")} /></F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Currency"><Input className="h-12 text-base uppercase" maxLength={3} placeholder={tenant?.currency ?? "KES"} value={f.currency} onChange={set("currency")} /></F>
          <F label="Payment terms">
            <select value={f.payment_terms} onChange={set("payment_terms")} className="h-12 w-full rounded-md border bg-background px-3 text-base">
              <option value="">—</option>
              {terms.map((t) => <option key={t.name}>{t.name}</option>)}
            </select>
          </F>
        </div>
        <F label="Notes"><Textarea rows={3} className="text-base" value={f.notes} onChange={set("notes")} /></F>
      </div>
      <StickyFooter>
        <Button className="h-12 flex-1 text-base" disabled={saving} onClick={submit}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {confirmDup && dups.length ? "Create anyway" : edit ? "Save changes" : "Create customer"}
        </Button>
      </StickyFooter>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}
