-- Tenant-owned settings records and shipment-to-order loading relationships.

CREATE TABLE IF NOT EXISTS public.tenant_currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Z]{3}$'),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  exchange_rate numeric(18,6) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.tenant_payment_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  days_due integer NOT NULL CHECK (days_due >= 0 AND days_due <= 3650),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS public.tenant_document_numbering (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('Quote','Sales Order','Invoice','Credit Note','Purchase Requisition','Purchase Order','Bill','Package','Shipment')),
  prefix text NOT NULL DEFAULT '' CHECK (length(prefix) <= 80),
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, document_type)
);

CREATE TABLE IF NOT EXISTS public.tenant_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (length(trim(event)) > 0),
  channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[] CHECK (cardinality(channels) > 0 AND channels <@ ARRAY['in_app','email']::text[]),
  audience text NOT NULL CHECK (length(trim(audience)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, event, audience)
);

-- Only a digest is retained. The plaintext token is returned once by the RPC below.
CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS tenant_currencies_active_idx ON public.tenant_currencies (tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tenant_payment_terms_active_idx ON public.tenant_payment_terms (tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tenant_numbering_active_idx ON public.tenant_document_numbering (tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tenant_notification_preferences_active_idx ON public.tenant_notification_preferences (tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tenant_api_keys_active_idx ON public.tenant_api_keys (tenant_id, revoked_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shipment_sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, sales_order_id)
);

CREATE INDEX IF NOT EXISTS shipment_sales_orders_tenant_shipment_idx ON public.shipment_sales_orders (tenant_id, shipment_id);
CREATE INDEX IF NOT EXISTS shipment_sales_orders_tenant_order_idx ON public.shipment_sales_orders (tenant_id, sales_order_id);

CREATE OR REPLACE FUNCTION public.validate_shipment_sales_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_shipment public.shipments; v_order public.sales_orders;
BEGIN
  SELECT * INTO v_shipment FROM public.shipments WHERE id = NEW.shipment_id;
  SELECT * INTO v_order FROM public.sales_orders WHERE id = NEW.sales_order_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_shipment.id IS NULL OR v_order.tenant_id <> NEW.tenant_id OR v_shipment.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Shipment and sales order must belong to the same tenant' USING ERRCODE = '23503';
  END IF;
  NEW.tenant_id := v_shipment.tenant_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_shipment_sales_order ON public.shipment_sales_orders;
CREATE TRIGGER trg_validate_shipment_sales_order BEFORE INSERT OR UPDATE ON public.shipment_sales_orders
FOR EACH ROW EXECUTE FUNCTION public.validate_shipment_sales_order();

CREATE OR REPLACE FUNCTION public.replace_shipment_sales_orders(_shipment_id uuid, _sales_order_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_order_id uuid;
BEGIN
  IF NOT public.has_permission('sales.update') THEN RAISE EXCEPTION 'Not authorized to update shipment orders' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shipments WHERE id = _shipment_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Shipment not found for current tenant'; END IF;
  IF EXISTS (SELECT 1 FROM public.shipments WHERE id = _shipment_id AND posted_at IS NOT NULL) THEN RAISE EXCEPTION 'Posted shipments cannot be changed'; END IF;
  IF cardinality(COALESCE(_sales_order_ids, ARRAY[]::uuid[])) = 0 THEN RAISE EXCEPTION 'Select at least one sales order'; END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(_sales_order_ids) AS id) <> cardinality(_sales_order_ids) THEN RAISE EXCEPTION 'A sales order was selected more than once'; END IF;
  FOREACH v_order_id IN ARRAY _sales_order_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sales_orders WHERE id = v_order_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN RAISE EXCEPTION 'One or more sales orders do not belong to this workspace'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT COALESCE(customer_id::text, 'no-customer')) FROM public.sales_orders WHERE id = ANY(_sales_order_ids)) > 1 THEN
    RAISE EXCEPTION 'A shipment can only combine sales orders for the same customer';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.shipments s JOIN public.packages p ON p.id = s.package_id
    WHERE s.id = _shipment_id AND p.sales_order_id IS NOT NULL AND NOT (p.sales_order_id = ANY(_sales_order_ids))
  ) THEN RAISE EXCEPTION 'Selected package does not belong to a sales order loaded on this shipment'; END IF;
  DELETE FROM public.shipment_sales_orders WHERE shipment_id = _shipment_id AND tenant_id = v_tenant;
  INSERT INTO public.shipment_sales_orders (tenant_id, shipment_id, sales_order_id)
  SELECT v_tenant, _shipment_id, id FROM unnest(_sales_order_ids) AS id;
