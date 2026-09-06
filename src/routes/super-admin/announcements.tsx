/**
 * Super Admin � Platform Announcements
 * Route: /super-admin/announcements
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Megaphone, Plus, RefreshCw, Loader2, AlertCircle, MoreHorizontal,
  Pencil, Trash2, CheckCircle2, XCircle,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/announcements")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.announcementsView}>
      <AnnouncementsPage />
    </PermissionGuard>
  ),
});

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_plans: string[];
  created_at: string;
  updated_at: string;
}

const TYPE_BADGE: Record<string, string> = {
  info:        "bg-blue-500/10 text-blue-700 border-blue-500/20",
  warning:     "bg-amber-500/10 text-amber-700 border-amber-500/20",
  success:     "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  critical:    "bg-red-500/10 text-red-700 border-red-500/20",
  maintenance: "bg-violet-500/10 text-violet-700 border-violet-500/20",
};

const TYPES = ["info", "warning", "success", "critical", "maintenance"] as const;

const dateFmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "�";

const EMPTY: Partial<Announcement> = {
  title: "", body: "", type: "info", is_active: true, starts_at: null, ends_at: null, target_plans: [],
};

function AnnouncementsPage() {
  const { canPlatform } = usePlatformAuth();
  const qc = useQueryClient();
  const canManage = canPlatform("platform.announcements.manage");

  const [dialog, setDialog] = useState<{ open: boolean; editing: Partial<Announcement> | null }>({
    open: false, editing: null,
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["platform_announcements", refreshKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (form: Partial<Announcement>) => {
      if (form.id) {
        const { error } = await (supabase as any).rpc("admin_update_announcement", {
          _id: form.id, _title: form.title, _body: form.body, _type: form.type,
          _is_active: form.is_active, _starts_at: form.starts_at || null, _ends_at: form.ends_at || null,
          _target_plans: form.target_plans ?? [],
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).rpc("admin_create_announcement", {
          _title: form.title, _body: form.body, _type: form.type,
          _is_active: form.is_active, _starts_at: form.starts_at || null, _ends_at: form.ends_at || null,
          _target_plans: form.target_plans ?? [],
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(dialog.editing?.id ? "Announcement updated" : "Announcement created");
      setDialog({ open: false, editing: null });
      qc.invalidateQueries({ queryKey: ["platform_announcements"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("admin_delete_announcement", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement deleted");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["platform_announcements"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => setDialog({ open: true, editing: { ...EMPTY } });
  const openEdit = (a: Announcement) => setDialog({ open: true, editing: { ...a } });
  const setField = (k: string, v: any) =>
    setDialog((d) => ({ ...d, editing: { ...d.editing, [k]: v } }));

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground">Platform-wide announcements broadcast to all tenants.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />New Announcement
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead>Plans</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No announcements yet. Create one to broadcast to all tenants.
                  </TableCell>
                </TableRow>
              ) : items.map((ann) => (
                <TableRow key={ann.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{ann.title}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{ann.body}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs capitalize ${TYPE_BADGE[ann.type] ?? ""}`}>
                      {ann.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {ann.is_active
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{dateFmt(ann.starts_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{dateFmt(ann.ends_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {ann.target_plans?.length ? ann.target_plans.join(", ") : "All"}
                  </TableCell>
                  <TableCell>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(ann)}>
                            <Pencil className="h-4 w-4 mr-2" />Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(ann.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialog.open} onOpenChange={(v) => !v && setDialog({ open: false, editing: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog.editing?.id ? "Edit Announcement" : "New Announcement"}</DialogTitle>
            <DialogDescription>Broadcast a message to all tenants on the platform.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={dialog.editing?.title ?? ""} onChange={(e) => setField("title", e.target.value)} placeholder="Announcement title..." />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea value={dialog.editing?.body ?? ""} onChange={(e) => setField("body", e.target.value)} rows={4} placeholder="Announcement body..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={dialog.editing?.type ?? "info"} onValueChange={(v) => setField("type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <Switch checked={dialog.editing?.is_active ?? true} onCheckedChange={(v) => setField("is_active", v)} />
                <Label>Active</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Starts At (optional)</Label>
                <Input type="date" value={dialog.editing?.starts_at ? dialog.editing.starts_at.slice(0, 10) : ""} onChange={(e) => setField("starts_at", e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ends At (optional)</Label>
                <Input type="date" value={dialog.editing?.ends_at ? dialog.editing.ends_at.slice(0, 10) : ""} onChange={(e) => setField("ends_at", e.target.value || null)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, editing: null })}>Cancel</Button>
            <Button
              disabled={saveMutation.isPending || !dialog.editing?.title || !dialog.editing?.body}
              onClick={() => saveMutation.mutate(dialog.editing!)}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {dialog.editing?.id ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Announcement?</DialogTitle>
            <DialogDescription>This will permanently delete the announcement. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
