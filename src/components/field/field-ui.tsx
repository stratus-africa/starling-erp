import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Home, Users, FileText, Wallet, Menu, WifiOff, Search, Plus, Loader2, Lock, RefreshCw, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useOutbox, statusLabel, syncAll, type SyncStatus } from "@/lib/field-sync";
import { formatMoney, dbMinor } from "@/lib/field-money";

export const FP = {
  customersView: "crm.read",
  customersCreate: "crm.create",
  customersEdit: "crm.update",
  leadsView: "crm.read",
  leadsCreate: "crm.create",
  leadsEdit: "crm.update",
  salesView: "sales.read",
  salesCreate: "sales.create",
  salesEdit: "sales.update",
  paymentsView: "payments.read",
  paymentsCreate: "payments.create",
} as const;

export function useFieldAccess() {
  const { can, hasFeature } = useAuth();
  const crm = hasFeature("crm");
  return {
    crm,
    customers: can(FP.customersView),
    customersCreate: can(FP.customersCreate),
    customersEdit: can(FP.customersEdit),
    leads: crm && can(FP.leadsView),
    leadsCreate: crm && can(FP.leadsCreate),
    leadsEdit: crm && can(FP.leadsEdit),
    sales: can(FP.salesView),
    salesCreate: can(FP.salesCreate),
    salesEdit: can(FP.salesEdit),
    payments: can(FP.paymentsView),
    paymentsCreate: can(FP.paymentsCreate),
    invoices: can("sales.read"),
  };
}

function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const u = () => setOn(navigator.onLine);
    u();
    window.addEventListener("online", u);
    window.addEventListener("offline", u);
    return () => { window.removeEventListener("online", u); window.removeEventListener("offline", u); };
  }, []);
  return on;
}

