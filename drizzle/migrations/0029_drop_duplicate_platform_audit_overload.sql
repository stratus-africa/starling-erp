DROP FUNCTION IF EXISTS public.platform_audit(text, text, uuid, text, jsonb);
CREATE OR REPLACE FUNCTION public.platform_audit(_action text, _target_type text, _target_id text, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  BEGIN v_id := _target_id::uuid; EXCEPTION WHEN others THEN v_id := NULL; END;
  PERFORM public.platform_audit(_action, _target_type, v_id, COALESCE(_details->>'code', _target_id), _details, NULL::text);
END; $$;