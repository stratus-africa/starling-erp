-- Tenant invitation provisioning regression tests.
-- The harness must provide fixture IDs and authenticated request claims:
--   test.provisioning.owner_id, owner_email, tenant_id, employee_id,
--   employee_email, second_employee_id, second_employee_email,
--   other_tenant_user_id, other_tenant_email, expired_user_id, expired_email,
--   wrong_user_id, wrong_email.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(20);

SELECT ok(has_table('public', 'tenant_invitations'), 'invitation table exists');
SELECT ok(has_function('public', 'create_tenant_invitation', ARRAY['text', 'public.app_role', 'integer']), 'admin invitation RPC exists');
SELECT ok(has_function('public', 'accept_tenant_invitation', ARRAY['text']), 'acceptance RPC exists');
SELECT ok(has_function('public', 'claim_tenant_invitation', ARRAY['text', 'uuid', 'text', 'text']), 'server-side claim helper exists');
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant_invitations'
      AND policyname = 'tenant_invitations_admin_read'
  ),
  'invitations are protected by tenant-scoped RLS'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.provisioning.owner_id'), true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.provisioning.owner_id'),
    'email', current_setting('test.provisioning.owner_email')
  )::text,
  true
);

CREATE TEMP TABLE invitation_fixture(token text, invited_email text, invitation_id uuid);
INSERT INTO invitation_fixture(token, invited_email, invitation_id)
SELECT invitation_token, current_setting('test.provisioning.employee_email'), invitation_id
FROM public.create_tenant_invitation(
  current_setting('test.provisioning.employee_email'),
  'viewer'::public.app_role,
  72
);

SELECT ok((SELECT count(*) = 1 FROM invitation_fixture), 'first employee invitation is created');

SELECT throws_ok(
  format(
    $$SELECT * FROM public.create_tenant_invitation(%L, 'viewer'::public.app_role, 72)$$,
    current_setting('test.provisioning.employee_email')
  ),
  '23505', NULL, 'duplicate active invitation is rejected'
);

SELECT lives_ok(
  format(
    $$SELECT public.claim_tenant_invitation(%L, %L::uuid, %L, 'First Employee')$$,
    (SELECT token FROM invitation_fixture),
    current_setting('test.provisioning.employee_id'),
    current_setting('test.provisioning.employee_email')
  ),
  'first employee accepts invitation'
);

SELECT is(
  (SELECT tenant_id::text FROM public.profiles WHERE id = current_setting('test.provisioning.employee_id')::uuid),
  current_setting('test.provisioning.tenant_id'),
  'accepted employee attaches to the inviting tenant'
);

SELECT is(
  (SELECT count(*)::text FROM public.tenants WHERE id = current_setting('test.provisioning.tenant_id')::uuid),
  '1',
  'acceptance does not create a duplicate tenant'
);

CREATE TEMP TABLE second_invitation_fixture(token text, invitation_id uuid);
INSERT INTO second_invitation_fixture(token, invitation_id)
SELECT invitation_token, invitation_id
FROM public.create_tenant_invitation(
  current_setting('test.provisioning.second_employee_email'),
  'sales'::public.app_role,
  72
);

SELECT ok((SELECT count(*) = 1 FROM second_invitation_fixture), 'multiple employees can be invited');

SELECT throws_ok(
  format(
    $$SELECT * FROM public.create_tenant_invitation(%L, 'sales'::public.app_role, 72)$$,
    current_setting('test.provisioning.second_employee_email')
  ),
  '23505', NULL, 'duplicate active invitation is rejected'
);

SELECT lives_ok(
  format(
    $$SELECT public.claim_tenant_invitation(%L, %L::uuid, %L, 'Second Employee')$$,
    (SELECT token FROM second_invitation_fixture),
    current_setting('test.provisioning.second_employee_id'),
    current_setting('test.provisioning.second_employee_email')
  ),
  'second employee accepts a separate invitation'
);

SELECT throws_ok(
  format(
    $$SELECT public.claim_tenant_invitation(%L, %L::uuid, %L, 'Second Employee Again')$$,
    (SELECT token FROM second_invitation_fixture),
    current_setting('test.provisioning.second_employee_id'),
    current_setting('test.provisioning.second_employee_email')
  ),
  '22023', NULL, 'already accepted invitation cannot be reused'
);

CREATE TEMP TABLE expired_invitation_fixture(token text, invitation_id uuid);
INSERT INTO expired_invitation_fixture(token, invitation_id)
SELECT invitation_token, invitation_id
FROM public.create_tenant_invitation(
  current_setting('test.provisioning.expired_email'),
  'viewer'::public.app_role,
  1
);
UPDATE public.tenant_invitations
SET expires_at = now() - interval '1 minute'
WHERE id = (SELECT invitation_id FROM expired_invitation_fixture);

SELECT throws_ok(
  format(
    $$SELECT public.claim_tenant_invitation(%L, %L::uuid, %L, 'Expired User')$$,
    (SELECT token FROM expired_invitation_fixture),
    current_setting('test.provisioning.expired_user_id'),
    current_setting('test.provisioning.expired_email')
  ),
  '22023', NULL, 'expired invitation is rejected'
);

CREATE TEMP TABLE wrong_user_invitation_fixture(token text, invitation_id uuid);
INSERT INTO wrong_user_invitation_fixture(token, invitation_id)
SELECT invitation_token, invitation_id
FROM public.create_tenant_invitation(
  current_setting('test.provisioning.wrong_email'),
  'viewer'::public.app_role,
  72
);

SELECT throws_ok(
  format(
    $$SELECT public.claim_tenant_invitation(%L, %L::uuid, %L, 'Wrong User')$$,
    (SELECT token FROM wrong_user_invitation_fixture),
    current_setting('test.provisioning.wrong_user_id'),
    current_setting('test.provisioning.employee_email')
  ),
  '42501', NULL, 'wrong authenticated email cannot accept invitation'
);

CREATE TEMP TABLE cross_tenant_invitation_fixture(token text, invitation_id uuid);
INSERT INTO cross_tenant_invitation_fixture(token, invitation_id)
SELECT invitation_token, invitation_id
FROM public.create_tenant_invitation(
  current_setting('test.provisioning.other_tenant_email'),
  'viewer'::public.app_role,
  72
);

SELECT throws_ok(
  format(
    $$SELECT public.claim_tenant_invitation(%L, %L::uuid, %L, 'Other Tenant User')$$,
    (SELECT token FROM cross_tenant_invitation_fixture),
    current_setting('test.provisioning.other_tenant_user_id'),
    current_setting('test.provisioning.other_tenant_email')
  ),
  '42501', NULL, 'user already belonging to another tenant cannot accept'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_setting('test.provisioning.employee_id')::uuid
      AND tenant_id <> current_setting('test.provisioning.tenant_id')::uuid
  ),
  'accepted employee has no cross-tenant role'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.tenant_invitations
    WHERE id = (SELECT invitation_id FROM invitation_fixture)
      AND accepted_at IS NOT NULL
      AND accepted_user_id = current_setting('test.provisioning.employee_id')::uuid
  ),
  'accepted invitation records the accepting user'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'handle_new_user'
      AND pg_get_functiondef(p.oid) ILIKE '%invitation_token%'
      AND pg_get_functiondef(p.oid) ILIKE '%claim_tenant_invitation%'
  ),
  'new-user trigger distinguishes invited signup from new-firm signup'
);

SELECT * FROM finish();
ROLLBACK;
