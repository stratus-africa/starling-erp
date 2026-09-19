ALTER TABLE public.payments_received
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Draft';

UPDATE public.payments_received
SET status = CASE WHEN voided_at IS NOT NULL THEN 'Voided'
                  WHEN posted_at IS NOT NULL THEN 'Posted'
                  ELSE 'Draft' END;