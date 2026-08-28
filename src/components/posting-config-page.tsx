import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle, CheckCircle2, Info, Loader2, RefreshCw, Settings2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SystemMapping {
  purpose:      string;
  default_code: string;
  label:        string;
  description:  string | null;
  module:       string;
  sort_order:   number;
  is_required:  boolean;
}

interface PostingConfig {
  purpose:    string;
  account_id: string | null;
}

interface GlAccount {
  id:   string;
  code: string | null;
  name: string;
  type: string | null;
}

const db = supabase as any;

// ─── Section meta ─────────────────────────────────────────────────────────────

const MODULE_META: Record<string, { label: string; color: string; description: string }> = {
  sales:      { label: "Sales",      color: "text-emerald-600 dark:text-emerald-400",  description: "Accounts used when posting invoices, credit notes, and customer receipts" },
  purchasing: { label: "Purchasing", color: "text-blue-600 dark:text-blue-400",        description: "Accounts used when posting supplier bills, expenses, and payments made" },
  inventory:  { label: "Inventory",  color: "text-amber-600 dark:text-amber-400",      description: "Accounts used for stock movements, adjustments, and production orders" },
  banking:    { label: "Banking",    color: "text-violet-600 dark:text-violet-400",    description: "Default cash/bank account and contra accounts for bank transactions" },
  general:    { label: "General",    color: "text-muted-foreground",                   description: "Equity and retained earnings accounts" },
};

const MODULE_ORDER = ["sales","purchasing","inventory","banking","general"];

// ─── Account row ─────────────────────────────────────────────────────────────

