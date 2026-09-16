-- Tenant-bound user provisioning.
-- A signup without an invitation creates a new firm. An invited signup or
-- authenticated acceptance attaches to the invitation's existing tenant.

CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'viewer',
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_invitations_email_check CHECK (length(trim(invited_email)) > 3),
  CONSTRAINT tenant_invitations_role_check CHECK (role <> 'super_admin'::public.app_role)
);

CREATE INDEX IF NOT EXISTS tenant_invitations_tenant_idx
  ON public.tenant_invitations (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_invitations_email_idx
  ON public.tenant_invitations (lower(invited_email), expires_at)
  WHERE accepted_at IS NULL;

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_invitations_admin_read ON public.tenant_invitations;
CREATE POLICY tenant_invitations_admin_read
  ON public.tenant_invitations FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.has_permission('settings.users')
  );
GRANT SELECT ON public.tenant_invitations TO authenticated;
GRANT ALL ON public.tenant_invitations TO service_role;

CREATE OR REPLACE FUNCTION public.claim_tenant_invitation(
  _token text,
  _user_id uuid,
  _email text,
  _full_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_invitation public.tenant_invitations;
  v_existing_tenant uuid;
  v_email text := lower(trim(_email));
BEGIN
  IF NULLIF(trim(_token), '') IS NULL THEN
    RAISE EXCEPTION 'Invitation token is required' USING ERRCODE = '22023';
  END IF;
  IF _user_id IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user identity is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invitation
  FROM public.tenant_invitations
  WHERE token_hash = encode(extensions.digest(trim(_token), 'sha256'), 'hex')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been accepted' USING ERRCODE = '22023';
  END IF;
  IF v_invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;
  IF lower(trim(v_invitation.invited_email)) <> v_email THEN
    RAISE EXCEPTION 'Invitation email does not match the authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_existing_tenant
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF v_existing_tenant IS NOT NULL AND v_existing_tenant <> v_invitation.tenant_id THEN
    RAISE EXCEPTION 'User already belongs to another tenant' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND tenant_id IS NOT NULL
      AND tenant_id <> v_invitation.tenant_id
  ) THEN
    RAISE EXCEPTION 'User already has membership in another tenant' USING ERRCODE = '42501';
  END IF;

  IF v_existing_tenant IS NULL THEN
    UPDATE public.profiles
    SET tenant_id = v_invitation.tenant_id,
        email = COALESCE(email, v_email),
        full_name = COALESCE(full_name, _full_name),
        updated_at = now()
    WHERE id = _user_id;

    IF NOT FOUND THEN
      INSERT INTO public.profiles (id, tenant_id, email, full_name)
      VALUES (_user_id, v_invitation.tenant_id, v_email, _full_name);
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (_user_id, v_invitation.tenant_id, v_invitation.role)
  ON CONFLICT DO NOTHING;

  UPDATE public.tenant_invitations
  SET accepted_at = now(), accepted_user_id = _user_id
  WHERE id = v_invitation.id;

  RETURN v_invitation.tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_invitation(
  _email text,
  _role public.app_role DEFAULT 'viewer',
  _expires_in_hours integer DEFAULT 72
)
RETURNS TABLE (
  invitation_id uuid,
  invitation_token text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := public.current_tenant_id();
  v_email text := lower(trim(_email));
  v_token text;
  v_expires timestamptz;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active tenant' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('settings.users') THEN
    RAISE EXCEPTION 'User administration permission required' USING ERRCODE = '42501';
  END IF;
  IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'A valid invitation email is required' USING ERRCODE = '22023';
  END IF;
  IF _role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'Platform roles cannot be invited as tenant roles' USING ERRCODE = '22023';
  END IF;
  IF _expires_in_hours < 1 OR _expires_in_hours > 720 THEN
    RAISE EXCEPTION 'Invitation expiry must be between 1 and 720 hours' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_invitations
    WHERE tenant_id = v_tenant_id
      AND lower(invited_email) = v_email
      AND accepted_at IS NULL
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'An active invitation already exists for this email' USING ERRCODE = '23505';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(hours => _expires_in_hours);

  INSERT INTO public.tenant_invitations (
    tenant_id, invited_email, role, token_hash, invited_by, expires_at
  ) VALUES (
    v_tenant_id, v_email, _role,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_expires
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_token, v_expires;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(auth.jwt()->>'email'));
  v_full_name text := auth.jwt()->'user_metadata'->>'full_name';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN public.claim_tenant_invitation(_token, v_user_id, v_email, v_full_name);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_tenant_invitation(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_tenant_invitation(text, public.app_role, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_tenant_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_invitation(text, public.app_role, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(text) TO authenticated;

-- The auth trigger remains the owner-signup path, but invited signups claim the
-- existing tenant before the owner initialization branch can create anything.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invitation_token text := NULLIF(NEW.raw_user_meta_data->>'invitation_token', '');
  new_tenant_id uuid;
  tenant_name text;
  tenant_slug text;
  output_vat_id uuid;
  input_vat_id uuid;
BEGIN
  IF v_invitation_token IS NOT NULL THEN
    PERFORM public.claim_tenant_invitation(
      v_invitation_token,
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name'
    );
    RETURN NEW;
  END IF;

  tenant_name := COALESCE(NEW.raw_user_meta_data->>'company', split_part(NEW.email,'@',1) || '''s Workspace');
  tenant_slug := lower(regexp_replace(tenant_name || '-' || substr(NEW.id::text,1,8),'[^a-z0-9]+','-','g'));

  INSERT INTO public.tenants (name, slug)
  VALUES (tenant_name, tenant_slug)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, email, full_name)
  VALUES (NEW.id, new_tenant_id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'tenant_admin');

  INSERT INTO public.chart_of_accounts
    (tenant_id, code, name, type, normal_balance, is_system, allow_manual_posting, description, created_by)
  VALUES
    (new_tenant_id,'1000','Cash','Asset','Debit',true,true,'Primary cash and cash-equivalent account',NEW.id),
    (new_tenant_id,'1100','Accounts Receivable','Asset','Debit',true,false,'Amounts owed by customers',NEW.id),
    (new_tenant_id,'1150','Input VAT','Asset','Debit',true,false,'Recoverable VAT paid on purchases',NEW.id),
    (new_tenant_id,'1200','Inventory','Asset','Debit',true,false,'Stock held for sale',NEW.id),
    (new_tenant_id,'1300','Work in Progress','Asset','Debit',true,false,'Partially completed production costs',NEW.id),
    (new_tenant_id,'2000','Accounts Payable','Liability','Credit',true,false,'Amounts owed to suppliers',NEW.id),
    (new_tenant_id,'2100','Output VAT','Liability','Credit',true,false,'VAT collected from customers',NEW.id),
    (new_tenant_id,'3000','Owner Equity','Equity','Credit',true,false,'Owner or shareholder equity',NEW.id),
    (new_tenant_id,'4000','Sales Revenue','Income','Credit',true,false,'Revenue from primary business operations',NEW.id),
    (new_tenant_id,'5000','Cost of Goods Sold','Expense','Debit',true,true,'Direct cost of products sold',NEW.id),
    (new_tenant_id,'6000','Operating Expenses','Expense','Debit',true,true,'Overhead and indirect operating costs',NEW.id);

  SELECT id INTO output_vat_id FROM public.chart_of_accounts WHERE tenant_id = new_tenant_id AND code = '2100';
  SELECT id INTO input_vat_id FROM public.chart_of_accounts WHERE tenant_id = new_tenant_id AND code = '1150';

  INSERT INTO public.tax_rates
    (tenant_id, name, code, rate, tax_type, is_inclusive, is_default, description, output_account_id, input_account_id, created_by)
  VALUES
    (new_tenant_id,'VAT 16%','VAT16',16.0000,'Output',false,true,'Standard VAT rate',output_vat_id,input_vat_id,NEW.id),
    (new_tenant_id,'VAT 8%','VAT8',8.0000,'Output',false,false,'Reduced VAT rate',output_vat_id,input_vat_id,NEW.id),
    (new_tenant_id,'VAT Exempt','VATEX',0.0000,'Exempt',false,false,'Zero-rated or exempt',NULL,NULL,NEW.id);

  INSERT INTO public.accounting_periods (tenant_id, period_start, period_end, period_name, status)
  SELECT new_tenant_id, gs::date, (gs + interval '1 month - 1 day')::date,
         to_char(gs, 'YYYY-MM'), 'Open'
  FROM generate_series(
    date_trunc('month', CURRENT_DATE)::date,
    (date_trunc('month', CURRENT_DATE) + interval '11 months')::date,
    interval '1 month'
  ) gs;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_tenant_invitation(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
