
ALTER TABLE public.journal_entries RENAME COLUMN date TO entry_date;
ALTER TABLE public.journal_entries ALTER COLUMN number DROP NOT NULL;
CREATE SEQUENCE IF NOT EXISTS public.journal_entry_seq;
ALTER TABLE public.journal_entries ALTER COLUMN number SET DEFAULT 'JE-' || lpad(nextval('public.journal_entry_seq')::text, 6, '0');
GRANT USAGE, SELECT ON SEQUENCE public.journal_entry_seq TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_package(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_package(uuid) TO authenticated;
