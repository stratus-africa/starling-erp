import { useState, type ReactNode } from "react";
import type { ZodTypeAny } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  Filter,
  Download,
  Plus,
  Search,
  MoreHorizontal,
  Loader2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useModuleList, useModuleMutations, useFkOptions } from "@/hooks/use-module-data";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Permission } from "@/lib/permissions";
import { schemaByTable, formatZodError } from "@/lib/module-schemas";

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "fk" | "date";
  options?: string[];
  fkTable?: string;
  fkLabel?: string;
  required?: boolean;
  defaultValue?: any;
  hideInTable?: boolean;
  render?: (value: any, row: any) => ReactNode;
  className?: string;
  /** Section heading used to group fields in full-page editors. */
  group?: string;
  /** Return an error message when the value is invalid, otherwise null. */
  validate?: (value: any, values: Record<string, any>) => string | null;
}

interface DataModulePageProps {
  title: string;
  description: string;
  table: string;
  fields: FieldDef[];
  entityType?: string;
  entityLabel: string;
  attachments?: boolean;
  writeRoles?: AppRole[];
  permissionModule?: string;
  postPermission?: Permission | string;
  searchColumn?: string;
  defaultOrder?: string;
  rowHref?: (row: any) => string;
  createHref?: string;
  filterFields?: { key: string; label: string; options: string[] }[];
  postAction?: {
    rpc: string;
    paramName: string;
    label: string;
    showWhen?: (row: any) => boolean;
  };
  voidAction?: {
    permission: Permission | string;
    entityType: string;
    label?: string;
    reason?: string;
    showWhen?: (row: any) => boolean;
  };
}

const statusVariant: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Sent: "bg-info/15 text-info",
  Accepted: "bg-success/15 text-success",
  Approved: "bg-success/15 text-success",
  Paid: "bg-success/15 text-success",
  Delivered: "bg-success/15 text-success",
  Completed: "bg-success/15 text-success",
  Posted: "bg-success/15 text-success",
  Active: "bg-success/15 text-success",
  Confirmed: "bg-info/15 text-info",
  Processing: "bg-info/15 text-info",
  "In Transit": "bg-info/15 text-info",
  Pending: "bg-warning/15 text-warning",
  Overdue: "bg-destructive/15 text-destructive",
  Rejected: "bg-destructive/15 text-destructive",
  Cancelled: "bg-destructive/15 text-destructive",
};

