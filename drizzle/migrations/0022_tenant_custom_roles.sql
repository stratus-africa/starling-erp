CREATE TABLE public.tenant_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  label text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role_key)
);
GRANT SELECT ON public.tenant_custom_roles TO authenticated;
GRANT ALL ON public.tenant_custom_roles TO service_role;
ALTER TABLE public.tenant_custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read custom roles" ON public.tenant_custom_roles FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE TABLE public.tenant_user_custom_roles (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES public.tenant_custom_roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
GRANT SELECT ON public.tenant_user_custom_roles TO authenticated;
GRANT ALL ON public.tenant_user_custom_roles TO service_role;
ALTER TABLE public.tenant_user_custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read custom role assignments" ON public.tenant_user_custom_roles FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE OR REPLACE FUNCTION public._assert_tenant_admin() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v uuid := public.current_tenant_id();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF v IS NULL THEN RAISE EXCEPTION 'No active workspace' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_super_admin() OR public.has_role(auth.uid(),'tenant_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.save_custom_role(_id uuid, _label text, _description text, _copy_from text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_t uuid := public._assert_tenant_admin(); v_id uuid; v_key text;
BEGIN
  IF coalesce(trim(_label),'') = '' THEN RAISE EXCEPTION 'Role name is required' USING ERRCODE='22023'; END IF;
  IF length(trim(_label)) > 60 THEN RAISE EXCEPTION 'Role name must be 60 characters or fewer' USING ERRCODE='22023'; END IF;
  IF _id IS NULL THEN
    v_key := 'custom_' || substr(replace(gen_random_uuid()::text,'-',''),1,10);
    INSERT INTO public.tenant_custom_roles(tenant_id, role_key, label, description, created_by)
    VALUES (v_t, v_key, trim(_label), nullif(trim(_description),''), auth.uid()) RETURNING id INTO v_id;
    IF _copy_from IS NOT NULL THEN
      INSERT INTO public.tenant_role_permission_overrides(tenant_id, role, permission_code, enabled, updated_by)
      SELECT v_t, v_key, p.code, true, auth.uid() FROM public.permissions p
      WHERE _copy_from = 'tenant_admin'
         OR COALESCE((SELECT o.enabled FROM public.tenant_role_permission_overrides o WHERE o.tenant_id=v_t AND o.role=_copy_from AND o.permission_code=p.code),
                     EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role=_copy_from AND rp.permission_code=p.code));
    END IF;
  ELSE
    UPDATE public.tenant_custom_roles SET label=trim(_label), description=nullif(trim(_description),''), updated_at=now()
    WHERE id=_id AND tenant_id=v_t RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Role not found' USING ERRCODE='P0002'; END IF;
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'A role with that name already exists' USING ERRCODE='23505';
END $$;

CREATE OR REPLACE FUNCTION public.delete_custom_role(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_t uuid := public._assert_tenant_admin(); v_key text;
BEGIN
  DELETE FROM public.tenant_custom_roles WHERE id=_id AND tenant_id=v_t RETURNING role_key INTO v_key;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Role not found' USING ERRCODE='P0002'; END IF;
  DELETE FROM public.tenant_role_permission_overrides WHERE tenant_id=v_t AND role=v_key;
END $$;

CREATE OR REPLACE FUNCTION public.set_user_custom_roles(_user_id uuid, _role_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_t uuid := public._assert_tenant_admin();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=_user_id AND tenant_id=v_t) THEN
    RAISE EXCEPTION 'User is not in this workspace' USING ERRCODE='42501'; END IF;
  DELETE FROM public.tenant_user_custom_roles WHERE user_id=_user_id AND tenant_id=v_t;
  INSERT INTO public.tenant_user_custom_roles(tenant_id,user_id,role_id)
  SELECT v_t, _user_id, r.id FROM public.tenant_custom_roles r WHERE r.tenant_id=v_t AND r.id = ANY(coalesce(_role_ids,'{}'));
END $$;

CREATE OR REPLACE FUNCTION public.set_role_permission_override(_role text, _permission_code text, _enabled boolean)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_tenant_id uuid := public._assert_tenant_admin();
BEGIN
  IF _role NOT IN ('sales','purchasing','inventory','accounting','manufacturing','viewer','accountant','finance_clerk','auditor')
     AND NOT EXISTS (SELECT 1 FROM public.tenant_custom_roles WHERE tenant_id=v_tenant_id AND role_key=_role) THEN
    RAISE EXCEPTION 'This role cannot be customized' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE code = _permission_code) THEN
    RAISE EXCEPTION 'Unknown permission' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tenant_role_permission_overrides (tenant_id, role, permission_code, enabled, updated_by, updated_at)
  VALUES (v_tenant_id, _role, _permission_code, _enabled, auth.uid(), now())
  ON CONFLICT (tenant_id, role, permission_code)
  DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(_permission text, _user_id uuid DEFAULT auth.uid())
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT (auth.uid() IS NULL OR _user_id IS NULL OR _user_id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = COALESCE(_user_id, auth.uid())
          AND ur.tenant_id = public.current_tenant_id()
          AND (ur.role IN ('tenant_admin'::public.app_role)
            OR COALESCE(
              (SELECT o.enabled FROM public.tenant_role_permission_overrides o
               WHERE o.tenant_id = ur.tenant_id AND o.role = ur.role::text AND o.permission_code = _permission),
              EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role = ur.role::text AND rp.permission_code = _permission))))
      OR EXISTS (
        SELECT 1 FROM public.tenant_user_custom_roles uc
        JOIN public.tenant_custom_roles cr ON cr.id = uc.role_id
        JOIN public.tenant_role_permission_overrides o ON o.tenant_id = cr.tenant_id AND o.role = cr.role_key
        WHERE uc.user_id = COALESCE(_user_id, auth.uid()) AND uc.tenant_id = public.current_tenant_id()
          AND o.permission_code = _permission AND o.enabled)
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
 RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT p.code ORDER BY p.code), ARRAY[]::text[])
  FROM public.permissions p
  WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = public.current_tenant_id()
      AND ur.role IN ('super_admin'::public.app_role, 'tenant_admin'::public.app_role))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = public.current_tenant_id()
      AND COALESCE(
        (SELECT o.enabled FROM public.tenant_role_permission_overrides o WHERE o.tenant_id = ur.tenant_id AND o.role = ur.role::text AND o.permission_code = p.code),
        EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role = ur.role::text AND rp.permission_code = p.code)))
  OR EXISTS (SELECT 1 FROM public.tenant_user_custom_roles uc
      JOIN public.tenant_custom_roles cr ON cr.id = uc.role_id
      JOIN public.tenant_role_permission_overrides o ON o.tenant_id = cr.tenant_id AND o.role = cr.role_key
      WHERE uc.user_id = auth.uid() AND uc.tenant_id = public.current_tenant_id() AND o.permission_code = p.code AND o.enabled);
$function$;

REVOKE EXECUTE ON FUNCTION public._assert_tenant_admin(), public.save_custom_role(uuid,text,text,text), public.delete_custom_role(uuid), public.set_user_custom_roles(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_tenant_admin(), public.save_custom_role(uuid,text,text,text), public.delete_custom_role(uuid), public.set_user_custom_roles(uuid,uuid[]) TO authenticated, service_role;