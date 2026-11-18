begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't49-owner1@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't49-owner2@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id in ('f9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000002');

insert into public.shops (id, name, owner_user_id)
values
  ('f9100000-0000-0000-0000-000000000001', 'T49 Shop One', 'f9000000-0000-0000-0000-000000000001'),
  ('f9100000-0000-0000-0000-000000000002', 'T49 Shop Two', 'f9000000-0000-0000-0000-000000000002');

select matches(
  (select slug from public.shops where id = 'f9100000-0000-0000-0000-000000000001'),
  '^shop-[0-9a-f]{8}$',
  'a shop inserted without a slug gets a generated one'
);

select throws_ok($$ update public.shops set slug = 'ab' where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, 'too short is rejected');
select throws_ok($$ update public.shops set slug = 'Has-Caps' where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, 'uppercase is rejected');
select throws_ok($$ update public.shops set slug = '-leading' where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, 'a leading hyphen is rejected');
select throws_ok($$ update public.shops set slug = 'trailing-' where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, 'a trailing hyphen is rejected');
select throws_ok($$ update public.shops set slug = repeat('a', 33) where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, '33 characters is rejected');
select throws_ok($$ update public.shops set slug = 'www' where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, 'a reserved name is rejected');

select lives_ok($$ update public.shops set slug = 'barbeariadojoao' where id = 'f9100000-0000-0000-0000-000000000001' $$, 'a valid slug is accepted');
select throws_ok($$ update public.shops set slug = 'barbeariadojoao' where id = 'f9100000-0000-0000-0000-000000000002' $$, '23505', null, 'a slug is unique');

set local role anon;
select results_eq(
  $$ select slug from public.shops where id = 'f9100000-0000-0000-0000-000000000001' $$,
  $$ values ('barbeariadojoao'::text) $$,
  'anonymous visitors can read the slug'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ update public.shops set slug = 'mudei-o-slug' where id = 'f9100000-0000-0000-0000-000000000001' $$, '42501', null, 'the owner cannot change the slug');
reset role;

select * from finish();
rollback;
