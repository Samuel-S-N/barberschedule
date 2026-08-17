create type public.appointment_status as enum (
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show'
);

alter table public.barbers
add column buffer_minutes integer not null default 0
constraint barbers_buffer_minutes_non_negative check (buffer_minutes >= 0);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  barber_id uuid not null,
  customer_id uuid not null,
  barber_service_id uuid not null references public.barber_services (id) on delete restrict,
  service_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  occupied_until timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  service_name_snapshot text not null,
  service_duration_minutes_snapshot integer not null,
  service_price_cents_snapshot integer not null,
  barber_buffer_minutes_snapshot integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_barber_fk
    foreign key (shop_id, barber_id)
    references public.barbers (shop_id, id)
    on delete restrict,
  constraint appointments_customer_fk
    foreign key (shop_id, customer_id)
    references public.customers (shop_id, id)
    on delete restrict,
  constraint appointments_service_fk
    foreign key (shop_id, service_id)
    references public.services (shop_id, id)
    on delete restrict,
  constraint appointments_valid_service_interval check (starts_at < ends_at),
  constraint appointments_valid_occupied_interval check (ends_at <= occupied_until),
  constraint appointments_service_name_snapshot_not_blank
    check (btrim(service_name_snapshot) <> ''),
  constraint appointments_service_duration_snapshot_positive
    check (service_duration_minutes_snapshot > 0),
  constraint appointments_service_price_snapshot_non_negative
    check (service_price_cents_snapshot >= 0),
  constraint appointments_barber_buffer_snapshot_non_negative
    check (barber_buffer_minutes_snapshot >= 0),
  constraint appointments_active_barber_occupancy exclude using gist (
    barber_id with =,
    tstzrange(starts_at, occupied_until, '[)') with &&
  ) where (status in ('scheduled', 'confirmed'))
);

create index appointments_shop_starts_at_idx
on public.appointments (shop_id, starts_at);

create index appointments_barber_starts_at_idx
on public.appointments (barber_id, starts_at);

create index appointments_customer_starts_at_idx
on public.appointments (customer_id, starts_at);

revoke all on table public.appointments from anon, authenticated;

alter table public.appointments enable row level security;
