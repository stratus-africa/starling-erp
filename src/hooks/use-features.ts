import { useCallback, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { FEATURES, type Feature } from "@/lib/features";

export function useFeatures() {
  const query = useQuery({
    queryKey: ["tenant-features"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_features");
      if (error) throw error;
      return new Set((data ?? []).map((row) => row.feature as Feature));
    },
    staleTime: 5 * 60 * 1000,
  });

  const hasFeature = useCallback(
    (feature: Feature | string) => query.data?.has(feature as Feature) ?? false,
    [query.data],
  );

  return {
    features: query.data ?? new Set<Feature>(),
    hasFeature,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export { FEATURES };
