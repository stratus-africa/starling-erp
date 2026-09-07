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