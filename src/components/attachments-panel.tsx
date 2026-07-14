import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Paperclip, Upload, X, Download, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function AttachmentsPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["attachments", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("attachments").select("*")
        .eq("entity_type", entityType).eq("entity_id", entityId)
        .is("deleted_at", null).order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!entityId,
  });

  const upload = async (file: File) => {
    if (!tenant?.id) return;
    setUploading(true);
    try {
      const path = `${tenant.id}/${entityType}/${entityId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("attachments").insert({
        tenant_id: tenant.id, entity_type: entityType, entity_id: entityId,
        file_path: path, file_name: file.name, size_bytes: file.size, mime_type: file.type,
      });
      if (insErr) throw insErr;
      toast.success("Attached");
      refetch();
    } catch (e: any) { toast.error(e.message ?? "Upload failed"); }
    finally { setUploading(false); }
  };

  const remove = async (row: any) => {
    await supabase.storage.from("attachments").remove([row.file_path]);
    await supabase.from("attachments").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    refetch();
    qc.invalidateQueries({ queryKey: ["attachments"] });
  };

  const download = async (row: any) => {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(row.file_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium"><Paperclip className="h-4 w-4" /> Attachments <span className="text-muted-foreground font-normal">({rows.length})</span></div>
        <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />} Upload
        </Button>
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-md">No attachments yet</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r: any) => (
            <li key={r.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm bg-muted/20">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{r.file_name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{Math.round((r.size_bytes ?? 0) / 1024)} KB</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => download(r)}><Download className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => remove(r)}><X className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
