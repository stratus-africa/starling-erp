CREATE OR REPLACE FUNCTION public.platform_audit(_action text, _target_type text, _target_id text, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  BEGIN v_id := _target_id::uuid; EXCEPTION WHEN others THEN v_id := NULL; END;
  PERFORM public.platform_audit(_action, _target_type, v_id, COALESCE(_details->>'code', _target_id), _details);
END; $$;
REVOKE EXECUTE ON FUNCTION public.platform_audit(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_audit(text, text, text, jsonb) TO service_role;