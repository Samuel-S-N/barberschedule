alter table public.shops
  add column address text,
  add column phone text,
  add column whatsapp text,
  add constraint shops_address_len check (address is null or char_length(address) <= 200),
  add constraint shops_phone_len check (phone is null or char_length(phone) <= 30),
  add constraint shops_whatsapp_len check (whatsapp is null or char_length(whatsapp) <= 30);

grant select (address, phone, whatsapp) on table public.shops to anon, authenticated;
grant update (address, phone, whatsapp) on table public.shops to authenticated;

-- Weekly opening hours. A break (lunch or any other pause) is a gap between two periods of the same weekday.
create table public.shop_hours (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  constraint shop_hours_weekday_valid check (weekday between 1 and 7),
  constraint shop_hours_valid_interval check (start_time < end_time),
  constraint shop_hours_no_overlap exclude using gist (
    shop_id with =,
    weekday with =,
    tsrange(timestamp '2000-01-03' + start_time, timestamp '2000-01-03' + end_time, '[)') with &&
  )
);

revoke all on table public.shop_hours from anon, authenticated;
grant select on table public.shop_hours to anon, authenticated;
alter table public.shop_hours enable row level security;
create policy "shop_hours_select_public" on public.shop_hours for select to anon, authenticated using (true);

create function public.set_shop_hours(p_periods jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  target_shop uuid;
  item jsonb;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select id into target_shop from public.shops where owner_user_id = actor;
  if target_shop is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if jsonb_typeof(coalesce(p_periods, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0023', message = 'SHOP_HOURS_INVALID';
  end if;

  delete from public.shop_hours where shop_id = target_shop;
  for item in select * from jsonb_array_elements(p_periods) loop
    begin
      insert into public.shop_hours (shop_id, weekday, start_time, end_time)
      values (target_shop, (item ->> 'weekday')::smallint, (item ->> 'start')::time, (item ->> 'end')::time);
    exception when check_violation or exclusion_violation or not_null_violation
      or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = 'P0023', message = 'SHOP_HOURS_INVALID';
    end;
  end loop;
end;
$$;

revoke all on function public.set_shop_hours(jsonb) from public;
grant execute on function public.set_shop_hours(jsonb) to authenticated;
