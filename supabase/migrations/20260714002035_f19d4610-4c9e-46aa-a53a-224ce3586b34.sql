
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Storage policies on attachments bucket: path = <tenant_id>/<entity_type>/<entity_id>/<filename>
CREATE POLICY "tenant read attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND (
    (storage.foldername(name))[1]::uuid = public.current_tenant_id() OR public.is_super_admin()
  ));
CREATE POLICY "tenant upload attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND (
    (storage.foldername(name))[1]::uuid = public.current_tenant_id() OR public.is_super_admin()
  ));
CREATE POLICY "tenant delete attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND (
    (storage.foldername(name))[1]::uuid = public.current_tenant_id() OR public.is_super_admin()
  ));
