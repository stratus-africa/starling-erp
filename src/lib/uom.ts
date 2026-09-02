/**
 * UOM (Unit of Measure) utilities for NimbusERP
 *
 * Two layers:
 *   1. Client-side pure-TS engine — uses a locally-supplied conversion table
 *      (fetched once and cached) for instant UI previews without a round-trip.
 *   2. DB wrapper — calls the Supabase `uom_convert` RPC for authoritative
 *      server-side conversion (used before posting documents).
 *
 * Precision:
 *   All arithmetic uses JavaScript's `number` (IEEE-754 double), which gives
 *   15-16 significant decimal digits.  We round at the last step to 8 decimal
 *   places to match the DB's NUMERIC(18,8) precision.  Quantities are never
 *   stored as floating-point — they go through `roundQty()` before any DB
 *   write or display.
 *
 * Usage:
 *   // UI preview (instant, no DB round-trip)
 *   const engine = buildUomEngine(conversions); // conversions from useFkOptions
 *   const stockQty = engine.convert(12, "box", "pc", itemId); // → 144
 *
 *   // Server-authoritative (before posting)
 *   const stockQty = await dbConvert(12, "box", "pc", itemId);
 */

import { db } from "@/lib/typed-db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UomClass = "Unit" | "Weight" | "Length" | "Volume" | "Area" | "Time" | "Packaging";

export interface UomMaster {
  id: string;
  code: string;
  name: string;
  uom_class: UomClass;
  is_base_unit: boolean;
  symbol: string | null;
  decimal_places: number;
  is_active: boolean;
}

export interface UomConversionRow {
  id: string;
  from_uom: string;
  to_uom: string;
  /** 1 from_uom = factor × to_uom */
  factor: number;
  item_id: string | null;
  uom_class: string | null;
}

export interface ConvertResult {
  qty: number;
  factor: number;
  path: "direct" | "via_base" | "identity";
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const UOM_CLASSES: UomClass[] = ["Unit", "Weight", "Length", "Volume", "Area", "Time", "Packaging"];

export const UOM_CLASS_ICONS: Record<UomClass, string> = {
  Unit: "📦",
  Weight: "⚖️",
  Length: "📏",
  Volume: "🧴",
  Area: "⬜",
  Time: "⏱️",
  Packaging: "🗃️",
};

export const UOM_CLASS_COLORS: Record<UomClass, string> = {
  Unit: "bg-blue-100 text-blue-700",
  Weight: "bg-amber-100 text-amber-700",
  Length: "bg-green-100 text-green-700",
  Volume: "bg-cyan-100 text-cyan-700",
  Area: "bg-purple-100 text-purple-700",
  Time: "bg-rose-100 text-rose-700",
  Packaging: "bg-orange-100 text-orange-700",
};

// ─── Precision helpers ────────────────────────────────────────────────────────

/** Round to 8 decimal places — matches DB NUMERIC(18,8). */
export function roundQty(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/** Format a quantity for display, respecting the UOM's decimal_places. */
export function formatQty(n: number, decimalPlaces = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: Math.max(decimalPlaces, 2),
  });
}

// ─── Client-side conversion engine ───────────────────────────────────────────

export interface UomEngine {
  /**
   * Convert qty from fromUom to toUom.
   * Resolves: identity → direct → via base unit.
   * Returns null if no path exists (instead of throwing, for UI use).
   */
  convert(qty: number, fromUom: string, toUom: string, itemId?: string | null): ConvertResult | null;

  /** Returns true if a conversion path exists. */
  hasPath(fromUom: string, toUom: string, itemId?: string | null): boolean;

  /** Get the UOM class for a code, or null. */
  getClass(code: string): UomClass | null;

  /** Get the base unit code for a class, or null. */
  getBase(uomClass: UomClass): string | null;

  /** Get all UOMs for a given class, sorted by name. */
  getByClass(uomClass: UomClass): UomMaster[];

  /** Validate that circular conversion is not introduced.
   *  Returns an error message, or null if safe. */
  checkCircular(fromUom: string, toUom: string, itemId?: string | null): string | null;
}

/**
 * Build a client-side UOM engine from the master + conversions data.
 * Call once per session, or when conversions change.
 */
