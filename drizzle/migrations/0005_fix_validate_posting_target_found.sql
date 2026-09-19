CREATE OR REPLACE FUNCTION public.validate_posting_target(_table_name text, _document_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id  uuid;
  v_status     text;
  v_posted_at  timestamptz;
  v_deleted_at timestamptz;
  v_rows       integer;
BEGIN
  IF NOT public.has_permission(_permission) THEN
    RAISE EXCEPTION 'Not authorized: %', _permission USING ERRCODE = '42501';
  END IF;

  IF _table_name NOT IN (
    'invoices', 'bills', 'credit_notes', 'shipments', 'packages',
    'inventory_adjustments', 'inventory_transfers', 'production_orders',
    'payments_received', 'payments_made', 'expenses'
  ) THEN
    RAISE EXCEPTION 'Unsupported posting document: %', _table_name;
  END IF;

  EXECUTE format(
    'SELECT tenant_id, status, posted_at, deleted_at
     FROM public.%I
     WHERE id = $1
     FOR UPDATE',
    _table_name
  )
  INTO v_tenant_id, v_status, v_posted_at, v_deleted_at
  USING _document_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION '% not found', _table_name;
  END IF;

  IF v_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Tenant mismatch — document % belongs to a different tenant',
      _document_id USING ERRCODE = '42501';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION '% % has been deleted and cannot be posted', _table_name, _document_id;
  END IF;

  IF v_posted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF lower(COALESCE(v_status, '')) IN (
    'posted', 'completed',
    'cancelled', 'canceled',
    'voided', 'void',
    'rejected', 'reversed'
  ) THEN
    RAISE EXCEPTION '% % cannot be posted from status "%"',
      _table_name, _document_id, COALESCE(v_status, 'NULL');
  END IF;

  RETURN true;
END;
$function$;