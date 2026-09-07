export const CURRENCY_SYMBOLS: Record<string, string> = {
  AED: "د.إ",
  AUD: "$",
  CAD: "$",
  EUR: "€",
  GBP: "£",
  KES: "KSh",
  NGN: "₦",
  RWF: "FRw",
  TZS: "TSh",
  UGX: "USh",
  USD: "$",
  ZAR: "R",
};

export function currencySymbol(currency?: string | null) {
  return CURRENCY_SYMBOLS[currency ?? ""] ?? currency ?? "¤";
}
export function formatBaseCurrency(
  amount: number,
  currency?: string | null,
  options: Intl.NumberFormatOptions = {},
) {
  const code = currency ?? "KES";
  const symbol = currencySymbol(code);
  const formatted = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  });
  return `${amount < 0 ? "-" : ""}${symbol} ${formatted}`;
}

export function formatCompactBaseCurrency(amount: number, currency?: string | null) {
  const absolute = Math.abs(amount);
  const compact = absolute >= 1_000_000
    ? `${(absolute / 1_000_000).toFixed(1)}M`
    : absolute >= 1_000
      ? `${(absolute / 1_000).toFixed(0)}K`
      : absolute.toFixed(0);
  return `${amount < 0 ? "-" : ""}${currencySymbol(currency)} ${compact}`;
}