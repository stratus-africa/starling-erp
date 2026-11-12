ALTER TABLE public.warehouses
  ADD COLUMN address text,
  ADD COLUMN city text,
  ADD COLUMN country text,
  ADD COLUMN manager_name text;

COMMENT ON COLUMN public.warehouses.address IS 'Street or physical address of the warehouse.';
COMMENT ON COLUMN public.warehouses.city IS 'City where the warehouse is located.';
COMMENT ON COLUMN public.warehouses.country IS 'Country where the warehouse is located.';
COMMENT ON COLUMN public.warehouses.manager_name IS 'Display name of the person responsible for the warehouse.';