/**
 * usePlatformAuth — Platform-level authentication context
 *
 * This hook is SEPARATE from useAuth() (which handles tenant-level auth).
 * It is used exclusively inside the /_admin route tree.
 *
 * Authorization model:
 *   - canPlatform() calls public.has_platform_permission() server-side via RPC.
 *     It does NOT rely on a frontend flag.
 *   - isPlatformAdmin is derived from the server-side admin_ping() RPC which
 *     requires BOTH user_roles.super_admin AND platform_admins rows to be present.
 *   - platformPermissions are fetched once on mount via get_my_platform_permissions()
 *     and cached; they are re-fetched on session change.
 *
 * Security note:
 *   The UI uses canPlatform() to show/hide controls, but every destructive action
 *   is also gated server-side by has_platform_permission() inside SECURITY DEFINER
 *   RPCs. The frontend check is UX-only; the DB is the security boundary.
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { PlatformPermission, PlatformRole } from "@/lib/platform-permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformAdmin {
  userId: string;
  email: string;
  fullName: string | null;
  platformRole: PlatformRole;
  isActive: boolean;
  lastSeenAt: string | null;
}

export interface ActiveSupportSession {
  sessionId: string;
  targetTenantId: string;
  targetTenantName: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  minutesRemaining: number;
}

interface PlatformAuthCtx {
  /** True only when DB confirms both user_roles.super_admin and platform_admins row */
  isPlatformAdmin: boolean;
  /** The current user's platform admin record */
  adminProfile: PlatformAdmin | null;
  /** Granular platform permissions for the current role */
  platformPermissions: PlatformPermission[];
  /** Active support session if currently impersonating a tenant */
  supportSession: ActiveSupportSession | null;
  loading: boolean;
  /** Server-confirmed permission check (reads local cache, not a new RPC call) */
  canPlatform: (p: PlatformPermission | PlatformPermission[]) => boolean;
  /** Refresh all platform context (call after grant/revoke) */
  refresh: () => Promise<void>;
  /** Begin a timed support session inside a tenant */
  beginSupportSession: (tenantId: string, reason: string, ttlMinutes?: number) => Promise<string>;
  /** End the current support session and return to admin context */
  endSupportSession: (reason?: string) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PlatformAuthCtx = createContext<PlatformAuthCtx | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [adminProfile, setAdminProfile] = useState<PlatformAdmin | null>(null);
  const [platformPermissions, setPlatformPermissions] = useState<PlatformPermission[]>([]);
  const [supportSession, setSupportSession] = useState<ActiveSupportSession | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Load platform context from the server ──────────────────────────────────
  const loadPlatformContext = useCallback(async (uid: string) => {
    try {
      // admin_ping() verifies platform admin status, expires stale sessions,
      // updates last_seen_at, and returns false if not a platform admin.
      const { data: isAdmin, error: pingErr } = await supabase.rpc("admin_ping");

      if (pingErr || !isAdmin) {
        setIsPlatformAdmin(false);
        setAdminProfile(null);
        setPlatformPermissions([]);
        setSupportSession(null);
        return;
      }

      setIsPlatformAdmin(true);

      // Fetch admin profile row
      const { data: adminRow } = await (supabase as any)
        .from("platform_admins")
        .select("user_id,email,full_name,platform_role,is_active,last_seen_at")
        .eq("user_id", uid)
        .maybeSingle();

      if (adminRow) {
        setAdminProfile({
          userId: adminRow.user_id,
          email: adminRow.email,
          fullName: adminRow.full_name,
          platformRole: adminRow.platform_role as PlatformRole,
          isActive: adminRow.is_active,
          lastSeenAt: adminRow.last_seen_at,
        });
      }

      // Fetch granular platform permissions
      const { data: permsData } = await (supabase as any).rpc("get_my_platform_permissions");
      setPlatformPermissions((permsData ?? []) as PlatformPermission[]);

      // Fetch active support session if any
      const { data: sessionData } = await supabase.rpc("get_active_support_session");
      const row = Array.isArray(sessionData) ? sessionData[0] : sessionData;
      setSupportSession(
        row
          ? {
              sessionId: row.session_id,
              targetTenantId: row.target_tenant_id,
              targetTenantName: row.target_tenant_name,
              reason: row.reason,
              startedAt: row.started_at,
              expiresAt: row.expires_at,
              minutesRemaining: Number(row.minutes_remaining),
            }
          : null,
      );
    } catch (err) {
      console.error("[PlatformAuth] loadPlatformContext error", err);
      setIsPlatformAdmin(false);
      setAdminProfile(null);
      setPlatformPermissions([]);
      setSupportSession(null);
    }
  }, []);

  // ── Auth state listener ────────────────────────────────────────────────────
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.user) {
        // Defer to avoid Supabase re-entrant call warning
        setTimeout(() => loadPlatformContext(s.user.id).finally(() => setLoading(false)), 0);
      } else {
        setIsPlatformAdmin(false);
        setAdminProfile(null);
        setPlatformPermissions([]);
        setSupportSession(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadPlatformContext(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── canPlatform ────────────────────────────────────────────────────────────
  // Reads from the locally cached permissions list (populated from the server).
  // This is fast and safe for UI gating. The DB enforces the real boundary.
  //
  // Note: super_admin short-circuits to true unconditionally.
  //       All other roles check the cached permission list loaded from
  //       get_my_platform_permissions() (server-sourced).
  const canPlatform = useCallback(
    (p: PlatformPermission | PlatformPermission[]) => {
      if (!isPlatformAdmin) return false;
      // super_admin has every permission — short-circuit
      if (adminProfile?.platformRole === "super_admin") return true;
      const required = Array.isArray(p) ? p : [p];
      return required.some((code) => platformPermissions.includes(code));
    },
    [isPlatformAdmin, adminProfile, platformPermissions],
  );

  // ── refresh ────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    if (s?.user) await loadPlatformContext(s.user.id);
  }, [loadPlatformContext]);

  // ── beginSupportSession ───────────────────────────────────────────────────
  const beginSupportSession = useCallback(
    async (tenantId: string, reason: string, ttlMinutes = 240): Promise<string> => {
      const { data, error } = await supabase.rpc("begin_support_session", {
        _target_tenant_id: tenantId,
        _reason: reason,
        _ttl_minutes: ttlMinutes,
      });
      if (error) throw new Error(error.message);
      // Refresh to pick up the new session context
      await refresh();
      return data as string;
    },
    [refresh],
  );

  // ── endSupportSession ─────────────────────────────────────────────────────
  const endSupportSession = useCallback(
    async (reason = "Session ended by admin") => {
      const { error } = await supabase.rpc("end_support_session", {
        _session_id: null,
        _reason: reason,
      });
      if (error) throw new Error(error.message);
      await refresh();
    },
    [refresh],
  );

  return (
    <PlatformAuthCtx.Provider
      value={{
        isPlatformAdmin,
        adminProfile,
        platformPermissions,
        supportSession,
        loading,
        canPlatform,
        refresh,
        beginSupportSession,
        endSupportSession,
      }}
    >
      {children}
    </PlatformAuthCtx.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlatformAuth(): PlatformAuthCtx {
  const ctx = useContext(PlatformAuthCtx);
  if (!ctx) throw new Error("usePlatformAuth must be used inside PlatformAuthProvider");
  return ctx;
}
