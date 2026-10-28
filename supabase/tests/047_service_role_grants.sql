begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b4700000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't47-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b4700000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't47-invited@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'b4700000-0000-0000-0000-000000000001';
insert into public.shops (id, name, owner_user_id, timezone)
values ('b4710000-0000-0000-0000-000000000001', 'T47 Shop', 'b4700000-0000-0000-0000-000000000001', 'America/Sao_Paulo');
insert into public.barbers (id, shop_id, name)
values ('b4720000-0000-0000-0000-000000000001', 'b4710000-0000-0000-0000-000000000001', 'T47 Invited');

-- invite-barber talks to PostgREST with the service-role key: it reads the barber row, links the invited account and
-- promotes its profile. New tables only give service_role TRUNCATE/REFERENCES/TRIGGER by default, so grant what it uses.
set local role service_role;

select is(
  (select active from public.barbers where id = 'b4720000-0000-0000-0000-000000000001'),
  true,
  'the service role reads the barber row'
);
select lives_ok(
  $$ update public.barbers set user_id = 'b4700000-0000-0000-0000-000000000002', invited_at = now()
     where id = 'b4720000-0000-0000-0000-000000000001' and user_id is null $$,
  'the service role links the invited account'
);
select lives_ok(
  $$ update public.profiles set role = 'barber' where user_id = 'b4700000-0000-0000-0000-000000000002' $$,
  'the service role promotes the invited profile'
);
select is(
  (select user_id from public.barbers where id = 'b4720000-0000-0000-0000-000000000001'),
  'b4700000-0000-0000-0000-000000000002'::uuid,
  'the barber row now points at the invited account'
);

reset role;

-- Only what the invite needs: no other barber column and no profile column besides role.
select ok(
  not has_column_privilege('service_role', 'public.barbers', 'commission_percent', 'UPDATE'),
  'the service role cannot change a commission'
);
select ok(
  not has_column_privilege('service_role', 'public.profiles', 'full_name', 'UPDATE'),
  'the service role cannot rename a profile'
);

select * from finish();
rollback;
