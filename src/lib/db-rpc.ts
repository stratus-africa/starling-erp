import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Functions = Database["public"]["Functions"];
type FunctionName = keyof Functions;
type FunctionArgs<N extends FunctionName> = Functions[N]["Args"];
type FunctionReturn<N extends FunctionName> = Functions[N]["Returns"];

export async function callRpc<N extends FunctionName>(
  name: N,
  args: FunctionArgs<N>,
): Promise<FunctionReturn<N>> {
  const { data, error } = await supabase.rpc(name, args as never);
  if (error) throw error;
  return data as FunctionReturn<N>;
}
