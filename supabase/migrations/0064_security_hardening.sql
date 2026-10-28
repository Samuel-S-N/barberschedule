-- Security audit 2026-10-27. Limits mirror the app's Zod schemas, so the app normally refuses first; these
-- constraints hold for callers that skip the app and talk to the API directly.
alter table public.appointments add constraint appointments_notes_length check (notes is null or char_length(notes) <= 500);
alter table public.customers
  add constraint customers_full_name_length check (char_length(full_name) <= 100),
  add constraint customers_email_length check (email is null or char_length(email) <= 254),
  add constraint customers_phone_length check (phone is null or char_length(phone) <= 30);
alter table public.profiles add constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 100);
alter table public.barbers
  add constraint barbers_name_length check (char_length(name) <= 80),
  add constraint barbers_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 500);
alter table public.services
  add constraint services_name_length check (char_length(name) <= 80),
  add constraint services_description_length check (description is null or char_length(description) <= 500);

-- Owners keep table-level insert/update on barbers and customers (rename, archive, serve as a barber), but linking
-- an account belongs to the RPCs (ensure_my_customer, barber_find_or_create_customer) and to invite-barber.
create function public.guard_account_link()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  -- Security definer RPCs run as their owner and invite-barber as the service role, so only direct writes are limited.
  if current_user = 'authenticated'
    and new.user_id is not null
    and new.user_id is distinct from (case when tg_op = 'UPDATE' then old.user_id end)
    and (tg_table_name = 'customers' or new.user_id <> auth.uid())
  then
    raise exception using errcode = '42501', message = 'ACCOUNT_LINK_FORBIDDEN';
  end if;

  return new;
end;
$$;

create trigger barbers_guard_account_link
before insert or update of user_id on public.barbers
for each row execute function public.guard_account_link();

create trigger customers_guard_account_link
before insert or update of user_id on public.customers
for each row execute function public.guard_account_link();
