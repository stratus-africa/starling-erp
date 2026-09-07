WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, lower(trim(code))
      ORDER BY created_at, id
    ) AS duplicate_rank
  FROM public.units_of_measure
  WHERE deleted_at IS NULL
)
DELETE FROM public.units_of_measure u
USING ranked r
WHERE u.id = r.id
  AND r.duplicate_rank > 1;

UPDATE public.units_of_measure
SET code = lower(trim(code))
WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.units_of_measure_tenant_code_key;
CREATE UNIQUE INDEX units_of_measure_tenant_code_key
  ON public.units_of_measure (tenant_id, lower(trim(code)))
  WHERE deleted_at IS NULL;