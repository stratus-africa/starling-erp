import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle, CheckCircle2, Loader2, Pencil, Percent, Plus, ShieldCheck, Trash2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaxRate {
  id: string;
  name: string;
  code: string | null;
  rate: number;
  tax_type: "Output" | "Input" | "Exempt" | "Withholding";
  is_inclusive: boolean;
  output_account_id: string | null;
  input_account_id: string | null;
  is_default: boolean;
  is_active: boolean;
  description: string | null;
}

interface GlAccount { id: string; code: string | null; name: string; type: string | null; }

const db = supabase as any;

const TAX_TYPES = ["Output","Input","Exempt","Withholding"] as const;

const TYPE_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  Output:      { label: "Output VAT",     color: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",           description: "VAT collected from customers — payable to KRA" },
  Input:       { label: "Input VAT",      color: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",        description: "VAT paid on purchases — recoverable from KRA" },
  Exempt:      { label: "Exempt",         color: "bg-muted text-muted-foreground",                                             description: "Zero-rated or exempt — no VAT entries generated" },
  Withholding: { label: "Withholding",    color: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",    description: "Tax withheld from payments and remitted to KRA" },
};

function TaxTypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.Exempt;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Editor Sheet ─────────────────────────────────────────────────────────────

interface EditorProps {
  open: boolean;
  rate: TaxRate | null;
  glAccounts: GlAccount[];
  onClose: () => void;
  onSave: (values: Partial<TaxRate>, id?: string) => Promise<void>;
  saving: boolean;
}

function emptyForm(): Partial<TaxRate> {
  return {
    name: "", code: "", rate: 0, tax_type: "Output",
    is_inclusive: false, is_default: false, is_active: true,
    output_account_id: null, input_account_id: null, description: "",
  };
}

function EditorSheet({ open, rate, glAccounts, onClose, onSave, saving }: EditorProps) {
  const isEdit = rate !== null;
  const [form, setForm] = useState<Partial<TaxRate>>(() => rate ?? emptyForm());

  useMemo(() => { setForm(rate ?? emptyForm()); }, [rate?.id, open]);

  const set = <K extends keyof TaxRate>(k: K, v: TaxRate[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error("Tax name is required"); return; }
    if ((form.rate ?? 0) < 0 || (form.rate ?? 0) > 100) { toast.error("Rate must be between 0 and 100"); return; }
    await onSave(form, rate?.id);
  };

  // Filter GL accounts to useful types for VAT
  const liabilityAccounts = glAccounts.filter((a) => a.type === "Liability");
  const assetAccounts     = glAccounts.filter((a) => a.type === "Asset");

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Tax Rate" : "New Tax Rate"}</SheetTitle>
          <SheetDescription>
            {isEdit ? `${rate.name} · ${rate.rate}%` : "Configure a tax rate and its GL accounts."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
          <div className="flex-1 space-y-5 px-1 py-3">

            {/* Identity */}
            <section>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Identity</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tax Name <span className="text-destructive">*</span></Label>
                  <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. VAT 16%" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Code</Label>
                    <Input className="font-mono" value={form.code ?? ""} onChange={(e) => set("code", e.target.value)}
                      placeholder="VAT16" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Rate (%)</Label>
                    <Input type="number" step="0.0001" min="0" max="100" className="font-mono"
                      value={form.rate ?? 0}
                      onChange={(e) => set("rate", Number(e.target.value))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tax Type</Label>
                  <Select value={form.tax_type ?? "Output"} onValueChange={(v) => set("tax_type", v as TaxRate["tax_type"])}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TAX_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          <div>
                            <p className="font-medium">{TYPE_CONFIG[t].label}</p>
                            <p className="text-[10px] text-muted-foreground">{TYPE_CONFIG[t].description}</p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea rows={2} className="text-xs resize-none"
                    value={form.description ?? ""} onChange={(e) => set("description", e.target.value)}
                    placeholder="Optional notes…" />
                </div>
              </div>
            </section>

            <Separator />

            {/* GL Accounts */}
            <section>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">GL Account Mapping</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Output VAT account (collected from customers)</Label>
                  <p className="text-[10px] text-muted-foreground">Typically 2100 Output VAT — a Liability account</p>
                  <Select value={form.output_account_id ?? "none"}
                    onValueChange={(v) => set("output_account_id", v === "none" ? null : v)}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <Separator className="my-1" />
                      {liabilityAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="font-mono text-muted-foreground mr-1.5 text-[11px]">{a.code}</span>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Input VAT account (paid on purchases — recoverable)</Label>
                  <p className="text-[10px] text-muted-foreground">Typically 1150 Input VAT — an Asset account</p>
                  <Select value={form.input_account_id ?? "none"}
                    onValueChange={(v) => set("input_account_id", v === "none" ? null : v)}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <Separator className="my-1" />
                      {assetAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="font-mono text-muted-foreground mr-1.5 text-[11px]">{a.code}</span>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <Separator />

            {/* Settings */}
            <section>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Settings</p>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Tax-inclusive pricing</p>
                    <p className="text-xs text-muted-foreground">When on, document prices already include tax (tax is backed out)</p>
                  </div>
                  <Switch checked={form.is_inclusive ?? false}
                    onCheckedChange={(v) => set("is_inclusive", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Default rate</p>
                    <p className="text-xs text-muted-foreground">Auto-applied to new document lines</p>
                  </div>
                  <Switch checked={form.is_default ?? false}
                    onCheckedChange={(v) => set("is_default", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Active</p>
                    <p className="text-xs text-muted-foreground">Inactive rates are hidden from document selectors</p>
                  </div>
                  <Switch checked={form.is_active ?? true}
                    onCheckedChange={(v) => set("is_active", v)} />
                </div>
              </div>
            </section>
          </div>

          <div className="shrink-0 border-t px-1 pt-3 pb-1 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save changes" : "Create rate"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TaxSettingsPage() {
  const { can, tenant } = useAuth();
  const qc = useQueryClient();

  const canWrite = can(["accounting.settings.manage", "accounting.create"]);

  const [editing,  setEditing]  = useState<TaxRate | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TaxRate | null>(null);

  const { data: rates = [], isLoading } = useQuery<TaxRate[]>({
    queryKey: ["tax_rates", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db.from("tax_rates")
        .select("*").is("deleted_at", null).order("rate", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: glAccounts = [] } = useQuery<GlAccount[]>({
    queryKey: ["chart_of_accounts", "tax-picker"],
    queryFn: async () => {
      const { data } = await db.from("chart_of_accounts").select("id,code,name,type")
        .is("deleted_at", null).eq("is_active", true).order("code");
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tax_rates"] });

  const saveMutation = useMutation({
    mutationFn: async ({ values, id }: { values: Partial<TaxRate>; id?: string }) => {
      if (!tenant?.id) throw new Error("No tenant");
      if (id) {
        const { error } = await db.from("tax_rates").update(values).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await db.from("tax_rates").insert({ ...values, tenant_id: tenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Tax rate saved");
      setEditing(null); setCreating(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Save failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("tax_rates")
        .update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tax rate deleted"); setDeleting(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Delete failed"),
  });

  const glMap = useMemo(() => new Map(glAccounts.map((a) => [a.id, a])), [glAccounts]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Tax Rates</h1>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          {canWrite && (
            <Button size="sm" className="h-8" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New Tax Rate
            </Button>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Tax rates control how VAT is split into separate GL accounts when invoices and bills are posted.
          The Output VAT account collects VAT owed to KRA; the Input VAT account tracks reclaimable tax.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-6 py-2.5 text-left">Name</th>
              <th className="px-4 py-2.5 text-left w-20">Code</th>
              <th className="px-4 py-2.5 text-right w-20">Rate</th>
              <th className="px-4 py-2.5 text-left w-32">Type</th>
              <th className="px-4 py-2.5 text-left">Output GL</th>
              <th className="px-4 py-2.5 text-left">Input GL</th>
              <th className="px-4 py-2.5 text-left w-24">Inclusive</th>
              <th className="px-4 py-2.5 text-left w-24">Status</th>
              <th className="w-16 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {!isLoading && rates.length === 0 && (
              <tr><td colSpan={9} className="py-16 text-center text-xs text-muted-foreground">
                No tax rates configured. Add your first rate.
              </td></tr>
            )}
            {rates.map((rate) => {
              const outputAcct = rate.output_account_id ? glMap.get(rate.output_account_id) : null;
              const inputAcct  = rate.input_account_id  ? glMap.get(rate.input_account_id)  : null;
              return (
                <tr key={rate.id} className="group border-b transition-colors hover:bg-muted/30">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rate.name}</span>
                      {rate.is_default && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                          Default
                        </span>
                      )}
                    </div>
                    {rate.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{rate.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground">{rate.code ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-sm font-semibold">
                      {Number(rate.rate).toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3"><TaxTypeBadge type={rate.tax_type} /></td>
                  <td className="px-4 py-3 text-xs">
                    {outputAcct ? (
                      <span>
                        <span className="font-mono text-muted-foreground mr-1">{outputAcct.code}</span>
                        {outputAcct.name}
                      </span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {inputAcct ? (
                      <span>
                        <span className="font-mono text-muted-foreground mr-1">{inputAcct.code}</span>
                        {inputAcct.name}
                      </span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${rate.is_inclusive ? "text-foreground font-medium" : "text-muted-foreground/40"}`}>
                      {rate.is_inclusive ? "Inclusive" : "Exclusive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      rate.is_active
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {rate.is_active ? <><CheckCircle2 className="h-3 w-3" />Active</> : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => setEditing(rate)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {!rate.is_default && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeleting(rate)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Kenya VAT info panel */}
        <div className="mx-6 my-4 rounded-md border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1.5">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Kenya VAT — How the posting engine uses these rates
          </p>
          <p>When an invoice is posted, the engine splits the journal into Revenue (subtotal) and Output VAT (tax_total) using separate GL credits. The AR debit is always the full grand_total.</p>
          <p>When a bill is posted, the net amount debits Expense/Inventory and the tax amount debits Input VAT (1150), with Accounts Payable credited at the full grand_total.</p>
          <p>At period-end, the net VAT payable to KRA = Output VAT balance (2100) − Input VAT balance (1150).</p>
        </div>
      </div>

      <EditorSheet
        open={creating || !!editing}
        rate={editing}
        glAccounts={glAccounts}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSave={(values, id) => saveMutation.mutateAsync({ values, id })}
        saving={saveMutation.isPending}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tax rate?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{deleting?.name}</span> will be soft-deleted.
              Existing posted journals that used this rate are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
