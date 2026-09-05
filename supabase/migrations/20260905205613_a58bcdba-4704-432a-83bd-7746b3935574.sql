-- 1. Units of measure master
CREATE TABLE IF NOT EXISTS public.units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  uom_class text NOT NULL DEFAULT 'Unit',
  symbol text,
  decimal_places integer NOT NULL DEFAULT 2,
  is_base_unit boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS units_of_measure_tenant_code_key ON public.units_of_measure (tenant_id, lower(code)) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated;
GRANT ALL ON public.units_of_measure TO service_role;
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uom tenant access" ON public.units_of_measure;
CREATE POLICY "uom tenant access" ON public.units_of_measure FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

-- 2. Warehouse zones + bin locations
CREATE TABLE IF NOT EXISTS public.warehouse_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_zones TO authenticated;
GRANT ALL ON public.warehouse_zones TO service_role;
ALTER TABLE public.warehouse_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "zones tenant access" ON public.warehouse_zones;
CREATE POLICY "zones tenant access" ON public.warehouse_zones FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.warehouse_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES public.warehouse_zones(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text,
  aisle text,
  rack text,
  level text,
  bin text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_locations_wh_code_key ON public.warehouse_locations (warehouse_id, lower(code)) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_locations TO authenticated;
GRANT ALL ON public.warehouse_locations TO service_role;
ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "locations tenant access" ON public.warehouse_locations;
CREATE POLICY "locations tenant access" ON public.warehouse_locations FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

-- 3. Stock movements get an optional bin location
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS location_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_location_fkey') THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_location_fkey FOREIGN KEY (location_id)
      REFERENCES public.warehouse_locations (id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Reservations
CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  ref_type text,
  ref_id uuid,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_reservations TO authenticated;
GRANT ALL ON public.stock_reservations TO service_role;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reservations tenant access" ON public.stock_reservations;
CREATE POLICY "reservations tenant access" ON public.stock_reservations FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

-- 5. Stock by location view
CREATE OR REPLACE VIEW public.inventory_location_stock
WITH (security_invoker = on) AS
SELECT
  sm.tenant_id,
  sm.item_id,
  sm.warehouse_id,
  sm.location_id,
  wl.code AS location_code,
  wl.aisle,
  wl.rack,
  wl.level,
  wl.bin,
  wz.name AS zone_name,
  SUM(sm.quantity) AS on_hand
FROM public.stock_movements sm
LEFT JOIN public.warehouse_locations wl ON wl.id = sm.location_id
LEFT JOIN public.warehouse_zones wz ON wz.id = wl.zone_id
GROUP BY sm.tenant_id, sm.item_id, sm.warehouse_id, sm.location_id, wl.code, wl.aisle, wl.rack, wl.level, wl.bin, wz.name;
GRANT SELECT ON public.inventory_location_stock TO authenticated;
GRANT ALL ON public.inventory_location_stock TO service_role;

-- 6. Availability RPC
CREATE OR REPLACE FUNCTION public.get_item_availability(_item_id uuid)
RETURNS TABLE (warehouse_id uuid, on_hand numeric, reserved numeric, available numeric, on_order numeric, projected numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH oh AS (
    SELECT sm.warehouse_id, SUM(sm.quantity) AS on_hand
    FROM public.stock_movements sm
    WHERE sm.item_id = _item_id
    GROUP BY sm.warehouse_id
  ), res AS (
    SELECT sr.warehouse_id, SUM(sr.quantity) AS reserved
    FROM public.stock_reservations sr
    WHERE sr.item_id = _item_id AND sr.deleted_at IS NULL AND sr.status = 'Active'
    GROUP BY sr.warehouse_id
  ), oo AS (
    SELECT SUM(pol.quantity) AS on_order
    FROM public.purchase_order_lines pol
    JOIN public.purchase_orders po ON po.id = pol.document_id
    WHERE pol.item_id = _item_id
      AND pol.deleted_at IS NULL
      AND po.deleted_at IS NULL
      AND COALESCE(po.status, 'Draft') NOT IN ('Cancelled', 'Closed', 'Billed')
  )
  SELECT
    oh.warehouse_id,
    COALESCE(oh.on_hand, 0) AS on_hand,
    COALESCE(res.reserved, 0) AS reserved,
    COALESCE(oh.on_hand, 0) - COALESCE(res.reserved, 0) AS available,
    0::numeric AS on_order,
    COALESCE(oh.on_hand, 0) - COALESCE(res.reserved, 0) AS projected
  FROM oh
  LEFT JOIN res ON res.warehouse_id IS NOT DISTINCT FROM oh.warehouse_id
  UNION ALL
  SELECT NULL::uuid, 0, 0, 0, COALESCE((SELECT on_order FROM oo), 0), COALESCE((SELECT on_order FROM oo), 0)
  WHERE COALESCE((SELECT on_order FROM oo), 0) <> 0;
$$;
GRANT EXECUTE ON FUNCTION public.get_item_availability(uuid) TO authenticated, service_role;

-- 7. Seed base units for existing tenants
INSERT INTO public.units_of_measure (tenant_id, code, name, uom_class, symbol, decimal_places, is_base_unit)
SELECT t.id, u.code, u.name, u.uom_class, u.symbol, u.decimals, u.base
FROM public.tenants t
CROSS JOIN (VALUES
  ('pc','Piece','Unit','pc',0,true),
  ('box','Box','Packaging','box',0,false),
  ('ctn','Carton','Packaging','ctn',0,false),
  ('pack','Pack','Packaging','pack',0,false),
  ('kg','Kilogram','Weight','kg',3,true),
  ('g','Gram','Weight','g',3,false),
  ('l','Litre','Volume','L',3,true),
  ('ml','Millilitre','Volume','mL',3,false),
  ('m','Metre','Length','m',3,true),
  ('cm','Centimetre','Length','cm',2,false),
  ('hr','Hour','Time','h',2,true)
) AS u(code, name, uom_class, symbol, decimals, base)
WHERE t.deleted_at IS NULL
ON CONFLICT DO NOTHING;