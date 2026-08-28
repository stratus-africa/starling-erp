import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TableName = keyof Database["public"]["Tables"];

/**
 * These helpers are used with dynamic (runtime-decided) table names across the
 * generic module framework, so they intentionally use loose row types.
 */
export type Row = Record<string, any>;

const db = supabase as any;

export async function fetchRow(table: string, id: string): Promise<Row | null> {
  const { data, error } = await db.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Row | null) ?? null;
}

export async function insertRow(table: string, payload: Row): Promise<Row> {
  const { data, error } = await db.from(table).insert(payload).select().single();
  if (error) throw error;
  return data as Row;
}

export async function updateRow(table: string, id: string, payload: Row): Promise<void> {
  const { error } = await db.from(table).update(payload).eq("id", id);
  if (error) throw error;
}

export async function softDeleteRow(table: string, id: string): Promise<void> {
  await updateRow(table, id, { deleted_at: new Date().toISOString() });
}
