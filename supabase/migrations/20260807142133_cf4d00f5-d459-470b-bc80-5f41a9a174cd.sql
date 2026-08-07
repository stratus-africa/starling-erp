REVOKE EXECUTE ON FUNCTION public.post_package(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_package(uuid) TO authenticated;