export function DataModulePage(props: DataModulePageProps) {
  const {
    title,
    description,
    table,
    fields,
    entityLabel,
    attachments,
    writeRoles = ["tenant_admin"],
    searchColumn = "name",
    defaultOrder = "created_at",
    rowHref,
    createHref,
    postAction,
    voidAction,
    filterFields = [],
    permissionModule,
    postPermission,
  } = props;

  const { hasRole, can, tenant } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const inferredPermissionModule: Record<string, string> = {
    customers: "crm",
    sales_quotes: "sales",
    sales_orders: "sales",
    invoices: "sales",
    credit_notes: "sales",
    packages: "sales",
    shipments: "sales",
    payments_received: "payments",
    suppliers: "purchasing",
    purchase_orders: "purchasing",
    purchase_requisitions: "purchasing",
    bills: "purchasing",
    expenses: "purchasing",
    payments_made: "payments",
    items: "inventory",
    warehouses: "inventory",
    inventory_adjustments: "inventory",
    inventory_transfers: "inventory",
    production_orders: "manufacturing",
    bom_headers: "manufacturing",
    chart_of_accounts: "accounting",
    journal_entries: "accounting",
    bank_accounts: "banking",
  };
  const moduleName = permissionModule ?? inferredPermissionModule[table];
  const canWrite = moduleName
    ? can([`${moduleName}.create`, `${moduleName}.update`])
    : hasRole(["tenant_admin", "super_admin", ...writeRoles]);
  const canPost = postPermission ? can(postPermission) : can(`${moduleName}.post`);
  const canVoid = voidAction ? can(voidAction.permission) : false;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [orderBy, setOrderBy] = useState(defaultOrder);
  const [orderAsc, setOrderAsc] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading } = useModuleList(table, {
    search,
    searchColumn,
    page,
    pageSize,
    orderBy,
    orderAsc,
    filters,
  });
  const { create, update, remove } = useModuleMutations(table);

  const post = useMutation({
    mutationFn: async (id: string) => {
      if (postPermission && !can(postPermission)) throw new Error(`Not authorized: ${postPermission}`);
      const { error } = await (supabase as any).rpc(postAction!.rpc, { [postAction!.paramName]: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Posted");
      qc.invalidateQueries({ queryKey: [table, "list"] });
      qc.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: any) => toast.error(e.message ?? "Post failed"),
  });

  const voidDocument = useMutation({
    mutationFn: async (row: any) => {
      if (!voidAction || !can(voidAction.permission))
        throw new Error(`Not authorized: ${voidAction?.permission ?? "void"}`);
      const { data, error } = await (supabase as any).rpc("void_posted_document", {
        _entity_type: voidAction.entityType,
        _entity_id: row.id,
        _permission: voidAction.permission,
        _reason: voidAction.reason ?? `Voided ${entityLabel.toLowerCase()}`,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success(`${entityLabel} voided and reversed`);
      setVoidingRow(null);
      qc.invalidateQueries({ queryKey: [table, "list"] });
      qc.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: any) => toast.error(e.message ?? "Void failed"),
  });

  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [voidingRow, setVoidingRow] = useState<any | null>(null);

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const tableFields = fields.filter((f) => !f.hideInTable);

  const toggleSort = (key: string) => {
    if (orderBy === key) setOrderAsc(!orderAsc);
    else {
      setOrderBy(key);
      setOrderAsc(true);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          {canWrite &&
            (createHref ? (
              <Button asChild size="sm">
                <Link to={createHref as any}>
                  <Plus className="h-4 w-4 mr-1.5" /> New {entityLabel}
                </Link>
              </Button>
            ) : (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> New {entityLabel}
              </Button>
            ))}
        </div>
      </div>

      <Card className="overflow-hidden border shadow-sm p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-muted/30">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={`Search ${searchColumn}…`}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-8 pl-8 text-sm bg-background"
            />
          </div>
          {filterFields.length === 0 ? (
            <Button variant="outline" size="sm" className="h-8">
              <Filter className="h-3.5 w-3.5 mr-1.5" /> Filters
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              {filterFields.map((f) => (
                <Select
                  key={f.key}
                  value={filters[f.key] ?? "all"}
                  onValueChange={(v) => {
                    setFilters((p) => ({ ...p, [f.key]: v }));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[150px] bg-background text-xs">
                    <SelectValue placeholder={f.label} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All {f.label}</SelectItem>
                    {f.options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
              {Object.values(filters).some((v) => v && v !== "all") && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilters({})}>
                  Clear
                </Button>
              )}
            </div>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            {total} record{total === 1 ? "" : "s"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {tableFields.map((c) => (
                  <TableHead
                    key={c.key}
                    className={
                      "text-xs font-semibold uppercase tracking-wider text-muted-foreground " + (c.className ?? "")
                    }
                  >
                    <button
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {c.label}
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </button>
                  </TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={tableFields.length + 1} className="text-center py-16">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={tableFields.length + 1}
                    className="text-center text-sm text-muted-foreground py-16"
                  >
                    No records yet.{" "}
                    {canWrite && (
                      <>
                        Click <span className="font-medium">New {entityLabel}</span> to create one.
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const href = rowHref?.(row);
                return (
                  <TableRow
                    key={row.id}
                    className={"hover:bg-muted/30 " + (href ? "cursor-pointer" : "")}
                    onClick={href ? () => navigate({ to: href as any }) : undefined}
                  >
                    {tableFields.map((c) => {
                      const v = row[c.key];
                      const content = c.render ? (
                        c.render(v, row)
                      ) : c.key === "status" && typeof v === "string" ? (
                        <Badge
                          variant="secondary"
                          className={"font-medium " + (statusVariant[v] ?? "bg-muted text-muted-foreground")}
                        >
                          {v}
                        </Badge>
                      ) : v == null || v === "" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        String(v)
                      );
                      return (
                        <TableCell key={c.key} className={"text-sm " + (c.className ?? "")}>
                          {content}
                        </TableCell>
                      );
                    })}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {href ? (
                            <DropdownMenuItem onClick={() => navigate({ to: href as any })}>
                              {canWrite && !row.posted_at && row.status !== "Voided" ? "Open" : "View"}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => setEditing(row)}>
                              {canWrite && !row.posted_at && row.status !== "Voided" ? "Edit" : "View"}
                            </DropdownMenuItem>
                          )}
                          {postAction && (!postAction.showWhen || postAction.showWhen(row)) && (
                            <DropdownMenuItem onClick={() => post.mutate(row.id)} disabled={post.isPending}>
                              {post.isPending && post.variables === row.id ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : null}
                              {postAction.label}
                            </DropdownMenuItem>
                          )}
                          {voidAction &&
                            canVoid &&
                            row.posted_at &&
                            row.status !== "Voided" &&
                            (!voidAction.showWhen || voidAction.showWhen(row)) && (
                              <DropdownMenuItem className="text-destructive" onClick={() => setVoidingRow(row)}>
                                {voidAction.label ?? "Void & Reverse"}
                              </DropdownMenuItem>
                            )}
                          {canWrite && !row.posted_at && row.status !== "Voided" && (
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeletingId(row.id)}>
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div>
            Page {page} of {Math.max(1, Math.ceil(total / pageSize))} · {total} total
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </Card>

      <RecordSheet
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        fields={fields}
        row={editing}
        schema={schemaByTable[table as keyof typeof schemaByTable]}
        tenantId={tenant?.id}
        entityLabel={entityLabel}
        entityType={props.entityType ?? table}
        attachments={attachments}
        canWrite={canWrite && !(editing?.posted_at || editing?.status === "Voided")}
        onSubmit={async (values) => {
          if (editing) await update.mutateAsync({ id: editing.id, values });
          else await create.mutateAsync(values);
          setCreating(false);
          setEditing(null);
        }}
        busy={create.isPending || update.isPending}
        postAction={postAction}
        onPost={
          postAction && editing && canPost
            ? async () => {
                await post.mutateAsync(editing.id);
                setEditing(null);
              }
            : undefined
        }
        postBusy={post.isPending}
      />

      <AlertDialog open={!!voidingRow} onOpenChange={(o) => !o && setVoidingRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void and reverse this {entityLabel.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              The posted document will remain unchanged for audit purposes. A balanced reversal journal and inverse
              inventory movements will be created, and the original document will be marked Voided.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (voidingRow) voidDocument.mutate(voidingRow);
              }}
            >
              {voidDocument.isPending ? "Reversing…" : "Void & Reverse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {entityLabel.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              The record will be soft-deleted and hidden from lists. This can be reversed by an administrator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingId) {
                  await remove.mutateAsync(deletingId);
                  setDeletingId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RecordSheet({
  open,
  onOpenChange,
  fields,
  row,
  entityLabel,
  entityType,
  attachments,
  canWrite,
  onSubmit,
  busy,
  postAction,
  onPost,
  postBusy,
  schema,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fields: FieldDef[];
  row: any | null;
  entityLabel: string;
  entityType: string;
  attachments?: boolean;
  canWrite: boolean;
  onSubmit: (v: Record<string, any>) => Promise<void>;
  busy: boolean;
  postAction?: { rpc: string; paramName: string; label: string; showWhen?: (row: any) => boolean };
  onPost?: () => Promise<void>;
  postBusy?: boolean;
  schema?: ZodTypeAny;
  tenantId?: string;
}) {
  const [values, setValues] = useState<Record<string, any>>({});

  // Reset values when opening
  useState(() => values);
  const key = row?.id ?? (open ? "new" : "closed");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row ? `Edit ${entityLabel}` : `New ${entityLabel}`}</SheetTitle>
          <SheetDescription>
            {row ? "Update the record details." : `Add a new ${entityLabel.toLowerCase()} to your workspace.`}
          </SheetDescription>
        </SheetHeader>

        <form
          key={key}
          className="grid gap-4 py-4 px-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const v: Record<string, any> = { ...values };
            fields.forEach((f) => {
              if (v[f.key] === undefined) {
                const raw = fd.get(f.key);
                if (raw != null && raw !== "") v[f.key] = f.type === "number" ? Number(raw) : raw;
              }
            });
            if (schema) {
              if (!tenantId) {
                toast.error("No workspace selected");
                return;
              }
              const result = schema.safeParse({ ...v, tenant_id: tenantId });
              if (!result.success) {
                toast.error(formatZodError(result.error));
                return;
              }
            }
            await onSubmit(v);
          }}
        >
          {fields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              defaultValue={row?.[f.key] ?? f.defaultValue ?? ""}
              onChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))}
              disabled={!canWrite}
            />
          ))}
          <SheetFooter className="px-0">
            <Button type="submit" disabled={!canWrite || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {row ? "Save changes" : "Create"}
            </Button>
            {postAction && row && (!postAction.showWhen || postAction.showWhen(row)) && onPost && (
              <Button type="button" variant="secondary" onClick={onPost} disabled={postBusy}>
                {postBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {postAction.label}
              </Button>
            )}
          </SheetFooter>
        </form>

        {attachments && row?.id && (
          <div className="border-t pt-4 px-4 pb-6">
            <AttachmentsPanel entityType={entityType} entityId={row.id} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FieldInput({
  field,
  defaultValue,
  onChange,
  disabled,
}: {
  field: FieldDef;
  defaultValue: any;
  onChange: (v: any) => void;
  disabled?: boolean;
}) {
  const id = `f-${field.key}`;
  const label = (
    <Label htmlFor={id} className="text-sm">
      {field.label}
      {field.required && <span className="text-destructive">*</span>}
    </Label>
  );
  const commonProps = { id, name: field.key, defaultValue: defaultValue ?? "", required: field.required, disabled };

  if (field.type === "textarea")
    return (
      <div className="grid gap-1.5">
        {label}
        <Textarea {...commonProps} onChange={(e) => onChange(e.target.value)} rows={3} />
      </div>
    );
  if (field.type === "number")
    return (
      <div className="grid gap-1.5">
        {label}
        <Input
          type="number"
          step="any"
          {...commonProps}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      </div>
    );
  if (field.type === "date")
    return (
      <div className="grid gap-1.5">
        {label}
        <Input type="date" {...commonProps} onChange={(e) => onChange(e.target.value || null)} />
      </div>
    );
  if (field.type === "select")
    return (
      <div className="grid gap-1.5">
        {label}
        <Select defaultValue={String(defaultValue ?? "")} onValueChange={(v) => onChange(v)} disabled={disabled}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name={field.key} defaultValue={defaultValue ?? ""} />
      </div>
    );
  if (field.type === "fk")
    return <FkField field={field} defaultValue={defaultValue} onChange={onChange} disabled={disabled} />;
  return (
    <div className="grid gap-1.5">
      {label}
      <Input {...commonProps} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FkField({
  field,
  defaultValue,
  onChange,
  disabled,
}: {
  field: FieldDef;
  defaultValue: any;
  onChange: (v: any) => void;
  disabled?: boolean;
}) {
  const { data: opts = [] } = useFkOptions(field.fkTable!, field.fkLabel ?? "name");
  const id = `f-${field.key}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
      </Label>
      <Select defaultValue={defaultValue ?? undefined} onValueChange={(v) => onChange(v)} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {opts.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No options yet</div>}
          {opts.map((o: any) => (
            <SelectItem key={o.id} value={o.id}>
              {o[field.fkLabel ?? "name"]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name={field.key} defaultValue={defaultValue ?? ""} />
    </div>
  );
}
