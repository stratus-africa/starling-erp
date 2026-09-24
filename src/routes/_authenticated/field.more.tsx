import { createFileRoute, Link } from "@tanstack/react-router";
import { Target, BarChart3, Bell, RefreshCw, LogOut, Monitor, Trash2, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { FieldHeader, SyncBadge, useFieldAccess } from "@/components/field/field-ui";
import { useOutbox, syncAll, removeItem, clearSynced, process } from "@/lib/field-sync";
import { TenantSwitcher } from "@/components/tenant-switcher";

export const Route = createFileRoute("/_authenticated/field/more")({
  head: () => ({ meta: [{ title: "More — Field Sales" }] }),
  component: More,
});

function More() {
  const a = useFieldAccess();
  const { signOut, roles, tenant, profile } = useAuth();
  const outbox = useOutbox();
  const fieldOnly = roles.length > 0 && roles.every((r) => r === "field_sales");
  const link = "flex h-14 items-center gap-3 border-b px-4 active:bg-muted";
  return (
    <div>
      <FieldHeader title="More" />
      <div className="border-b px-4 py-4">
        <div className="font-medium">{profile?.full_name ?? profile?.email}</div>
        <div className="text-xs text-muted-foreground">{tenant?.name}</div>
        <div className="mt-3"><TenantSwitcher /></div>
      </div>
      {a.leads && <Link to="/field/leads" className={link}><Target className="h-5 w-5 text-primary" /><span className="flex-1">Leads</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>}
      <Link to="/field/dashboard" className={link}><BarChart3 className="h-5 w-5 text-primary" /><span className="flex-1">My performance</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>
      <Link to="/field/notifications" className={link}><Bell className="h-5 w-5 text-primary" /><span className="flex-1">Notifications</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>
      {!fieldOnly && <Link to="/" className={link}><Monitor className="h-5 w-5 text-primary" /><span className="flex-1">Open office app</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>}

      <section className="pt-6">
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Sync queue</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => syncAll()}><RefreshCw className="mr-1 h-4 w-4" />Retry all</Button>
            <Button size="sm" variant="ghost" onClick={clearSynced}>Clear synced</Button>
          </div>
        </div>
        {outbox.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">Nothing waiting. Everything is synced.</p> : [...outbox].reverse().map((o) => (
          <div key={o.id} className="flex min-h-16 items-center gap-3 border-b px-4 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{o.label}</div>
              <div className="truncate text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString()}{o.error && o.status !== "synced" ? ` · ${o.error}` : ""}</div>
            </div>
            <SyncBadge status={o.status} />
            {o.status === "failed" && <Button size="icon" variant="ghost" aria-label="Retry" onClick={() => process(o.id)}><RefreshCw className="h-4 w-4" /></Button>}
            {o.status === "failed" && <Button size="icon" variant="ghost" aria-label="Discard" onClick={() => { if (confirm("Discard this unsynced record? It will be lost.")) removeItem(o.id); }}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        ))}
      </section>

      <div className="p-4 pt-8"><Button variant="outline" className="h-12 w-full text-base" onClick={signOut}><LogOut className="mr-2 h-5 w-5" />Sign out</Button></div>
    </div>
  );
}
