-- Existing plans without a title get "<service> · Semanal / Quinzenal / A cada N semanas".
update public.recurrence_plans p
set name = s.name || ' · ' || case p.interval_weeks when 1 then 'Semanal' when 2 then 'Quinzenal' else 'A cada ' || p.interval_weeks || ' semanas' end
from public.services s
where s.id = p.service_id and (p.name is null or btrim(p.name) = '');

alter table public.recurrence_plans alter column name set not null;
alter table public.recurrence_plans add constraint recurrence_plans_name_not_blank check (btrim(name) <> '' and char_length(name) <= 60);

create or replace function public.save_recurrence_plan(
  target_plan_id uuid, target_service_id uuid, target_interval_weeks integer, target_price_cents integer, target_name text, target_active boolean
)
returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  svc_shop uuid;
begin
  select shop_id into svc_shop from public.services where id = target_service_id;
  if svc_shop is null or not public.is_shop_owner(svc_shop) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if target_name is null or btrim(target_name) = '' then
    raise exception using errcode = 'P0034', message = 'RECURRENCE_PLAN_NAME_REQUIRED';
  end if;
  if target_interval_weeks is null or target_interval_weeks not between 1 and 12 or target_price_cents is null or target_price_cents < 0 then
    raise exception using errcode = 'P0032', message = 'RECURRENCE_PRICE_INVALID';
  end if;
  if target_active and exists (
    select 1 from public.recurrence_plans p
    where p.service_id = target_service_id and p.interval_weeks = target_interval_weeks and p.active and p.id is distinct from target_plan_id
  ) then
    raise exception using errcode = 'P0033', message = 'RECURRENCE_PLAN_DUPLICATE';
  end if;

  if target_plan_id is null then
    insert into public.recurrence_plans (shop_id, service_id, name, interval_weeks, price_cents, active)
    values (svc_shop, target_service_id, btrim(target_name), target_interval_weeks, target_price_cents, coalesce(target_active, true));
  else
    update public.recurrence_plans
    set service_id = target_service_id, name = btrim(target_name), interval_weeks = target_interval_weeks,
        price_cents = target_price_cents, active = coalesce(target_active, true)
    where id = target_plan_id and shop_id = svc_shop;
    if not found then
      raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
    end if;
  end if;
end;
$$;
