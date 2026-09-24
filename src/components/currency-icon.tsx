import type { ComponentPropsWithoutRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { currencySymbol } from "@/lib/currency";
import { cn } from "@/lib/utils";

export function CurrencyIcon({ className, currency, ...props }: ComponentPropsWithoutRef<"span"> & { currency?: string | null }) {
  const { tenant } = useAuth();
  const baseCurrency = currency ?? tenant?.currency ?? tenant?.currency_symbol;

  return (
    <span
      aria-label={`${baseCurrency ?? "Base currency"} currency`}
      className={cn("inline-flex shrink-0 items-center justify-center font-sans text-[0.72em] font-bold leading-none", className)}
      {...props}
    >
      {currencySymbol(baseCurrency)}
    </span>
  );
}