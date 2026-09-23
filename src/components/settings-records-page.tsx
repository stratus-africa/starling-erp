import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/typed-db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QueryEmpty, QueryError, QueryLoading } from "@/components/query-state";

type Kind = "currencies" | "payment-terms" | "numbering" | "notifications" | "api-keys";
type RecordRow = Record<string, any>;

const configs: Record<
  Exclude<Kind, "api-keys">,
  { title: string; description: string; table: string; singular: string }
> = {
  currencies: {
    title: "Currencies",
    description: "Currencies and exchange rates available to this workspace.",
    table: "tenant_currencies",
    singular: "Currency",
  },
  "payment-terms": {
    title: "Payment Terms",
    description: "Standard credit terms for customers and suppliers.",
    table: "tenant_payment_terms",
    singular: "Payment term",
  },
  numbering: {
    title: "Document Numbering",
    description: "Prefixes and next numbers for business documents.",
    table: "tenant_document_numbering",
    singular: "Numbering series",
  },
  notifications: {
    title: "Notifications",
    description: "Notification rules for this workspace.",
    table: "tenant_notification_preferences",
    singular: "Notification rule",
  },
};

const documentTypes = [
  "Quote",
  "Sales Order",
  "Invoice",
  "Credit Note",
  "Purchase Requisition",
  "Purchase Order",
  "Bill",
  "Package",
  "Shipment",
];
const initial = (kind: Kind): RecordRow =>
  kind === "currencies"
    ? { code: "", name: "", exchange_rate: "1", is_active: true }
    : kind === "payment-terms"
      ? { name: "", days_due: "30", is_active: true }
      : kind === "numbering"
        ? { document_type: "Invoice", prefix: "", next_number: "1", is_active: true }
        : kind === "notifications"
          ? { event: "", audience: "", channels: ["in_app"], is_active: true }
          : { name: "", expires_at: "" };

function channelLabel(channels: string[] = []) {
  return channels.map((channel) => (channel === "in_app" ? "In-app" : "Email")).join(" + ");
}

function validate(kind: Kind, values: RecordRow): string | null {
  if (kind === "currencies") {
    if (!/^[A-Za-z]{3}$/.test(values.code ?? ""))
      return "Currency code must have exactly three letters.";
    if (!values.name?.trim()) return "Currency name is required.";
    if (!Number.isFinite(Number(values.exchange_rate)) || Number(values.exchange_rate) <= 0)
      return "Exchange rate must be greater than zero.";
  }
  if (kind === "payment-terms") {
    if (!values.name?.trim()) return "Term name is required.";
    if (
      !Number.isInteger(Number(values.days_due)) ||
      Number(values.days_due) < 0 ||
      Number(values.days_due) > 3650
    )
      return "Days due must be a whole number from 0 to 3650.";
  }
  if (kind === "numbering") {
    if (!documentTypes.includes(values.document_type)) return "Select a document type.";
    if ((values.prefix ?? "").length > 80) return "Prefix may not exceed 80 characters.";
    if (!Number.isInteger(Number(values.next_number)) || Number(values.next_number) < 1)
      return "Next number must be a positive whole number.";
  }
  if (kind === "notifications") {
    if (!values.event?.trim()) return "Event is required.";
    if (!values.audience?.trim()) return "Audience is required.";
    if (!values.channels?.length) return "Choose at least one delivery channel.";
  }
  if (kind === "api-keys") {
    if (!values.name?.trim()) return "API key name is required.";
    if (values.expires_at && new Date(`${values.expires_at}T23:59:59`).getTime() <= Date.now())
      return "Expiry must be in the future.";
  }
  return null;
}

