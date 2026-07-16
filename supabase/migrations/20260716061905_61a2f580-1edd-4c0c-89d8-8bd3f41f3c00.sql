
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_order_to_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_payment(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._account_id(uuid, text) FROM PUBLIC;
