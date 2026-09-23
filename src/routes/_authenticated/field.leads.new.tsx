import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { useSalespeople } from "@/hooks/use-sales-settings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FieldHeader, StickyFooter, NoAccess, useFieldAccess } from "@/components/field/field-ui";
import { enqueue, newClientId } from "@/lib/field-sync";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/field-leads";

export const Route = createFileRoute("/_authenticated/field/leads/new")({
  validateSearch: (s: Record<string, unknown>): { edit?: string } => (typeof s.edit === "string" ? { edit: s.edit } : {}),
  head: () => ({ meta: [{ title: "Lead — Field Sales" }] }),
  component: LeadForm,
});

function LeadForm() {
  const { edit } = Route.useSearch();
  const a = useFieldAccess();
  const { tenant, user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: people = [] } = useSalespeople();
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", source: "Walk-in", status: "New", notes: "", assigned_to: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (user && !edit) setF((p) => ({ ...p, assigned_to: p.assigned_to || user.id })); }, [user, edit]);
  const { data: existing } = useQuery({
    queryKey: ["crm_leads", edit], enabled: !!edit && a.leads,
    queryFn: async () => (await db.from("crm_leads").select("*").eq("id", edit!).maybeSingle()).data as any,
  });
  useEffect(() => { if (existing) setF({ name: existing.name, company: existing.company ?? "", phone: existing.phone ?? "", email: existing.email ?? "", source: existing.source ?? "", status: existing.status, notes: existing.notes ?? "", assigned_to: existing.assigned_to ?? "" }); }, [existing]);

  if (!(edit ? a.leadsEdit : a.leadsCreate)) return <><FieldHeader title="Lead" back="/field/leads" /><NoAccess what="leads" /></>;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (!f.name.trim()) return toast.error("Lead name is required");
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return toast.error("Enter a valid email");
    if (!tenant) return;
    setSaving(true);
    const payload = { tenant_id: tenant.id, name: f.name.trim(), company: f.company || null, phone: f.phone || null, email: f.email || null, source: f.source || null, status: f.status, notes: f.notes || null, assigned_to: f.assigned_to || null };
    const id = edit ?? newClientId();
    const res = await enqueue({ id: edit ? newClientId() : id, kind: edit ? "lead_update" : "lead", label: `Lead ${payload.name}`, payload: edit ? { ...payload, id: edit } : payload });
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["crm_leads"] });
    if (res.status === "synced") { toast.success(edit ? "Lead updated" : "Lead created"); nav({ to: "/field/leads/$id", params: { id }, replace: true }); }
    else if (res.status === "failed") toast.error(res.error ?? "Could not save");
    else { toast.message("Saved offline — will sync when you reconnect"); nav({ to: "/field/leads" }); }
  };

  const sel = "h-12 w-full rounded-md border bg-background px-3 text-base";
  return (
    <div className="pb-20">
      <FieldHeader title={edit ? "Edit lead" : "New lead"} back="/field/leads" />
      <div className="space-y-4 p-4">
        <L label="Lead name *"><Input className="h-12 text-base" value={f.name} onChange={set("name")} autoFocus /></L>
        <L label="Company"><Input className="h-12 text-base" value={f.company} onChange={set("company")} /></L>
        <div className="grid grid-cols-2 gap-3">
          <L label="Phone"><Input className="h-12 text-base" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} /></L>
          <L label="Email"><Input className="h-12 text-base" type="email" inputMode="email" value={f.email} onChange={set("email")} /></L>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <L label="Source"><select className={sel} value={f.source} onChange={set("source")}>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</select></L>
          <L label="Status"><select className={sel} value={f.status} onChange={set("status")}>{LEAD_STATUSES.filter((s) => s !== "Converted").map((s) => <option key={s}>{s}</option>)}</select></L>
        </div>
        <L label="Assigned to"><select className={sel} value={f.assigned_to} onChange={set("assigned_to")}><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select></L>
        <L label="Notes"><Textarea rows={3} className="text-base" value={f.notes} onChange={set("notes")} /></L>
      </div>
      <StickyFooter>
        <Button className="h-12 flex-1 text-base" disabled={saving} onClick={submit}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{edit ? "Save changes" : "Create lead"}</Button>
      </StickyFooter>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}
