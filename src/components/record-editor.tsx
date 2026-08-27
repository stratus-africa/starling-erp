import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFkOptions } from "@/hooks/use-module-data";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import type { FieldDef } from "@/components/data-module-page";

function FkField({ field, value, onChange, disabled }: { field: FieldDef; value: any; onChange: (v: string) => void; disabled?: boolean }) {
  const { data: options = [] } = useFkOptions(field.fkTable!, field.fkLabel ?? "name");
  return (
    <Select value={value ?? ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger><SelectValue placeholder={`Select ${field.label.toLowerCase()}…`} /></SelectTrigger>
      <SelectContent>
        {options.map((o: any) => <SelectItem key={o.id} value={o.id}>{o[field.fkLabel ?? "name"]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function RecordEditor({
  id, table, fields, entityLabel, listHref, titleKey = "name", writeRoles,
}: {
  id: string;
  table: string;
  fields: FieldDef[];
  entityLabel: string;
  listHref: string;
  titleKey?: string;
  writeRoles?: string[];
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { tenant, hasRole } = useAuth();
  const canWrite = hasRole((writeRoles ?? ["tenant_admin", "super_admin", "sales"]) as any);
  const isNew = id === "new";

  const { data: record, isLoading } = useQuery({
    queryKey: [table, "record", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from(table as any).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? (f.type === "number" ? 0 : "")])),
  );

  useEffect(() => { if (record) setValues(record); }, [record]);

  const set = (k: string, v: any) => setValues((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant");
      const payload: Record<string, any> = {};
      for (const f of fields) {
        let v = values[f.key];
        if (f.required && (v === "" || v == null)) throw new Error(`${f.label} is required`);
        const err = f.validate?.(v, values);
        if (err) throw new Error(err);
        if (f.type === "number") v = v === "" || v == null ? null : Number(v);
        if (v === "") v = null;
        payload[f.key] = v;
      }
      if (isNew) {
        const { data, error } = await supabase.from(table as any).insert({ ...payload, tenant_id: tenant.id }).select("id").single();
        if (error) throw error;
        return (data as any).id as string;
      }
      const { error } = await supabase.from(table as any).update(payload).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (newId) => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: [table] });
      if (isNew) nav({ to: `${listHref}/${newId}` as any });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  if (!isNew && isLoading) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  const textFields = fields.filter((f) => f.type !== "textarea");
  const longFields = fields.filter((f) => f.type === "textarea");

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: listHref as any })}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold truncate">{isNew ? `New ${entityLabel}` : values[titleKey] || entityLabel}</h1>
              {values.status && <Badge variant="secondary">{values.status}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{isNew ? `Create a new ${entityLabel.toLowerCase()} record` : `${entityLabel} details`}</p>
          </div>
        </div>
        {canWrite && (
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save
          </Button>
        )}
      </div>

      <Card className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {textFields.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
            {f.type === "select" ? (
              <Select value={values[f.key] ?? ""} onValueChange={(v) => set(f.key, v)} disabled={!canWrite}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            ) : f.type === "fk" ? (
              <FkField field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} disabled={!canWrite} />
            ) : (
              <Input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                step={f.type === "number" ? "any" : undefined}
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, f.type === "number" ? e.target.value : e.target.value)}
                disabled={!canWrite}
              />
            )}
          </div>
        ))}
      </Card>

      {longFields.length > 0 && (
        <Card className="p-4 grid gap-4">
          {longFields.map((f) => (
            <div key={f.key} className="grid gap-1.5">
              <Label>{f.label}</Label>
              <Textarea rows={4} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} disabled={!canWrite} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
