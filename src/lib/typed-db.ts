import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type TableName = keyof Database["public"]["Tables"];

export async function fetchRow<T extends TableName>(table: T, id: string): Promise<Tables<T> | null> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Tables<T> | null;
}

export async function insertRow<T extends TableName>(table: T, payload: TablesInsert<T>): Promise<Tables<T>> {
  const { data, error } = await supabase
    .from(table)
    .insert(payload as never)
    .select()
    .single();
  if (error) throw error;
  return data as Tables<T>;
}

export async function updateRow<T extends TableName>(table: T, id: string, payload: TablesUpdate<T>): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update(payload as never)
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteRow<T extends TableName>(table: T, id: string): Promise<void> {
  await updateRow(table, id, { deleted_at: new Date().toISOString() } as TablesUpdate<T>);
}