function ConfigRow({
  mapping,
  currentAccountId,
  glAccounts,
  onSave,
  saving,
  canWrite,
  defaultAccount,
}: {
  mapping:          SystemMapping;
  currentAccountId: string | null;
  glAccounts:       GlAccount[];
  onSave:           (purpose: string, accountId: string | null) => Promise<void>;
  saving:           boolean;
  canWrite:         boolean;
  defaultAccount:   GlAccount | null;
}) {
  const [localId, setLocalId] = useState<string>(currentAccountId ?? "default");
  const [dirty,   setDirty]   = useState(false);

  const handleChange = (v: string) => {
    setLocalId(v);
    setDirty(v !== (currentAccountId ?? "default"));
  };

  const handleSave = async () => {
    await onSave(mapping.purpose, localId === "default" ? null : localId);
    setDirty(false);
  };

  const selectedAccount = glAccounts.find((a) => a.id === localId) ?? null;
  const effectiveAccount = selectedAccount ?? defaultAccount;

  return (
    <div className="grid grid-cols-[1fr_260px_auto] gap-4 items-center py-3 border-b last:border-0 group">
      {/* Label + description */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{mapping.label}</span>
          {mapping.is_required && (
            <span className="text-[10px] text-destructive font-semibold uppercase tracking-wide">Required</span>
          )}
          {!mapping.is_required && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Optional</span>
          )}
        </div>
        {mapping.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{mapping.description}</p>
        )}
        <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
          purpose: {mapping.purpose} · default code: {mapping.default_code}
        </p>
      </div>

      {/* Account picker */}
      <div>
        {canWrite ? (
          <Select value={localId} onValueChange={handleChange}>
            <SelectTrigger className={`h-8 text-xs ${dirty ? "border-primary ring-1 ring-primary/30" : ""}`}>
              <SelectValue>
                {selectedAccount ? (
                  <span>
                    <span className="font-mono text-muted-foreground mr-1.5 text-[11px]">{selectedAccount.code}</span>
                    {selectedAccount.name}
                  </span>
                ) : defaultAccount ? (
                  <span className="text-muted-foreground italic">
                    Default: {defaultAccount.code} {defaultAccount.name}
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">Not configured</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                <span className="text-muted-foreground italic">
                  Use default ({mapping.default_code})
                </span>
              </SelectItem>
              <Separator className="my-1" />
              {glAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="font-mono text-muted-foreground mr-1.5 text-[11px]">{a.code}</span>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="h-8 flex items-center px-3 rounded-md border bg-muted/30 text-xs">
            {effectiveAccount ? (
              <span>
                <span className="font-mono text-muted-foreground mr-1.5">{effectiveAccount.code}</span>
                {effectiveAccount.name}
              </span>
            ) : (
              <span className="text-muted-foreground/60 italic">Not set</span>
            )}
          </div>
        )}
      </div>

      {/* Save button — only visible when dirty */}
      <div className="w-16 flex justify-end">
        {dirty && canWrite && (
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </Button>
        )}
        {!dirty && currentAccountId && (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
        {!dirty && !currentAccountId && mapping.is_required && (
          <AlertCircle className="h-4 w-4 text-amber-500 opacity-60" />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PostingConfigPage() {
  const { can, tenant } = useAuth();
  const qc = useQueryClient();

  const canWrite = can(["accounting.settings.manage", "accounting.update"]);

  // ── Fetch system mappings ──────────────────────────────────────────────────
  const { data: mappings = [] } = useQuery<SystemMapping[]>({
    queryKey: ["system_account_mappings"],
    staleTime: 120_000,
    queryFn: async () => {
      const { data } = await db.from("system_account_mappings")
        .select("purpose,default_code,label,description,module,sort_order,is_required")
        .order("module").order("sort_order");
      return data ?? [];
    },
  });

  // ── Fetch current tenant posting config ────────────────────────────────────
  const { data: configs = [], isLoading: cfgLoading } = useQuery<PostingConfig[]>({
    queryKey: ["posting_config", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await db.from("posting_config").select("purpose,account_id");
      return data ?? [];
    },
  });

  const configMap = useMemo(
    () => new Map(configs.map((c) => [c.purpose, c.account_id])),
    [configs],
  );

  // ── Fetch GL accounts for pickers ─────────────────────────────────────────
  const { data: glAccounts = [] } = useQuery<GlAccount[]>({
    queryKey: ["chart_of_accounts", "posting-config-picker"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await db.from("chart_of_accounts")
        .select("id,code,name,type")
        .is("deleted_at", null).eq("is_active", true).order("code");
      return data ?? [];
    },
  });

  const glMap = useMemo(() => new Map(glAccounts.map((a) => [a.id, a])), [glAccounts]);

  // ── Default account resolver ───────────────────────────────────────────────
  const defaultAccountFor = (mapping: SystemMapping): GlAccount | null =>
    glAccounts.find((a) => a.code === mapping.default_code) ?? null;

  // ── Save mutation ──────────────────────────────────────────────────────────
  const [savingPurpose, setSavingPurpose] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async ({ purpose, accountId }: { purpose: string; accountId: string | null }) => {
      const { error } = await db.rpc("upsert_posting_config", {
        _purpose:    purpose,
        _account_id: accountId,
      });
      if (error) throw error;
    },
    onSuccess: (_, { purpose }) => {
      toast.success("Configuration saved");
      setSavingPurpose(null);
      qc.invalidateQueries({ queryKey: ["posting_config"] });
    },
    onError: (e: Error, { purpose }) => {
      toast.error(e.message ?? "Save failed");
      setSavingPurpose(null);
    },
  });

  const handleSave = async (purpose: string, accountId: string | null) => {
    setSavingPurpose(purpose);
    await saveMutation.mutateAsync({ purpose, accountId });
  };

  // ── Group mappings by module ───────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, SystemMapping[]>();
    for (const m of mappings) {
      if (!map.has(m.module)) map.set(m.module, []);
      map.get(m.module)!.push(m);
    }
    return MODULE_ORDER.map((mod) => ({ module: mod, rows: map.get(mod) ?? [] }))
      .filter((g) => g.rows.length > 0);
  }, [mappings]);

  // ── Validation: required accounts not yet configured ──────────────────────
  const missingRequired = mappings.filter(
    (m) => m.is_required && !configMap.has(m.purpose) && !defaultAccountFor(m),
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">Posting Configuration</h1>
            {cfgLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
            onClick={() => qc.invalidateQueries({ queryKey: ["posting_config"] })}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Map each posting purpose to a GL account. Posting functions use these mappings instead
          of hard-coded account numbers — change an account here and every future posting picks it up immediately.
        </p>
      </div>

      {/* ── Validation banner ── */}
      {missingRequired.length > 0 && (
        <div className="shrink-0 px-6 py-2">
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <AlertDescription className="text-xs">
              <span className="font-semibold">{missingRequired.length} required account{missingRequired.length !== 1 ? "s" : ""} not configured: </span>
              {missingRequired.map((m) => m.label).join(", ")}.
              Posting will fail for these document types until they are set.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ── Info banner ── */}
      <div className="shrink-0 mx-6 mt-3 mb-1 rounded-md border bg-muted/20 px-4 py-2.5 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Accounts marked <strong>Required</strong> must be set before you can post the relevant document types.
          <strong> Optional</strong> accounts provide more precise GL classification (e.g. separate discount and VAT accounts).
          If an account is not explicitly configured, the system uses the default code shown in the row.
        </span>
      </div>

      {/* ── Config sections ── */}
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4 space-y-8">
        {grouped.map(({ module, rows }) => {
          const meta = MODULE_META[module] ?? { label: module, color: "text-muted-foreground", description: "" };
          return (
            <section key={module}>
              {/* Section header */}
              <div className="mb-4">
                <h2 className={`text-[11px] font-bold uppercase tracking-widest ${meta.color}`}>
                  {meta.label}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_260px_auto] gap-4 pb-1 mb-1 border-b">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Account Purpose</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mapped Account</span>
                <span className="w-16" />
              </div>

              {rows.map((mapping) => (
                <ConfigRow
                  key={mapping.purpose}
                  mapping={mapping}
                  currentAccountId={configMap.get(mapping.purpose) ?? null}
                  glAccounts={glAccounts}
                  onSave={handleSave}
                  saving={savingPurpose === mapping.purpose && saveMutation.isPending}
                  canWrite={canWrite}
                  defaultAccount={defaultAccountFor(mapping)}
                />
              ))}
            </section>
          );
        })}

        {/* Footer note */}
        <p className="text-xs text-muted-foreground pb-4">
          Changes take effect immediately on the next posting. Previously posted journals are not affected —
          they recorded the account that was active at post time.
        </p>
      </div>
    </div>
  );
}
