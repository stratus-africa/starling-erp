CREATE OR REPLACE FUNCTION public.list_tenant_users(
  _tenant_id uuid,
  _search text DEFAULT NULL,
  _role text DEFAULT NULL,
  _status text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_sign_in_at timestamptz,
  roles text[],
  platform_role text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_platform_permission('platform.users.view')
    OR public.has_platform_permission('platform.users.manage')
    OR public.has_platform_permission('platform.tenants.view')
  ) THEN
    RAISE EXCEPTION 'Workspace user viewing permission required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id) THEN
    RAISE EXCEPTION 'Workspace not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH user_base AS (
    SELECT
      p.id,
      p.email,
      p.full_name,
      p.avatar_url,
      p.phone,
      COALESCE(p.is_active, true) AS is_active,
      p.created_at,
      p.updated_at,
      au.last_sign_in_at,
      COALESCE(
        array_agg(DISTINCT ur.role::text) FILTER (WHERE ur.role IS NOT NULL),
        ARRAY[]::text[]
      ) AS roles,
      max(pa.platform_role) FILTER (
        WHERE pa.is_active = true AND pa.revoked_at IS NULL
      ) AS platform_role
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.id
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id AND ur.tenant_id = _tenant_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = p.id
    WHERE (p.tenant_id = _tenant_id OR ur.tenant_id = _tenant_id)
      AND (
        _search IS NULL
        OR trim(_search) = ''
        OR p.email ILIKE '%' || trim(_search) || '%'
        OR p.full_name ILIKE '%' || trim(_search) || '%'
      )
    GROUP BY p.id, p.email, p.full_name, p.avatar_url, p.phone, p.is_active,
             p.created_at, p.updated_at, au.last_sign_in_at
  ),
  filtered_users AS (
    SELECT *
    FROM user_base ub
    WHERE (_role IS NULL OR _role = 'all' OR _role = ANY(ub.roles))
      AND (
        _status IS NULL OR _status = 'all'
        OR (_status = 'active' AND ub.is_active)
        OR (_status = 'inactive' AND NOT ub.is_active)
      )
  )
  SELECT
    fu.id,
    fu.email,
    fu.full_name,
    fu.avatar_url,
    fu.phone,
    fu.is_active,
    fu.created_at,
    fu.updated_at,
    fu.last_sign_in_at,
    fu.roles,
    fu.platform_role,
    count(*) OVER() AS total_count
  FROM filtered_users fu
  ORDER BY fu.created_at DESC
  LIMIT greatest(1, least(COALESCE(_limit, 50), 200))
  OFFSET greatest(COALESCE(_offset, 0), 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_tenant_users(uuid, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tenant_users(uuid, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_users(uuid, text, text, text, integer, integer) TO service_role;