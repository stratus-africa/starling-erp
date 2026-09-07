ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS currency_symbol text;

UPDATE public.tenants
SET currency_symbol = CASE currency
  WHEN 'AED' THEN 'د.إ'
  WHEN 'AUD' THEN '$'
  WHEN 'CAD' THEN '$'
  WHEN 'EUR' THEN '€'
  WHEN 'GBP' THEN '£'
  WHEN 'KES' THEN 'KSh'
  WHEN 'NGN' THEN '₦'
  WHEN 'RWF' THEN 'FRw'
  WHEN 'TZS' THEN 'TSh'
  WHEN 'UGX' THEN 'USh'
  WHEN 'USD' THEN '$'
  WHEN 'ZAR' THEN 'R'
  ELSE currency
END
WHERE currency_symbol IS NULL;