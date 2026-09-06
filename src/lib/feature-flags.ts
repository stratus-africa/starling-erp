/**
 * Centralized Feature Flag Service & Evaluation Engine
 *
 * Evaluation Hierarchy:
 *   1. Explicit Tenant Override (tenant_feature_flags)
 *   2. Environment Match (all / production / staging / development)
 *   3. Global Flag Enabled state
 *   4. Target Plans (plan-level access)
 *   5. Target Tenants (tenant allowlist)
 *   6. Percentage Rollout (deterministic hash 0–100%)
 *
 * Avoid scattering hard-coded feature switches across React components.
 * Use useFeatureFlag("code") or <FeatureFlagGuard flag="code">.
 */

import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import type { ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureFlag {
  id: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  environment: "all" | "production" | "staging" | "development";
  rollout_percentage: number;
  target_plans: string[];
  target_tenants: string[];
  created_at: string;
  updated_at: string;
  overrides_count?: number;
}

export interface TenantFlagOverride {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  feature: string;
  enabled: boolean;
  reason: string | null;
  updated_at: string;
}

export interface EvaluationContext {
  tenantId?: string;
  userId?: string;
  planCode?: string;
  environment?: string;
}

// ─── Deterministic Hash for Percentage Rollout ────────────────────────────────

/**
 * Fast deterministic string hashing (DJB2/FNV-like) producing 0-99 bucket
 */
function deterministicHashTo100(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % 100;
}

// ─── Pure Evaluation Function (Mirroring DB Logic) ────────────────────────────

export function evaluateFeatureFlag(
  flag: FeatureFlag,
  context: EvaluationContext,
  tenantOverride?: boolean | null
): boolean {
  // 1. Explicit Tenant Override
  if (tenantOverride !== undefined && tenantOverride !== null) {
    return tenantOverride;
  }

  // 2. Environment Match
  const currentEnv = context.environment || (import.meta.env.MODE === "development" ? "development" : "production");
  if (flag.environment !== "all" && flag.environment !== currentEnv) {
    return false;
  }

  // 3. Global Enabled Switch
  if (!flag.enabled) {
    return false;
  }

  // 4. Target Plans (if restricted)
  if (flag.target_plans && flag.target_plans.length > 0) {
    if (!context.planCode || !flag.target_plans.includes(context.planCode)) {
      return false;
    }
  }

  // 5. Target Tenants (if restricted)
  if (flag.target_tenants && flag.target_tenants.length > 0) {
    if (!context.tenantId || !flag.target_tenants.includes(context.tenantId)) {
      return false;
    }
  }

  // 6. Percentage Rollout
  if (flag.rollout_percentage < 100) {
    if (flag.rollout_percentage <= 0) return false;
    const seed = `${flag.code}_${context.tenantId || context.userId || "anonymous"}`;
    const bucket = deterministicHashTo100(seed);
    if (bucket >= flag.rollout_percentage) {
      return false;
    }
  }

  return true;
}

// ─── Core Service Functions ───────────────────────────────────────────────────

/**
 * Check if a single feature flag is enabled via server-side RPC or client evaluation
 */
export async function isFeatureEnabled(
  flagCode: string,
  context?: EvaluationContext
): Promise<boolean> {
  if (!flagCode) return false;
  try {
    const { data, error } = await db.rpc("evaluate_feature_flag", {
      _flag_code: flagCode,
      _tenant_id: context?.tenantId || null,
      _user_id: context?.userId || null,
      _env: context?.environment || "production",
    });
    if (error) throw error;
    return Boolean(data);
  } catch (err) {
    console.error(`[FeatureFlags] isFeatureEnabled error for ${flagCode}:`, err);
    return false;
  }
}

/**
 * Batch fetch all evaluated feature flags for a tenant/user context
 */
export async function getAllEvaluatedFlags(
  context?: EvaluationContext
): Promise<Record<string, boolean>> {
  try {
    const { data, error } = await db.rpc("get_all_evaluated_feature_flags", {
      _tenant_id: context?.tenantId || null,
      _user_id: context?.userId || null,
      _env: context?.environment || "production",
    });
    if (error) throw error;
    return (data as Record<string, boolean>) || {};
  } catch (err) {
    console.error("[FeatureFlags] getAllEvaluatedFlags error:", err);
    return {};
  }
}

// ─── React Hooks ──────────────────────────────────────────────────────────────

/**
 * Hook to evaluate a single feature flag in the current tenant/user context
 */
export function useFeatureFlag(flagCode: string, fallback = false): boolean {
  const { tenant, session } = useAuth();
  const tenantId = tenant?.id;
  const userId = session?.user?.id;

  const { data: evaluatedFlags } = useQuery({
    queryKey: ["feature-flags-evaluated", tenantId, userId],
    queryFn: () => getAllEvaluatedFlags({ tenantId, userId }),
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  if (!evaluatedFlags) return fallback;
  return evaluatedFlags[flagCode] ?? fallback;
}

/**
 * Hook to access all evaluated feature flags
 */
export function useFeatureFlags() {
  const { tenant, session } = useAuth();
  const tenantId = tenant?.id;
  const userId = session?.user?.id;

  const { data: flags = {}, isLoading, isError, refetch } = useQuery({
    queryKey: ["feature-flags-evaluated", tenantId, userId],
    queryFn: () => getAllEvaluatedFlags({ tenantId, userId }),
    staleTime: 1000 * 60 * 5,
  });

  const isEnabled = (flagCode: string, defaultVal = false): boolean => {
    return flags[flagCode] ?? defaultVal;
  };

  return {
    flags,
    isEnabled,
    loading: isLoading,
    isError,
    refetch,
  };
}

// ─── Declarative Guard Component ──────────────────────────────────────────────

interface FeatureFlagGuardProps {
  flag: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function FeatureFlagGuard({
  flag,
  fallback = null,
  children,
}: FeatureFlagGuardProps) {
  const isEnabled = useFeatureFlag(flag);

  if (!isEnabled) {
    return fallback as any;
  }

  return children as any;
}
