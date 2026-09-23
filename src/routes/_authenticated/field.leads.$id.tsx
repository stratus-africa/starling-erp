import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, Mail, Pencil, UserCheck } from "lucide-react";
import { db } from "@/lib/typed-db";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FieldHeader, Loading, ErrorBox, NoAccess, StatusPill, useFieldAccess } from "@/components/field/field-ui";

export const Route = createFileRoute("/_authenticated/field/leads/$id")({
  head: () => ({ meta: [{ title: "Lead — Field Sales" }] }),
  component: LeadDetail,
});

function LeadDetail() {
  const { id } = Route.useParams();
  const a = useFieldAccess();
  const { tenant } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: l, isLoading, error, refetch } = useQuery({
    queryKey: ["crm_leads", id], enabled: a.leads,
    queryFn: async () => {
      const { data, error } = await db.from("crm_leads").select("*, assignee:profiles!crm_leads_assigned_to_fkey(full_name,email)").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Lead not found");
      return data as any;
    },
  });
  if (!a.leads) return <><FieldHeader title="Lead" back="/field/leads" /><NoAccess what="leads" /></>;
  if (isLoading) return <><FieldHeader title="Lead" back="/field/leads" /><Loading /></>;
  if (error || !l) return <><FieldHeader title="Lead" back="/field/leads" /><ErrorBox error={error} retry={refetch} /></>;

  const convert = async () => {
    if (!tenant) return;
    const { data: c, error: e1 } = await supabase.from("customers").insert({ tenant_id: tenant.id, name: l.company || l.name, contact_person: l.company ? l.name : null, phone: l.phone, email: l.email, notes: l.notes, currency: tenant.currency ?? "KES", status: "Active" }).select("id").single();
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await db.from("crm_leads").update({ status: "Converted", converted_customer_id: c.id }).eq("id", id);
    if (e2) return toast.error(e2.message);
    toast.success("Lead converted to customer");
    qc.invalidateQueries({ queryKey: ["crm_leads"] });
    qc.invalidateQueries({ queryKey: ["customers"] });
    nav({ to: "/field/customers/$id", params: { id: c.id } });
  };

  return (
    <div>
      <FieldHeader title={l.name} back="/field/leads" right={a.leadsEdit ? <Link to="/field/leads/new" search={{ edit: id }} aria-label="Edit" className="flex h-11 w-11 items-center justify-center"><Pencil className="h-5 w-5" /></Link> : null} />
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between"><div className="text-sm text-muted-foreground">{l.company}</div><StatusPill status={l.status} /></div>
        <div className="grid grid-cols-2 gap-2">
          {l.phone && <a href={`tel:${l.phone}`} className="flex h-14 items-center justify-center gap-2 rounded-lg border"><Phone className="h-5 w-5 text-primary" />Call</a>}
          {l.email && <a href={`mailto:${l.email}`} className="flex h-14 items-center justify-center gap-2 rounded-lg border"><Mail className="h-5 w-5 text-primary" />Email</a>}
        </div>
        <dl className="space-y-3 text-sm">
          {[["Phone", l.phone], ["Email", l.email], ["Source", l.source], ["Assigned to", l.assignee?.full_name ?? l.assignee?.email], ["Last activity", new Date(l.last_activity_at).toLocaleString()], ["Notes", l.notes]].map(([k, v]) => v ? <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="whitespace-pre-line">{v}</dd></div> : null)}
        </dl>
        {l.converted_customer_id ? (
          <Link to="/field/customers/$id" params={{ id: l.converted_customer_id }} className="block text-sm font-medium text-primary">View customer →</Link>
        ) : a.leadsEdit && a.customersCreate && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button className="h-12 w-full text-base"><UserCheck className="mr-2 h-5 w-5" />Convert to customer</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Convert this lead?</AlertDialogTitle><AlertDialogDescription>A new customer "{l.company || l.name}" will be created and this lead marked Converted.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={convert}>Convert</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
