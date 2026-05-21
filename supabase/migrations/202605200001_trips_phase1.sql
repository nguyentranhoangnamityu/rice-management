-- Phase 1: introduce Chuyen hang as a parent entity for purchase slips.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trip_status') then
    create type trip_status as enum (
      'draft',
      'purchasing',
      'loaded_to_boat',
      'drying',
      'milling',
      'ready_to_sell',
      'selling',
      'completed',
      'cancelled'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trip_expense_type') then
    create type trip_expense_type as enum (
      'loi_cost',
      'rice_carrying_labor',
      'boat_cost',
      'boat_unloading',
      'worker_allowance',
      'drying_cost',
      'milling_cost',
      'warehouse_loading',
      'transport_cost',
      'other'
    );
  end if;
end $$;

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status trip_status not null default 'draft',
  season_id uuid references seasons(id) on delete restrict,
  rice_type_id uuid references rice_types(id) on delete restrict,
  start_date date,
  end_date date,
  estimated_revenue numeric(14, 2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_valid_date_range check (end_date is null or start_date is null or end_date >= start_date),
  constraint trips_non_negative_revenue check (estimated_revenue >= 0)
);

create table if not exists trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  type trip_expense_type not null,
  description text,
  amount numeric(14, 2) not null,
  expense_date date,
  payment_status payment_status not null default 'unpaid',
  party_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_expenses_non_negative_amount check (amount >= 0)
);

alter table purchase_slips
  add column if not exists trip_id uuid references trips(id) on delete set null;

drop trigger if exists trips_set_updated_at on trips;

create trigger trips_set_updated_at
before update on trips
for each row execute function set_updated_at();

drop trigger if exists trip_expenses_set_updated_at on trip_expenses;

create trigger trip_expenses_set_updated_at
before update on trip_expenses
for each row execute function set_updated_at();

create index if not exists trips_status_idx on trips(status);
create index if not exists trips_season_id_idx on trips(season_id);
create index if not exists trips_rice_type_id_idx on trips(rice_type_id);
create index if not exists trips_start_date_idx on trips(start_date);
create index if not exists trip_expenses_trip_id_idx on trip_expenses(trip_id);
create index if not exists trip_expenses_type_idx on trip_expenses(type);
create index if not exists trip_expenses_payment_status_idx on trip_expenses(payment_status);
create index if not exists purchase_slips_trip_id_idx on purchase_slips(trip_id);

create or replace view trip_summaries as
select
  trips.id as trip_id,
  coalesce(purchase_totals.total_purchase_kg, 0)::numeric(14, 2) as total_purchase_kg,
  coalesce(purchase_totals.total_purchase_amount, 0)::numeric(14, 2) as total_purchase_amount,
  coalesce(purchase_totals.total_broker_commission, 0)::numeric(14, 2) as total_broker_commission,
  coalesce(expense_totals.total_expense_amount, 0)::numeric(14, 2) as total_expense_amount,
  (
    coalesce(purchase_totals.total_purchase_amount, 0)
    + coalesce(purchase_totals.total_broker_commission, 0)
    + coalesce(expense_totals.total_expense_amount, 0)
  )::numeric(14, 2) as temporary_total_cost,
  case
    when coalesce(purchase_totals.total_purchase_kg, 0) > 0 then
      (
        coalesce(purchase_totals.total_purchase_amount, 0)
        + coalesce(purchase_totals.total_broker_commission, 0)
        + coalesce(expense_totals.total_expense_amount, 0)
      ) / purchase_totals.total_purchase_kg
    else null
  end::numeric(14, 2) as temporary_cost_per_kg,
  trips.estimated_revenue::numeric(14, 2) as estimated_revenue,
  (
    trips.estimated_revenue
    - (
      coalesce(purchase_totals.total_purchase_amount, 0)
      + coalesce(purchase_totals.total_broker_commission, 0)
      + coalesce(expense_totals.total_expense_amount, 0)
    )
  )::numeric(14, 2) as temporary_profit
from trips
left join (
  select
    trip_id,
    sum(weight_kg) as total_purchase_kg,
    sum(total_amount) as total_purchase_amount,
    sum(broker_commission_total) as total_broker_commission
  from purchase_slips
  where trip_id is not null
  group by trip_id
) purchase_totals on purchase_totals.trip_id = trips.id
left join (
  select
    trip_id,
    sum(amount) as total_expense_amount
  from trip_expenses
  group by trip_id
) expense_totals on expense_totals.trip_id = trips.id;