export function SettingsRecordsPage({ kind }: { kind: Kind }) {
  const { tenant, can } = useAuth();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<RecordRow | null>(null);
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const config =
    kind === "api-keys"
      ? {
          title: "API Keys",
          description: "Generate and revoke programmatic credentials for this workspace.",
          table: "tenant_api_keys",
          singular: "API key",
        }
      : configs[kind];
  const canWrite = can("settings.company.update");
  const key = ["settings", kind, tenant?.id];

  const query = useQuery({
    queryKey: key,
    enabled: !!tenant?.id,
    queryFn: async () => {
      const selectColumns =
        kind === "api-keys"
          ? "id,tenant_id,name,key_prefix,created_at,last_used_at,expires_at,revoked_at"
          : "*";
      let request = db.from(config.table).select(selectColumns).eq("tenant_id", tenant!.id);
      if (kind !== "api-keys")
        request = request.is("deleted_at", null).order("created_at", { ascending: false });
      else request = request.order("created_at", { ascending: false });
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as RecordRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (values: RecordRow) => {
      const issue = validate(kind, values);
      if (issue) throw new Error(issue);
      if (kind === "api-keys") {
        if (values.id) {
          const { error } = await db.rpc("update_tenant_api_key", {
            _key_id: values.id,
            _name: values.name.trim(),
            _expires_at: values.expires_at ? `${values.expires_at}T23:59:59Z` : null,
          });
          if (error) throw error;
          return {};
        }
        const { data, error } = await db.rpc("create_tenant_api_key", {
          _name: values.name.trim(),
          _expires_at: values.expires_at ? `${values.expires_at}T23:59:59Z` : null,
        });
        if (error) throw error;
        return { rawKey: (data as RecordRow).key as string };
      }
      const payload =
        kind === "currencies"
          ? {
              code: values.code.trim().toUpperCase(),
              name: values.name.trim(),
              exchange_rate: Number(values.exchange_rate),
              is_active: !!values.is_active,
            }
          : kind === "payment-terms"
            ? {
                name: values.name.trim(),
                days_due: Number(values.days_due),
                is_active: !!values.is_active,
              }
            : kind === "numbering"
              ? {
                  document_type: values.document_type,
                  prefix: values.prefix.trim(),
                  next_number: Number(values.next_number),
                  is_active: !!values.is_active,
                }
              : {
                  event: values.event.trim(),
                  audience: values.audience.trim(),
                  channels: values.channels,
                  is_active: !!values.is_active,
                };
      const { error } = values.id
        ? await db
            .from(config.table)
            .update(payload)
            .eq("id", values.id)
            .eq("tenant_id", tenant!.id)
        : await db.from(config.table).insert({ ...payload, tenant_id: tenant!.id });
      if (error) throw error;
      return {};
    },
    onSuccess: (result) => {
      setEditor(null);
      queryClient.invalidateQueries({ queryKey: key });
      if (result.rawKey) setVisibleKey(result.rawKey);
      toast.success(
        kind === "api-keys" ? (result.rawKey ? "API key generated" : "API key updated") : "Saved",
      );
    },
    onError: (error: Error) => toast.error(error.message || "Could not save this setting."),
  });

  const remove = useMutation({
    mutationFn: async (row: RecordRow) => {
      if (kind === "api-keys") {
        const { error } = await db.rpc("revoke_tenant_api_key", { _key_id: row.id });
        if (error) throw error;
      } else {
        const { error } = await db
          .from(config.table)
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("tenant_id", tenant!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success(kind === "api-keys" ? "API key revoked" : "Deleted");
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete this setting."),
  });

  const rows = query.data ?? [];
  const columns = useMemo(
    () =>
      kind === "currencies"
        ? ["Code", "Currency", "Rate", "Status"]
        : kind === "payment-terms"
          ? ["Term", "Days", "Status"]
          : kind === "numbering"
            ? ["Document", "Prefix", "Next #", "Status"]
            : kind === "notifications"
              ? ["Event", "Channel", "Audience", "Status"]
              : ["Name", "Prefix", "Created", "Last used", "Status"],
    [kind],
  );

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{config.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{config.description}</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setEditor(initial(kind))}>
            <Plus className="mr-1.5 h-4 w-4" />
            {kind === "api-keys" ? "Generate key" : `New ${config.singular}`}
          </Button>
        )}
      </div>
      {query.isLoading ? (
        <QueryLoading label={`Loading ${config.title.toLowerCase()}…`} />
      ) : query.isError ? (
        <QueryError
          error={query.error}
          retry={() => query.refetch()}
          label={`Could not load ${config.title.toLowerCase()}.`}
        />
      ) : rows.length === 0 ? (
        <QueryEmpty
          message={`No ${config.title.toLowerCase()} have been configured yet.`}
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setEditor(initial(kind))}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add {config.singular}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                  {canWrite && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    {kind === "currencies" && (
                      <>
                        <TableCell className="font-mono">{row.code}</TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>
                          {Number(row.exchange_rate).toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          })}
                        </TableCell>
                        <TableCell>{row.is_active ? "Active" : "Inactive"}</TableCell>
                      </>
                    )}
                    {kind === "payment-terms" && (
                      <>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.days_due}</TableCell>
                        <TableCell>{row.is_active ? "Active" : "Inactive"}</TableCell>
                      </>
                    )}
                    {kind === "numbering" && (
                      <>
                        <TableCell className="font-medium">{row.document_type}</TableCell>
                        <TableCell className="font-mono">{row.prefix || "—"}</TableCell>
                        <TableCell>{row.next_number}</TableCell>
                        <TableCell>{row.is_active ? "Active" : "Inactive"}</TableCell>
                      </>
                    )}
                    {kind === "notifications" && (
                      <>
                        <TableCell className="font-medium">{row.event}</TableCell>
                        <TableCell>{channelLabel(row.channels)}</TableCell>
                        <TableCell>{row.audience}</TableCell>
                        <TableCell>{row.is_active ? "Active" : "Inactive"}</TableCell>
                      </>
                    )}
                    {kind === "api-keys" && (
                      <>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="font-mono">{row.key_prefix}</TableCell>
                        <TableCell>{new Date(row.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {row.last_used_at
                            ? new Date(row.last_used_at).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          {row.revoked_at
                            ? "Revoked"
                            : row.expires_at && new Date(row.expires_at) < new Date()
                              ? "Expired"
                              : "Active"}
                        </TableCell>
                      </>
                    )}
                    {canWrite && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          disabled={kind === "api-keys" && !!row.revoked_at}
                          onClick={() =>
                            setEditor({
                              ...row,
                              exchange_rate: String(row.exchange_rate ?? ""),
                              days_due: String(row.days_due ?? ""),
                              next_number: String(row.next_number ?? ""),
                              expires_at: row.expires_at?.slice(0, 10) ?? "",
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={kind === "api-keys" ? "Revoke" : "Delete"}
                          disabled={remove.isPending || (kind === "api-keys" && !!row.revoked_at)}
                          onClick={() => remove.mutate(row)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      <EditorDialog
        kind={kind}
        value={editor}
        setValue={setEditor}
        onSave={(value) => save.mutate(value)}
        saving={save.isPending}
      />
      <KeyDialog secret={visibleKey} onClose={() => setVisibleKey(null)} />
    </div>
  );
}

function EditorDialog({
  kind,
  value,
  setValue,
  onSave,
  saving,
}: {
  kind: Kind;
  value: RecordRow | null;
  setValue: (value: RecordRow | null) => void;
  onSave: (value: RecordRow) => void;
  saving: boolean;
}) {
  if (!value) return null;
  const set = (patch: RecordRow) => setValue({ ...value, ...patch });
  const title = value.id
    ? "Edit setting"
    : kind === "api-keys"
      ? "Generate API key"
      : "New setting";
  return (
    <Dialog open onOpenChange={(open) => !open && setValue(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === "api-keys"
              ? "The full key will be shown once. Store it somewhere secure."
              : "Changes apply only to the current workspace."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {kind === "currencies" && (
            <>
              <Field label="Code">
                <Input
                  maxLength={3}
                  value={value.code}
                  onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                  placeholder="USD"
                />
              </Field>
              <Field label="Name">
                <Input
                  value={value.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="US Dollar"
                />
              </Field>
              <Field label="Rate to base currency">
                <Input
                  type="number"
                  min="0.000001"
                  step="any"
                  value={value.exchange_rate}
                  onChange={(e) => set({ exchange_rate: e.target.value })}
                />
              </Field>
            </>
          )}
          {kind === "payment-terms" && (
            <>
              <Field label="Name">
                <Input
                  value={value.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Net 30"
                />
              </Field>
              <Field label="Days due">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={value.days_due}
                  onChange={(e) => set({ days_due: e.target.value })}
                />
              </Field>
            </>
          )}
          {kind === "numbering" && (
            <>
              <Field label="Document type">
                <Select
                  value={value.document_type}
                  onValueChange={(document_type) => set({ document_type })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {documentTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Prefix">
                <Input
                  value={value.prefix}
                  onChange={(e) => set({ prefix: e.target.value })}
                  placeholder="INV-{YYYY}-"
                />
              </Field>
              <Field label="Next number">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={value.next_number}
                  onChange={(e) => set({ next_number: e.target.value })}
                />
              </Field>
            </>
          )}
          {kind === "notifications" && (
            <>
              <Field label="Event">
                <Input
                  value={value.event}
                  onChange={(e) => set({ event: e.target.value })}
                  placeholder="Sales Order confirmed"
                />
              </Field>
              <Field label="Audience">
                <Input
                  value={value.audience}
                  onChange={(e) => set({ audience: e.target.value })}
                  placeholder="Sales, Logistics"
                />
              </Field>
              <div className="grid gap-2">
                <Label>Channels</Label>
                <div className="flex gap-4">
                  {["in_app", "email"].map((channel) => (
                    <label className="flex items-center gap-2 text-sm" key={channel}>
                      <input
                        type="checkbox"
                        checked={value.channels.includes(channel)}
                        onChange={() =>
                          set({
                            channels: value.channels.includes(channel)
                              ? value.channels.filter((item: string) => item !== channel)
                              : [...value.channels, channel],
                          })
                        }
                      />
                      {channel === "in_app" ? "In-app" : "Email"}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
          {kind === "api-keys" && (
            <>
              <Field label="Name">
                <Input
                  value={value.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Warehouse integration"
                />
              </Field>
              <Field label="Expires on (optional)">
                <Input
                  type="date"
                  value={value.expires_at}
                  onChange={(e) => set({ expires_at: e.target.value })}
                />
              </Field>
            </>
          )}
          {kind !== "api-keys" && (
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Active</Label>
              <Switch
                id="active"
                checked={!!value.is_active}
                onCheckedChange={(is_active) => set({ is_active })}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setValue(null)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => onSave(value)}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function KeyDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!secret) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    toast.success("API key copied");
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Copy your API key now
          </DialogTitle>
          <DialogDescription>
            For security, this plaintext key will not be displayed again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
          <code className="min-w-0 flex-1 break-all text-xs">{secret}</code>
          <Button size="icon" variant="outline" onClick={copy} aria-label="Copy API key">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
