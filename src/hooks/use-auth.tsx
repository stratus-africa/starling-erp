import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { Permission } from "@/lib/permissions";
import type { AppRole } from "@/lib/db-types";

export type Profile = import("@/integrations/supabase/types").Tables<"profiles">;
export type Tenant = import("@/integrations/supabase/types").Tables<"tenants">;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  tenant: Tenant | null;
  roles: AppRole[];
  permissions: string[];
  loading: boolean;
  hasRole: (r: AppRole | AppRole[]) => boolean;
  can: (permission: Permission | string | Array<Permission | string>) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();

  const loadContext = async (uid: string) => {
    const [{ data: prof }, { data: rls }, { data: perms }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.rpc("get_my_permissions"),
    ]);
    setProfile(prof);
    setRoles((rls ?? []).map((r) => r.role));
    setPermissions((perms ?? []) as string[]);
    if (prof?.tenant_id) {
      const { data: t } = await supabase.from("tenants").select("*").eq("id", prof.tenant_id).maybeSingle();
      setTenant(t);
    } else setTenant(null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED" && event !== "INITIAL_SESSION")
        return;
      if (s?.user) {
        setTimeout(() => loadContext(s.user.id), 0);
      } else {
        setProfile(null);
        setTenant(null);
        setRoles([]);
        setPermissions([]);
      }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") router.invalidate();
      if (event !== "SIGNED_OUT" && s?.user) qc.invalidateQueries();
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadContext(data.session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasRole = (r: AppRole | AppRole[]) => {
    const arr = Array.isArray(r) ? r : [r];
    if (roles.includes("super_admin") || roles.includes("tenant_admin")) return true;
    return arr.some((x) => roles.includes(x));
  };

  const can = (permission: Permission | string | Array<Permission | string>) => {
    const required = Array.isArray(permission) ? permission : [permission];
    if (roles.includes("super_admin") || roles.includes("tenant_admin")) return true;
    return required.some((p) => permissions.includes(p));
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const refresh = async () => {
    if (session?.user) await loadContext(session.user.id);
  };

  const switchTenant = async (tenantId: string) => {
    const { error } = await supabase.rpc("switch_tenant", { target_tenant: tenantId });
    if (error) throw error;
    await qc.cancelQueries();
    qc.clear();
    if (session?.user) await loadContext(session.user.id);
    router.invalidate();
  };

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        tenant,
        roles,
        permissions,
        loading,
        hasRole,
        can,
        signOut,
        refresh,
        switchTenant,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
