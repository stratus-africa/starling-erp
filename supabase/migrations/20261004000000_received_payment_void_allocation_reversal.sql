-- Keep customer invoice balances correct when a posted received payment is voided.
-- Allocations are accounting application records, not journal entries; voiding
-- the payment removes their active effect and the existing allocation triggers
-- refresh invoice/payment/order status atomically.

DO $$
BEGIN
  IF to_regprocedure('public.void_posted_document(text,uuid,text,text)') IS NOT NULL
     AND to_regprocedure('public.void_posted_document_base(text,uuid,text,text)') IS NULL THEN
    ALTER FUNCTION public.void_posted_document(text, uuid, text, text)
      RENAME TO void_posted_document_base;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_posted_document(
  _entity_type text,
  _entity_id uuid,
  _permission text,
  _reason text DEFAULT 'Document voided and reversed'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', pg_catalog
AS $$
DECLARE
  v_result uuid;
BEGIN
  IF _entity_type = 'payment_received' THEN
    IF NOT public.has_permission(_permission) THEN
      RAISE EXCEPTION 'Not authorized: %', _permission USING ERRCODE = '42501';
    END IF;
    SELECT public.void_posted_document_base(_entity_type, _entity_id, _permission, _reason) INTO v_result;
    UPDATE public.payment_allocations
    SET deleted_at = now()
    WHERE tenant_id = public.current_tenant_id()
      AND payment_id = _entity_id
      AND deleted_at IS NULL;
    RETURN v_result;
  END IF;

  RETURN public.void_posted_document_base(_entity_type, _entity_id, _permission, _reason);
END;
$$;

REVOKE ALL ON FUNCTION public.void_posted_document_base(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_posted_document(text, uuid, text, text) TO authenticated;