export function buildUomEngine(master: UomMaster[], conversions: UomConversionRow[]): UomEngine {
  // Index master by code
  const masterByCode = new Map<string, UomMaster>();
  for (const u of master) {
    if (u.is_active) masterByCode.set(u.code, u);
  }

  // Index base units by class
  const baseByClass = new Map<UomClass, string>();
  for (const u of master) {
    if (u.is_base_unit && u.is_active) baseByClass.set(u.uom_class, u.code);
  }

  // Index conversions: key = `${from}→${to}:${itemId ?? ""}`, value = factor
  // Item-specific conversions override global ones (higher priority).
  const convMap = new Map<string, number>();
  // Load globals first (lower priority)
  for (const c of conversions) {
    if (c.item_id === null) {
      convMap.set(`${c.from_uom}→${c.to_uom}:`, c.factor);
    }
  }
  // Then item-specific (higher priority)
  for (const c of conversions) {
    if (c.item_id !== null) {
      convMap.set(`${c.from_uom}→${c.to_uom}:${c.item_id}`, c.factor);
    }
  }

  function lookupFactor(from: string, to: string, itemId?: string | null): number | null {
    // Item-specific first
    if (itemId) {
      const f = convMap.get(`${from}→${to}:${itemId}`);
      if (f !== undefined) return f;
    }
    // Global
    const g = convMap.get(`${from}→${to}:`);
    return g !== undefined ? g : null;
  }

  function convert(qty: number, fromUom: string, toUom: string, itemId?: string | null): ConvertResult | null {
    // Identity
    if (fromUom === toUom) {
      return { qty: roundQty(qty), factor: 1, path: "identity" };
    }

    // Direct
    const direct = lookupFactor(fromUom, toUom, itemId);
    if (direct !== null) {
      return { qty: roundQty(qty * direct), factor: direct, path: "direct" };
    }

    // Via base unit
    const fromMeta = masterByCode.get(fromUom);
    const toMeta = masterByCode.get(toUom);
    if (!fromMeta || !toMeta) return null;
    if (fromMeta.uom_class !== toMeta.uom_class) return null; // class mismatch

    const base = baseByClass.get(fromMeta.uom_class);
    if (!base) return null;

    let fwd: number;
    if (fromUom === base) {
      fwd = 1;
    } else {
      const f = lookupFactor(fromUom, base, itemId);
      if (f === null) return null;
      fwd = f;
    }

    let rev: number;
    if (toUom === base) {
      rev = 1;
    } else {
      const r = lookupFactor(base, toUom, itemId);
      if (r === null) return null;
      rev = r;
    }

    const combinedFactor = fwd * rev;
    return {
      qty: roundQty(qty * combinedFactor),
      factor: roundQty(combinedFactor),
      path: "via_base",
    };
  }

  function hasPath(fromUom: string, toUom: string, itemId?: string | null): boolean {
    return convert(1, fromUom, toUom, itemId) !== null;
  }

  function getClass(code: string): UomClass | null {
    return masterByCode.get(code)?.uom_class ?? null;
  }

  function getBase(uomClass: UomClass): string | null {
    return baseByClass.get(uomClass) ?? null;
  }

  function getByClass(uomClass: UomClass): UomMaster[] {
    return master.filter((u) => u.uom_class === uomClass && u.is_active).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * BFS cycle detection — mirrors the DB trigger logic.
   * Returns an error message if adding from→to would create a cycle.
   */
  function checkCircular(fromUom: string, toUom: string, itemId?: string | null): string | null {
    if (fromUom === toUom) return `A unit cannot convert to itself (${fromUom})`;

    // Can we reach fromUom starting from toUom? If yes, it's circular.
    const visited = new Set<string>();
    const queue = [toUom];
    let depth = 0;

    while (queue.length > 0 && depth <= 6) {
      const next: string[] = [];
      for (const node of queue) {
        if (visited.has(node)) continue;
        visited.add(node);
        if (node === fromUom) {
          return `Circular conversion: adding "${fromUom} → ${toUom}" ` + `would create a cycle`;
        }
        // Follow outgoing edges from node
        for (const c of conversions) {
          if (c.from_uom === node && (c.item_id === (itemId ?? null) || c.item_id === null)) {
            next.push(c.to_uom);
          }
        }
      }
      queue.length = 0;
      queue.push(...next);
      depth++;
    }

    return null; // no cycle detected
  }

  return { convert, hasPath, getClass, getBase, getByClass, checkCircular };
}

// ─── React Query hook key ─────────────────────────────────────────────────────

export const UOM_MASTER_QUERY_KEY = ["units_of_measure", "master"] as const;
export const UOM_CONVERSIONS_QUERY_KEY = ["uom_conversions", "all"] as const;

// ─── DB wrapper — server-authoritative conversion ─────────────────────────────

/**
 * Call the Supabase `uom_convert` RPC for an authoritative conversion.
 * Throws on error (class mismatch, no path, etc.).
 * Use this before writing stock movements or posting documents.
 */
export async function dbConvert(qty: number, fromUom: string, toUom: string, itemId?: string | null): Promise<number> {
  if (fromUom === toUom) return roundQty(qty);

  const { data, error } = await db.rpc("uom_convert", {
    _qty: qty,
    _from: fromUom,
    _to: toUom,
    _item_id: itemId ?? null,
  });

  if (error) throw new Error(error.message);
  return roundQty(Number(data));
}

/**
 * Same as dbConvert but returns null instead of throwing.
 * Useful for form validation previews.
 */
export async function dbConvertSafe(
  qty: number,
  fromUom: string,
  toUom: string,
  itemId?: string | null,
): Promise<number | null> {
  try {
    return await dbConvert(qty, fromUom, toUom, itemId);
  } catch {
    return null;
  }
}

/**
 * Check whether a conversion path exists on the server.
 */
export async function dbHasPath(fromUom: string, toUom: string, itemId?: string | null): Promise<boolean> {
  if (fromUom === toUom) return true;
  const { data, error } = await db.rpc("uom_has_path", {
    _from: fromUom,
    _to: toUom,
    _item_id: itemId ?? null,
  });
  if (error) return false;
  return Boolean(data);
}
