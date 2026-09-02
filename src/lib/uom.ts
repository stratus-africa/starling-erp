/**
 * Unit of Measure helpers: class metadata + a conversion engine that walks
 * the tenant's uom_conversions graph (global rows + item-specific overrides).
 */

export const UOM_CLASSES = ["Unit", "Weight", "Length", "Area", "Volume", "Time", "Custom"] as const;
export type UomClass = (typeof UOM_CLASSES)[number];

export const UOM_CLASS_COLORS: Record<UomClass, string> = {
  Unit: "bg-primary/15 text-primary",
  Weight: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Length: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  Area: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  Volume: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  Time: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  Custom: "bg-muted text-muted-foreground",
};

export interface UomMaster {
  id: string;
  code: string;
  name: string;
  uom_class?: string | null;
  symbol?: string | null;
  decimal_places?: number | null;
  is_base_unit?: boolean | null;
  is_active?: boolean | null;
  notes?: string | null;
}

export interface UomConversionRow {
  id: string;
  from_uom: string;
  to_uom: string;
  factor: number | string;
  item_id?: string | null;
  deleted_at?: string | null;
}

export interface ConversionResult {
  qty: number;
  factor: number;
  path: string[];
}

export function roundQty(n: number, decimals = 4): number {
  const p = Math.pow(10, decimals);
  return Math.round((Number(n) || 0) * p) / p;
}

type Edge = { to: string; factor: number };

function buildGraph(rows: UomConversionRow[], itemId: string | null): Map<string, Edge[]> {
  const graph = new Map<string, Edge[]>();
  const add = (from: string, to: string, factor: number) => {
    if (!from || !to || !isFinite(factor) || factor === 0) return;
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from)!.push({ to, factor });
  };
  const relevant = rows.filter((r) => !r.deleted_at && (!r.item_id || (itemId && r.item_id === itemId)));
  // item-specific rows come last so they are found first after sorting
  relevant.sort((a, b) => (a.item_id ? 1 : 0) - (b.item_id ? 1 : 0));
  for (const r of relevant) {
    const f = Number(r.factor);
    add(r.from_uom, r.to_uom, f);
    add(r.to_uom, r.from_uom, 1 / f);
  }
  return graph;
}

function findFactor(graph: Map<string, Edge[]>, from: string, to: string): ConversionResult | null {
  if (from === to) return { qty: 0, factor: 1, path: [from] };
  const queue: { node: string; factor: number; path: string[] }[] = [{ node: from, factor: 1, path: [from] }];
  const seen = new Set<string>([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const edge of graph.get(cur.node) ?? []) {
      if (seen.has(edge.to)) continue;
      const factor = cur.factor * edge.factor;
      const path = [...cur.path, edge.to];
      if (edge.to === to) return { qty: 0, factor, path };
      seen.add(edge.to);
      queue.push({ node: edge.to, factor, path });
    }
  }
  return null;
}

export interface UomEngine {
  convert: (qty: number, from: string, to: string, itemId?: string | null) => ConversionResult | null;
  factor: (from: string, to: string, itemId?: string | null) => number | null;
  hasPath: (from: string, to: string, itemId?: string | null) => boolean;
  checkCircular: (from: string, to: string, itemId?: string | null) => string | null;
  classOf: (code: string) => string | null;
}

export function buildUomEngine(master: UomMaster[], conversions: UomConversionRow[]): UomEngine {
  const classByCode = new Map<string, string | null>();
  for (const m of master) classByCode.set(m.code, m.uom_class ?? null);

  const graphCache = new Map<string, Map<string, Edge[]>>();
  const graphFor = (itemId: string | null) => {
    const key = itemId ?? "__global__";
    if (!graphCache.has(key)) graphCache.set(key, buildGraph(conversions, itemId));
    return graphCache.get(key)!;
  };

  const convert = (qty: number, from: string, to: string, itemId: string | null = null) => {
    if (!from || !to) return null;
    if (from === to) return { qty: Number(qty) || 0, factor: 1, path: [from] };
    const res = findFactor(graphFor(itemId), from, to);
    if (!res) return null;
    return { qty: roundQty((Number(qty) || 0) * res.factor), factor: res.factor, path: res.path };
  };

  return {
    convert,
    factor: (from, to, itemId = null) => convert(1, from, to, itemId)?.factor ?? null,
    hasPath: (from, to, itemId = null) => convert(1, from, to, itemId) != null,
    checkCircular: (from, to, itemId = null) => {
      if (!from || !to) return null;
      if (from === to) return "From and To UoM must be different";
      const existing = findFactor(graphFor(itemId), to, from);
      if (existing && existing.path.length > 2) {
        return `This would create a circular conversion: ${existing.path.join(" → ")}`;
      }
      if (findFactor(graphFor(itemId), from, to)) {
        return `A conversion path from "${from}" to "${to}" already exists`;
      }
      return null;
    },
    classOf: (code) => classByCode.get(code) ?? null,
  };
}
