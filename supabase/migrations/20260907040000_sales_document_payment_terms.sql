ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS payment_terms text;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS payment_terms text;
