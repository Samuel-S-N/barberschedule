create type public.recurrence_exception_kind as enum ('cancelled');
create type public.recurrence_conflict_status as enum ('open', 'resolved');

alter table public.barber_services
add constraint barber_services_shop_id_id_key unique (shop_id, id);

create table public.recurrence_series (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  customer_id uuid not null,
  barber_service_id uuid not null,
  local_start_date date not null,
  local_start_time time not null,
  interval_weeks smallint not null,
  special_price_cents integer,
  ends_on date,
  active boolean not null default true,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrence_series_customer_fk
    foreign key (shop_id, customer_id)
    references public.customers (shop_id, id)
    on delete restrict,
  constraint recurrence_series_barber_service_fk
    foreign key (shop_id, barber_service_id)
    references public.barber_services (shop_id, id)
    on delete restrict,
  constraint recurrence_series_interval_weeks_positive check (interval_weeks > 0),
  constraint recurrence_series_special_price_non_negative
    check (special_price_cents is null or special_price_cents >= 0),
  constraint recurrence_series_end_not_before_start
    check (ends_on is null or ends_on >= local_start_date),
  constraint recurrence_series_end_state
    check ((active and ended_at is null) or ((not active) and ended_at is not null))
);

alter table public.appointments
add column recurrence_series_id uuid references public.recurrence_series (id) on delete restrict,
add column recurrence_occurrence_date date;

alter table public.appointments
add constraint appointments_recurrence_identity_valid check (
  (source = 'recurrence' and recurrence_series_id is not null and recurrence_occurrence_date is not null)
  or (source <> 'recurrence' and recurrence_series_id is null and recurrence_occurrence_date is null)
);

create unique index appointments_recurrence_occurrence_key
on public.appointments (recurrence_series_id, recurrence_occurrence_date)
where recurrence_series_id is not null;

create table public.recurrence_exceptions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.recurrence_series (id) on delete restrict,
  occurrence_date date not null,
  kind public.recurrence_exception_kind not null default 'cancelled',
  created_at timestamptz not null default now(),
  constraint recurrence_exceptions_series_occurrence_key unique (series_id, occurrence_date)
);

create table public.recurrence_conflicts (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.recurrence_series (id) on delete restrict,
  occurrence_date date not null,
  reason text not null,
  status public.recurrence_conflict_status not null default 'open',
  resolution_appointment_id uuid references public.appointments (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint recurrence_conflicts_reason_not_blank check (btrim(reason) <> ''),
  constraint recurrence_conflicts_resolution_state check (
    (status = 'open' and resolved_at is null)
    or (status = 'resolved' and resolved_at is not null)
  ),
  constraint recurrence_conflicts_series_occurrence_key unique (series_id, occurrence_date)
);

create index recurrence_series_shop_active_idx
on public.recurrence_series (shop_id, active, local_start_date);

create index recurrence_conflicts_series_status_idx
on public.recurrence_conflicts (series_id, status, occurrence_date);

revoke all on table public.recurrence_series from anon, authenticated;
revoke all on table public.recurrence_exceptions from anon, authenticated;
revoke all on table public.recurrence_conflicts from anon, authenticated;

alter table public.recurrence_series enable row level security;
alter table public.recurrence_exceptions enable row level security;
alter table public.recurrence_conflicts enable row level security;
