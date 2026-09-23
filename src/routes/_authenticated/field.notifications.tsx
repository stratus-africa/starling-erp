import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { FieldHeader, Loading, Empty, ErrorBox } from "@/components/field/field-ui";

export const Route = createFileRoute("/_authenticated/field/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Field Sales" }] }),
  component: Notifications,
});

function Notifications() {
  const { user, tenant } = useAuth();
  const qc = useQueryClient();
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ["notifications", "field", user?.id, tenant?.id], enabled: !!user && !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").eq("user_id", user!.id).eq("tenant_id", tenant!.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const markAll = async () => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user!.id).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  return (
    <div>
      <FieldHeader title="Notifications" back="/field" right={<Button variant="ghost" size="sm" onClick={markAll}>Mark all read</Button>} />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} retry={refetch} /> : data.length === 0 ? <Empty text="No notifications." /> : data.map((n) => (
        <div key={n.id} className={`border-b px-4 py-3 ${n.read_at ? "" : "bg-primary/5"}`}>
          <div className="flex justify-between gap-2"><span className="text-sm font-medium">{n.title}</span><span className="shrink-0 text-[11px] text-muted-foreground">{new Date(n.created_at!).toLocaleString()}</span></div>
          <p className="text-sm text-muted-foreground">{n.message}</p>
        </div>
      ))}
    </div>
  );
}
