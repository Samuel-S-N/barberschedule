create type public.schedule_override_kind as enum ('block', 'opening');

create table public.working_periods (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  barber_id uuid not null,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint working_periods_barber_fk
    foreign key (shop_id, barber_id)
    references public.barbers (shop_id, id)
    on delete restrict,
  constraint working_periods_weekday_valid check (weekday between 1 and 7),
  constraint working_periods_valid_interval check (start_time < end_time),
  constraint working_periods_no_duplicate unique (shop_id, barber_id, weekday, start_time, end_time),
  constraint working_periods_no_overlap exclude using gist (
    barber_id with =,
    weekday with =,
    tsrange(
      timestamp '2000-01-03' + start_time,
      timestamp '2000-01-03' + end_time,
      '[)'
    ) with &&
  )
);

create table public.schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  barber_id uuid not null,
  local_date date not null,
  kind public.schedule_override_kind not null,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  constraint schedule_overrides_barber_fk
    foreign key (shop_id, barber_id)
    references public.barbers (shop_id, id)
    on delete restrict,
  constraint schedule_overrides_valid_interval check (
    (kind = 'block' and start_time is null and end_time is null)
    or (
      start_time is not null
      and end_time is not null
      and start_time < end_time
    )
  )
);

revoke all on table public.working_periods from anon, authenticated;
revoke all on table public.schedule_overrides from anon, authenticated;
grant select, insert, delete on table public.working_periods to authenticated;
grant select, insert, delete on table public.schedule_overrides to authenticated;

alter table public.working_periods enable row level security;
alter table public.schedule_overrides enable row level security;

create policy "working_periods_select_owner"
on public.working_periods
for select
to authenticated
using (public.is_shop_owner(shop_id));

create policy "working_periods_insert_owner"
on public.working_periods
for insert
to authenticated
with check (public.is_shop_owner(shop_id));

create policy "working_periods_delete_owner"
on public.working_periods
for delete
to authenticated
using (public.is_shop_owner(shop_id));

create policy "schedule_overrides_select_owner"
on public.schedule_overrides
for select
to authenticated
using (public.is_shop_owner(shop_id));

create policy "schedule_overrides_insert_owner"
on public.schedule_overrides
for insert
to authenticated
with check (public.is_shop_owner(shop_id));

create policy "schedule_overrides_delete_owner"
on public.schedule_overrides
for delete
to authenticated
using (public.is_shop_owner(shop_id));
