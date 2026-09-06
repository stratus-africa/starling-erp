/**
 * Centralized Entitlements and Feature Access Service
 *
 * Architecture:
 *   Plan → Features → Entitlements
 *   Tenant → Subscription → Plan → Entitlements
 *
 * This module eliminates hard-coded subscription checks across components.
 * Use canTenantUseFeature(), getTenantLimit(), or the useEntitlements() hook.
 */

import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import type { ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeatureType = "boolean" | "numeric_limit" | "metered" | "text";
export type FeatureCategory = "limits" | "modules" | "integrations" | "core" | "security";

export interface Feature {
  id: string;
  name: string;
  code: string;
  description: string | null;
  type: FeatureType;
  category: FeatureCategory;
  unit: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  name: string;
  code: string;
  description: string | null;
  price_usd: number;
  billing_interval: string;
  currency: string;
  trial_days: number;
  max_users: number | null;
  max_storage_gb: number | null;
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  active_subscriptions_count?: number;
}

export interface PlanEntitlement {
  id?: string;
  plan_id: string;
  feature_id: string;
  feature_code: string;
  feature_name: string;
  feature_type: FeatureType;
  feature_category: FeatureCategory;
  enabled: boolean;
  limit_value: number | null;
  config?: Record<string, unknown>;
}

export interface TenantEntitlementItem {
  code: string;
  name: string;
  type: FeatureType;
  category: FeatureCategory;
  unit: string | null;
  enabled: boolean;
  limit: number | null;
  unlimited: boolean;
}

export interface TenantEntitlementsPayload {
  tenant_id: string;
  subscription: {
    id: string;
    status: string;
    trial_ends_at: string | null;
    current_period_start: string;
    current_period_end: string | null;
  } | null;
  plan: {
    id: string;
    name: string;
    code: string;
    price_usd: number;
    billing_interval: string;
  };
  entitlements: Record<string, TenantEntitlementItem>;
}

// ─── Direct Core Service Functions ────────────────────────────────────────────

/**
 * Checks if a tenant is authorized to use a given feature.
 */
export async function canTenantUseFeature(tenantId: string, featureCode: string): Promise<boolean> {
  if (!tenantId || !featureCode) return false;
  try {
    const { data, error } = await db.rpc("can_tenant_use_feature", {
      _tenant_id: tenantId,
      _feature_code: featureCode,
    });
    if (error) throw error;
    return Boolean(data);
  } catch (err) {
    console.error(`[Entitlements] canTenantUseFeature error for ${featureCode}:`, err);
    return false;
  }
}

/**
 * Returns numeric limit for a tenant feature. Returns NULL if unlimited. Returns 0 if disabled.
 */
export async function getTenantLimit(tenantId: string, featureCode: string): Promise<number | null> {
  if (!tenantId || !featureCode) return 0;
  try {
    const { data, error } = await db.rpc("get_tenant_limit", {
      _tenant_id: tenantId,
      _feature_code: featureCode,
    });
    if (error) throw error;
    return data === null ? null : Number(data);
  } catch (err) {
    console.error(`[Entitlements] getTenantLimit error for ${featureCode}:`, err);
    return 0;
  }
}

/**
 * Fetches the entire resolved entitlements tree for a tenant.
 */
export async function getTenantEntitlements(tenantId: string): Promise<TenantEntitlementsPayload | null> {
  if (!tenantId) return null;
  try {
    const { data, error } = await db.rpc("get_tenant_entitlements", {
      _tenant_id: tenantId,
    });
    if (error) throw error;
    return data as TenantEntitlementsPayload;
  } catch (err) {
    console.error(`[Entitlements] getTenantEntitlements error for ${tenantId}:`, err);
    return null;
  }
}

/**
 * Checks limit enforcement against current usage.
 */
export async function checkTenantLimit(
  tenantId: string,
  featureCode: string,
  currentCount: number
): Promise<{ allowed: boolean; current: number; limit: number | null; unlimited: boolean; remaining?: number }> {
  try {
    const { data, error } = await db.rpc("check_tenant_limit_enforcement", {
      _tenant_id: tenantId,
      _feature_code: featureCode,
      _current_count: currentCount,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error(`[Entitlements] checkTenantLimit error for ${featureCode}:`, err);
    return { allowed: false, current: currentCount, limit: 0, unlimited: false };
  }
}

// ─── React Hook: useEntitlements ──────────────────────────────────────────────

export function useEntitlements(tenantIdProp?: string) {
  const { tenant } = useAuth();
  const activeTenantId = tenantIdProp || tenant?.id;

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<TenantEntitlementsPayload | null>({
    queryKey: ["tenant-entitlements", activeTenantId],
    queryFn: () => (activeTenantId ? getTenantEntitlements(activeTenantId) : null),
    enabled: !!activeTenantId,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  const can = (featureCode: string): boolean => {
    if (!data?.entitlements) return false;
    const item = data.entitlements[featureCode];
    return Boolean(item?.enabled);
  };

  const getLimit = (featureCode: string): number | null => {
    if (!data?.entitlements) return 0;
    const item = data.entitlements[featureCode];
    if (!item || !item.enabled) return 0;
    return item.unlimited ? null : item.limit;
  };

  const isUnlimited = (featureCode: string): boolean => {
    if (!data?.entitlements) return false;
    const item = data.entitlements[featureCode];
    return Boolean(item?.enabled && item?.unlimited);
  };

  const isOverLimit = (featureCode: string, currentCount: number): boolean => {
    if (!data?.entitlements) return true;
    const item = data.entitlements[featureCode];
    if (!item || !item.enabled) return true;
    if (item.unlimited) return false;
    if (item.limit === null) return false;
    return currentCount >= item.limit;
  };

  const getRemaining = (featureCode: string, currentCount: number): number | null => {
    if (!data?.entitlements) return 0;
    const item = data.entitlements[featureCode];
    if (!item || !item.enabled) return 0;
    if (item.unlimited || item.limit === null) return null;
    return Math.max(0, item.limit - currentCount);
  };

  return {
    loading: isLoading,
    isError,
    data,
    plan: data?.plan ?? null,
    subscription: data?.subscription ?? null,
    entitlements: data?.entitlements ?? {},
    can,
    getLimit,
    isUnlimited,
    isOverLimit,
    getRemaining,
    refetch,
  };
}

// ─── UI Component: EntitlementGuard ───────────────────────────────────────────

interface EntitlementGuardProps {
  feature: string;
  tenantId?: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function EntitlementGuard({
  feature,
  tenantId,
  fallback = null,
  children,
}: EntitlementGuardProps) {
  const { can, loading } = useEntitlements(tenantId);

  if (loading) return null;
  if (!can(feature)) return fallback as any;

  return children as any;
}
