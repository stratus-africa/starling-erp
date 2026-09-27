CREATE OR REPLACE FUNCTION public.admin_purge_tenant(_tenant_id uuid, _confirm_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
  v_tables text[];
  v_t text;
  v_remaining text[];
  v_progress boolean;
  v_pass int := 0;
  v_count bigint;
  v_total bigint := 0;
BEGIN
  IF NOT public.has_platform_permission('platform.tenants.delete') THEN
    RAISE EXCEPTION 'Not authorized: platform.tenants.delete' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name FROM public.tenants WHERE id = _tenant_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Workspace not found'; END IF;
  IF coalesce(trim(_confirm_name),'') <> v_name THEN
    RAISE EXCEPTION 'Confirmation name does not match the workspace name';
  END IF;

  SELECT array_agg(c.table_name::text) INTO v_tables
  FROM information_schema.columns c
  JOIN information_schema.tables t USING (table_schema, table_name)
  WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
    AND t.table_type = 'BASE TABLE' AND c.table_name <> 'tenants';

  -- Disable immutability/audit triggers while purging
  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', v_t);
  END LOOP;
  ALTER TABLE public.tenants DISABLE TRIGGER USER;

  -- Detach user profiles rather than deleting shared user accounts
  BEGIN
    UPDATE public.profiles SET tenant_id = NULL WHERE tenant_id = _tenant_id;
  EXCEPTION WHEN others THEN NULL;
  END;

  v_remaining := v_tables;
  LOOP
    v_pass := v_pass + 1;
    v_progress := false;
    FOREACH v_t IN ARRAY v_remaining LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_t) USING _tenant_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_total := v_total + v_count;
        v_remaining := array_remove(v_remaining, v_t);
        v_progress := true;
      EXCEPTION WHEN foreign_key_violation THEN
        NULL; -- retry on the next pass once dependents are gone
      END;
    END LOOP;
    EXIT WHEN coalesce(array_length(v_remaining,1),0) = 0 OR NOT v_progress OR v_pass > 30;
  END LOOP;

  IF coalesce(array_length(v_remaining,1),0) > 0 THEN
    RAISE EXCEPTION 'Could not delete records from: %', array_to_string(v_remaining, ', ');
  END IF;

  DELETE FROM public.tenants WHERE id = _tenant_id;

  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', v_t);
  END LOOP;
  ALTER TABLE public.tenants ENABLE TRIGGER USER;

  BEGIN
    INSERT INTO public.platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'tenant.purged', 'tenant', _tenant_id,
            jsonb_build_object('name', v_name, 'rows_deleted', v_total));
  EXCEPTION WHEN others THEN NULL;
  END;

  RETURN jsonb_build_object('tenant', v_name, 'rows_deleted', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_tenant(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_tenant(uuid, text) TO authenticated;