// Exact decimal money helpers for the Field Sales app.
// Amounts are held as integer minor units (e.g. cents) to avoid floating-point drift.

export const DECIMALS = 2;
const FACTOR = 10 ** DECIMALS;

/** Parse a user-typed decimal string ("1,250.5") into integer minor units. Returns null if invalid. */
export function toMinor(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[,\s]/g, "").trim();
  if (s === "") return null;
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const whole = parseInt(m[2] || "0", 10);
  const fracStr = (m[3] ?? "").padEnd(DECIMALS + 1, "0");
  let frac = parseInt(fracStr.slice(0, DECIMALS), 10);
  let w = whole;
  if (parseInt(fracStr[DECIMALS], 10) >= 5) {
    frac += 1;
    if (frac >= FACTOR) { frac -= FACTOR; w += 1; }
  }
  const v = w * FACTOR + frac;
  return m[1] ? -v : v;
}

/** Convert minor units back to a decimal string suitable for numeric DB columns. */
export function fromMinor(minor: number): string {
  const neg = minor < 0;
  const a = Math.abs(Math.round(minor));
  return `${neg ? "-" : ""}${Math.floor(a / FACTOR)}.${String(a % FACTOR).padStart(DECIMALS, "0")}`;
}

export function formatMoney(minor: number, currency = "KES"): string {
  const v = Number(fromMinor(minor));
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: DECIMALS, maximumFractionDigits: DECIMALS }).format(v);
  } catch {
    return `${currency} ${v.toFixed(DECIMALS)}`;
  }
}

/** DB numeric → minor units. */
export const dbMinor = (v: unknown) => toMinor(v == null ? "0" : String(v)) ?? 0;

/** Line total in minor units: qty × price × (1 − disc%) × (1 + tax%), rounded half-up once. */
export function lineMinor(qty: number, priceMinor: number, discPct: number, taxPct: number): number {
  const q = Math.round(qty * 1000); // qty to 3 dp
  const d = Math.round((discPct || 0) * 100); // basis points
  const t = Math.round((taxPct || 0) * 100);
  const num = q * priceMinor * (10000 - d) * (10000 + t);
  return Math.round(num / (1000 * 10000 * 10000));
}

export function docTotals(lines: { quantity: number; priceMinor: number; discount_pct: number; tax_pct: number }[]) {
  let subtotal = 0, discount = 0, tax = 0, total = 0;
  for (const l of lines) {
    const gross = Math.round(l.quantity * 1000) * l.priceMinor / 1000;
    const afterDisc = Math.round(gross * (10000 - Math.round((l.discount_pct || 0) * 100)) / 10000);
    const lt = lineMinor(l.quantity, l.priceMinor, l.discount_pct, l.tax_pct);
    subtotal += Math.round(gross);
    discount += Math.round(gross) - afterDisc;
    tax += lt - afterDisc;
    total += lt;
  }
  return { subtotal, discount, tax, total };
}