export function FieldShell({ children }: { children: ReactNode }) {
  const online = useOnline();
  const outbox = useOutbox();
  const pending = outbox.filter((i) => i.status !== "synced").length;
  const syncedCount = outbox.filter((i) => i.status === "synced").length;
  const qc = useQueryClient();
  // Refresh lists once queued items reach the server
  useEffect(() => { if (syncedCount > 0) void qc.invalidateQueries(); }, [syncedCount, qc]);
  const access = useFieldAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  // Download every Field Sales screen while online, so they still open with no signal
  useEffect(() => {
    if (!navigator.onLine) return;
    const paths = ["/field", "/field/customers", "/field/customers/new", "/field/sales", "/field/sales/new", "/field/payments", "/field/payments/new", "/field/more", "/field/leads", "/field/notifications", "/field/dashboard"];
    for (const to of paths) {
      for (const m of router.matchRoutes(to, {})) {
        const route = router.looseRoutesById[m.routeId];
        if (route) void Promise.resolve(router.loadRouteChunk(route)).catch(() => {});
      }
    }
  }, [router]);
  const tabs = [
    { to: "/field", label: "Home", icon: Home, show: true, exact: true },
    { to: "/field/customers", label: "Customers", icon: Users, show: access.customers },
    { to: "/field/sales", label: "Sales", icon: FileText, show: access.sales },
    { to: "/field/payments", label: "Payments", icon: Wallet, show: access.payments },
    { to: "/field/more", label: "More", icon: Menu, show: true },
  ].filter((t) => t.show);
  return (
    <div className="h-[100dvh] overflow-hidden bg-muted/30">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden bg-background md:border-x">
        {!online && (
          <div className="flex shrink-0 items-center gap-2 bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground">
            <WifiOff className="h-4 w-4" /> You're offline. New records are saved on this phone and sent when you reconnect.
          </div>
        )}
        {online && pending > 0 && (
          <Button variant="ghost" onClick={() => syncAll()} className="h-auto shrink-0 justify-start rounded-none bg-accent px-4 py-2 text-left text-xs font-medium text-accent-foreground hover:bg-accent/80">
            <RefreshCw className="h-4 w-4" /> {pending} record{pending > 1 ? "s" : ""} waiting to sync — tap to retry
          </Button>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-muted/30">{children}</main>
        <div className="relative z-40 shrink-0 bg-background px-3 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <nav aria-label="Field Sales">
          <div className="mx-auto grid max-w-md rounded-[1.75rem] border border-border/60 bg-card px-2 py-2 shadow-lg" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
            {tabs.map((t) => {
              const active = t.exact ? pathname === t.to || pathname === t.to + "/" : pathname.startsWith(t.to);
              const Icon = t.icon;
              return (
                <Link key={t.to} to={t.to as never} aria-current={active ? "page" : undefined} className="group flex min-w-0 flex-col items-center justify-end gap-0.5 px-1 pt-1 min-h-14">
                  <span className={cn("flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200", active ? "-translate-y-3 bg-primary text-primary-foreground shadow-lg ring-4 ring-background" : "text-muted-foreground group-active:bg-muted")}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className={cn("w-full truncate text-center text-[11px] leading-none transition-colors", active ? "-mt-2 font-semibold text-primary" : "font-medium text-muted-foreground")}>
                    {t.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
        </div>
      </div>
    </div>
  );
}

export function FieldHeader({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-2 backdrop-blur">
      {back ? (
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Back" onClick={() => (window.history.length > 1 ? window.history.back() : nav({ to: back as never }))}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      ) : <div className="w-2" />}
      <h1 className="flex-1 truncate text-base font-semibold">{title}</h1>
      {right}
    </header>
  );
}

export function NotificationBell() {
  const { user } = useAuth();
  const { data = 0 } = useQuery({
    queryKey: ["notifications", "unread", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user!.id).is("read_at", null);
      return count ?? 0;
    },
  });
  return (
    <Link to="/field/notifications" aria-label="Notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted">
      <Bell className="h-5 w-5" />
      {data > 0 && <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{data > 9 ? "9+" : data}</span>}
    </Link>
  );
}

export function StickyFooter({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-30 mt-4 flex gap-2 border-t bg-background/95 p-3 backdrop-blur">{children}</div>;
}

export function Fab({ to, search, label }: { to: string; search?: Record<string, string>; label: string }) {
  return (
    <Link to={to as never} search={search as never} aria-label={label} className="fixed bottom-28 right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg md:right-[calc(50%-20rem)]">
      <Plus className="h-5 w-5" /> {label}
    </Link>
  );
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-12 pl-9 text-base" type="search" />
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cn("h-9 shrink-0 rounded-full border px-4 text-sm", value === o.value ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Loading() {
  return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
}
export function Empty({ text }: { text: string }) {
  return <div className="px-6 py-16 text-center text-sm text-muted-foreground">{text}</div>;
}
export function ErrorBox({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="font-medium">Couldn't load this.</p>
      <p className="mt-1 text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</p>
      <Button variant="outline" className="mt-3 h-11" onClick={retry}>Retry</Button>
    </div>
  );
}
export function NoAccess({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
      <Lock className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">No access to {what}</p>
      <p className="text-sm text-muted-foreground">Ask your administrator to grant this in Roles & Permissions.</p>
      <Link to="/field" className="mt-2 text-sm font-medium text-primary">Back to Home</Link>
    </div>
  );
}

export function SyncBadge({ status }: { status: SyncStatus }) {
  const cls: Record<SyncStatus, string> = {
    saved_offline: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    pending: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    syncing: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    synced: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    failed: "bg-destructive/15 text-destructive",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", cls[status])}>{statusLabel[status]}</span>;
}

export function StatusPill({ status }: { status?: string | null }) {
  const s = (status ?? "Draft").toLowerCase();
  const tone = ["accepted", "paid", "posted", "delivered", "closed", "converted", "active", "qualified", "confirmed"].includes(s)
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : ["rejected", "cancelled", "expired", "lost", "inactive", "void", "voided", "unqualified"].includes(s)
      ? "bg-destructive/10 text-destructive"
      : s === "draft" ? "bg-muted text-muted-foreground" : "bg-blue-500/15 text-blue-700 dark:text-blue-300";
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}>{status ?? "Draft"}</span>;
}

export function Row({ to, params, title, subtitle, right, meta }: { to: string; params?: Record<string, string>; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; meta?: ReactNode }) {
  return (
    <Link to={to as never} params={params as never} className="flex min-h-16 items-center gap-3 border-b px-4 py-3 active:bg-muted">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right text-sm">{right}{meta}</div>
    </Link>
  );
}

export type CustomerLite = { id: string; name: string; phone: string | null; email: string | null; code: string | null; currency: string | null; balance: number | null };

export function useCustomers() {
  return useQuery({
    queryKey: ["customers", "field-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,phone,email,code,currency,balance,status,created_at,tax_id").is("deleted_at", null).order("name").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Search-first customer selector in a bottom sheet. */
export function CustomerPicker({ value, onChange, allowCreate }: { value: string; onChange: (c: CustomerLite) => void; allowCreate?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useCustomers();
  const selected = data.find((c) => c.id === value);
  const list = useMemo(() => {
    const s = q.toLowerCase();
    return data.filter((c) => !s || [c.name, c.phone, c.email, c.code].some((f) => f?.toLowerCase().includes(s))).slice(0, 60);
  }, [data, q]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 w-full items-center justify-between rounded-lg border bg-background px-4 text-left">
        {selected ? (
          <div className="min-w-0"><div className="truncate font-medium">{selected.name}</div><div className="truncate text-xs text-muted-foreground">{selected.phone ?? selected.email ?? selected.code}</div></div>
        ) : <span className="text-muted-foreground">Tap to choose a customer</span>}
        <Search className="h-4 w-4 text-muted-foreground" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85dvh] p-0">
          <SheetHeader className="border-b p-4"><SheetTitle>Choose customer</SheetTitle></SheetHeader>
          <div className="space-y-2 p-4">
            <SearchBar value={q} onChange={setQ} placeholder="Name, phone, email or code" />
            {allowCreate && <Link to="/field/customers/new" className="flex h-11 items-center gap-2 text-sm font-medium text-primary"><Plus className="h-4 w-4" /> New customer</Link>}
          </div>
          <div className="h-[calc(85dvh-150px)] overflow-y-auto">
            {isLoading ? <Loading /> : list.length === 0 ? <Empty text="No customers match." /> : list.map((c) => (
              <button key={c.id} onClick={() => { onChange(c as CustomerLite); setOpen(false); }} className="flex min-h-14 w-full items-center gap-3 border-b px-4 py-2 text-left active:bg-muted">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{c.name}</div><div className="truncate text-xs text-muted-foreground">{[c.code, c.phone].filter(Boolean).join(" · ")}</div></div>
                {c.id === value && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export const money = (v: unknown, cur?: string | null) => formatMoney(dbMinor(v), cur || "KES");
export { Badge };
