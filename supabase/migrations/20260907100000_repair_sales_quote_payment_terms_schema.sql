-- Repair migration for environments where the original payment-terms migration
-- was not applied or PostgREST is serving a stale schema cache.
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS payment_terms text;

NOTIFY pgrst, 'reload schema';