import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/typed-db";

export interface CustomRole { id: string; role_key: string; label: string; description: string | null }

export function CustomRolesManager({ roles, builtIn, onChanged }: {
  roles: CustomRole[];
  builtIn: { role: string; label: string }[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CustomRole | "new" | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [copyFrom, setCopyFrom] = useState("");

  const open = (role: CustomRole | "new") => {
    setEditing(role);
    setLabel(role === "new" ? "" : role.label);
    setDescription(role === "new" ? "" : role.description ?? "");
    setCopyFrom("");
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("save_custom_role", {
        _id: editing === "new" ? null : editing?.id,
        _label: label,
        _description: description,
        _copy_from: editing === "new" && copyFrom ? copyFrom : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(editing === "new" ? "Role created" : "Role updated"); setEditing(null); onChanged(); },
    onError: (e: Error) => toast.error(e.message || "Could not save role"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("delete_custom_role", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role deleted"); onChanged(); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message || "Could not delete role"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Custom roles</h2>
          <p className="text-xs text-muted-foreground">Create roles for this workspace, then tick their permissions in the matrix tabs.</p>
        </div>
        <Button size="sm" onClick={() => open("new")}><Plus className="mr-1.5 h-4 w-4" /> New role</Button>
      </div>
      {roles.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No custom roles yet.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <div key={role.id} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full border bg-primary/5 px-2.5 py-0.5 text-[11px] font-semibold text-primary">Custom</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit ${role.label}`} onClick={() => open(role)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Delete ${role.label}`} disabled={remove.isPending}
                    onClick={() => { if (confirm(`Delete role "${role.label}"? Users lose its access.`)) remove.mutate(role.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <h3 className="text-sm font-semibold">{role.label}</h3>
              <p className="text-xs text-muted-foreground">{role.description || "No description"}</p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === "new" ? "New role" : "Edit role"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Warehouse Supervisor" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
            {editing === "new" && (
              <div className="space-y-1.5">
                <Label>Start with permissions from</Label>
                <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">No permissions (blank)</option>
                  {builtIn.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={!label.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
