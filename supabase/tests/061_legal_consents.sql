begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't61-customer@example.com', 'x', now(), '{"accepted_terms_version":"2026-11-01","accepted_privacy_version":"2026-11-10"}'),
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't61-owner@example.com', 'x', now(), '{}');
update public.profiles set role = 'owner' where user_id = 'fd000000-0000-0000-0000-000000000002';
insert into public.shops (id, name, slug, owner_user_id)
values ('fd100000-0000-0000-0000-000000000001', 'T61 Shop', 'shop-t61', 'fd000000-0000-0000-0000-000000000002');

-- the constraint now allows the three kinds
reset role;
select lives_ok($$ insert into public.consents (user_id, kind, version) values ('fd000000-0000-0000-0000-000000000002', 'business', '2026-11-26') $$, 'business is a valid consent kind');
select throws_ok($$ insert into public.consents (user_id, kind, version) values ('fd000000-0000-0000-0000-000000000002', 'other', '2026-11-26') $$, '23514', null, 'an unknown kind is rejected by the check constraint');
delete from public.consents where user_id = 'fd000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000002', true);

select lives_ok($$ select public.accept_legal_documents('[{"kind":"terms","version":"2026-11-26"},{"kind":"privacy","version":"2026-11-26"},{"kind":"business","version":"2026-11-26"}]'::jsonb) $$, 'an owner accepts all three documents');
select is((select count(*)::int from public.consents where user_id = 'fd000000-0000-0000-0000-000000000002'), 3, 'three consent rows were recorded');
select lives_ok($$ select public.accept_legal_documents('[{"kind":"terms","version":"2026-11-26"}]'::jsonb) $$, 'accepting the same version again is idempotent');
select is((select count(*)::int from public.consents where user_id = 'fd000000-0000-0000-0000-000000000002' and kind = 'terms'), 1, 'no duplicate row');
select throws_ok($$ select public.accept_legal_documents('[{"kind":"cookies","version":"2026-11-26"}]'::jsonb) $$, 'P0046', 'LEGAL_CONSENT_INVALID', 'an unknown kind is rejected');
select throws_ok($$ select public.accept_legal_documents('[{"kind":"terms","version":"  "}]'::jsonb) $$, 'P0046', 'LEGAL_CONSENT_INVALID', 'a blank version is rejected');

select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.accept_legal_documents('[{"kind":"business","version":"2026-11-26"}]'::jsonb) $$, 'P0046', 'LEGAL_CONSENT_INVALID', 'only an owner can accept the business agreement');

-- signup metadata: terms and privacy keep their own versions
select public.ensure_my_customer('fd100000-0000-0000-0000-000000000001');
select is((select version from public.consents where user_id = 'fd000000-0000-0000-0000-000000000001' and kind = 'privacy'), '2026-11-10', 'privacy records accepted_privacy_version');
select is((select version from public.consents where user_id = 'fd000000-0000-0000-0000-000000000001' and kind = 'terms'), '2026-11-01', 'terms records accepted_terms_version');

select * from finish();
rollback;
