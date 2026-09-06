ALTER TABLE public.uom_conversions
  ADD COLUMN IF NOT EXISTS uom_class text;

COMMENT ON COLUMN public.uom_conversions.uom_class IS
  'Stamped automatically by trg_uom_class_compat for same-class (global) conversions.';