END;
$$;

-- Preserve existing shipment links when this migration is applied.
INSERT INTO public.shipment_sales_orders (tenant_id, shipment_id, sales_order_id)
SELECT s.tenant_id, s.id, s.sales_order_id
FROM public.shipments s
WHERE s.sales_order_id IS NOT NULL
ON CONFLICT (shipment_id, sales_order_id) DO NOTHING;

-- A tenant administrator (or a role granted company-settings permission) owns these settings.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tenant_currencies','tenant_payment_terms','tenant_document_numbering','tenant_notification_preferences','tenant_api_keys','shipment_sales_orders'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_tenant_read', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id())', table_name || '_tenant_read', table_name);
  END LOOP;
END $$;

CREATE POLICY tenant_currencies_write ON public.tenant_currencies FOR ALL TO authenticated
USING (tenant_id = public.current_tenant_id() AND public.has_permission('settings.company.update'))
WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('settings.company.update'));
CREATE POLICY tenant_payment_terms_write ON public.tenant_payment_terms FOR ALL TO authenticated
USING (tenant_id = public.current_tenant_id() AND public.has_permission('settings.company.update'))
WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('settings.company.update'));
CREATE POLICY tenant_document_numbering_write ON public.tenant_document_numbering FOR ALL TO authenticated
USING (tenant_id = public.current_tenant_id() AND public.has_permission('settings.company.update'))
WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('settings.company.update'));
CREATE POLICY tenant_notification_preferences_write ON public.tenant_notification_preferences FOR ALL TO authenticated
USING (tenant_id = public.current_tenant_id() AND public.has_permission('settings.company.update'))
WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('settings.company.update'));
CREATE POLICY shipment_sales_orders_write ON public.shipment_sales_orders FOR ALL TO authenticated
USING (tenant_id = public.current_tenant_id() AND public.has_permission('sales.update'))
WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('sales.update'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_currencies, public.tenant_payment_terms, public.tenant_document_numbering, public.tenant_notification_preferences, public.shipment_sales_orders TO authenticated;
-- Never send the stored digest to a browser client.
GRANT SELECT (id, tenant_id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at) ON public.tenant_api_keys TO authenticated;

CREATE OR REPLACE FUNCTION public.create_tenant_api_key(_name text, _expires_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_token text; v_prefix text; v_id uuid;
BEGIN
  IF NOT public.has_permission('settings.company.update') THEN RAISE EXCEPTION 'Not authorized to manage API keys' USING ERRCODE = '42501'; END IF;
  IF length(trim(COALESCE(_name, ''))) = 0 THEN RAISE EXCEPTION 'API key name is required'; END IF;
  IF _expires_at IS NOT NULL AND _expires_at <= now() THEN RAISE EXCEPTION 'Expiry must be in the future'; END IF;
  v_token := 'strl_' || encode(gen_random_bytes(32), 'hex');
  v_prefix := left(v_token, 13) || '…';
  INSERT INTO public.tenant_api_keys (tenant_id, name, key_prefix, key_hash, created_by, expires_at)
  VALUES (v_tenant, trim(_name), v_prefix, encode(digest(v_token, 'sha256'), 'hex'), auth.uid(), _expires_at)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'key', v_token, 'prefix', v_prefix);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_tenant_api_key(_key_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_permission('settings.company.update') THEN RAISE EXCEPTION 'Not authorized to manage API keys' USING ERRCODE = '42501'; END IF;
  UPDATE public.tenant_api_keys SET revoked_at = COALESCE(revoked_at, now()), revoked_by = auth.uid()
  WHERE id = _key_id AND tenant_id = public.current_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'API key not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_tenant_api_key(_key_id uuid, _name text, _expires_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_permission('settings.company.update') THEN RAISE EXCEPTION 'Not authorized to manage API keys' USING ERRCODE = '42501'; END IF;
  IF length(trim(COALESCE(_name, ''))) = 0 THEN RAISE EXCEPTION 'API key name is required'; END IF;
  IF _expires_at IS NOT NULL AND _expires_at <= now() THEN RAISE EXCEPTION 'Expiry must be in the future'; END IF;
  UPDATE public.tenant_api_keys SET name = trim(_name), expires_at = _expires_at
  WHERE id = _key_id AND tenant_id = public.current_tenant_id() AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active API key not found'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_tenant_api_key(text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_api_key(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_api_key(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_shipment_sales_orders(uuid, uuid[]) TO authenticated;
