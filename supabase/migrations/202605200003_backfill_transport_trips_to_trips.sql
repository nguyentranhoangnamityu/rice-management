-- Phase 1 adjustment: use trips as the only operational trip entity.
-- transport_trips is kept for audit/rollback, but data is copied into trips.

alter table trips
  add column if not exists legacy_transport_trip_id uuid references transport_trips(id) on delete set null;

alter table trips
  add column if not exists transporter_boat_id uuid references transporter_boats(id) on delete restrict;

alter table trips
  add column if not exists route_id uuid references transport_routes(id) on delete restrict;

alter table trips
  add column if not exists factory_id uuid references factories(id) on delete restrict;

alter table trips
  add column if not exists loaded_weight_kg numeric(14, 2) not null default 0;

alter table trips
  add column if not exists unloaded_weight_kg numeric(14, 2) not null default 0;

alter table trips
  add column if not exists loss_weight_kg numeric(14, 2) not null default 0;

alter table trips
  add column if not exists loss_percent numeric(8, 4) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_non_negative_transport_amounts'
      and conrelid = 'trips'::regclass
  ) then
    alter table trips add constraint trips_non_negative_transport_amounts check (
      loaded_weight_kg >= 0
      and unloaded_weight_kg >= 0
      and loss_weight_kg >= 0
      and loss_percent >= 0
    );
  end if;
end $$;

alter table attachments
  add column if not exists trip_id uuid references trips(id) on delete cascade;

alter table processing_records
  add column if not exists trip_id uuid references trips(id) on delete restrict;

alter table processing_records
  alter column transport_trip_id drop not null;

insert into trips (
  code,
  status,
  season_id,
  rice_type_id,
  start_date,
  transporter_boat_id,
  route_id,
  factory_id,
  loaded_weight_kg,
  unloaded_weight_kg,
  loss_weight_kg,
  loss_percent,
  legacy_transport_trip_id,
  note
)
select
  transport_trips.code,
  case
    when transport_trips.unloaded_weight_kg > 0 then 'loaded_to_boat'::trip_status
    else 'purchasing'::trip_status
  end,
  transport_trips.season_id,
  transport_trips.rice_type_id,
  transport_trips.trip_date,
  transport_trips.transporter_boat_id,
  transport_trips.route_id,
  transport_trips.factory_id,
  transport_trips.loaded_weight_kg,
  transport_trips.unloaded_weight_kg,
  transport_trips.loss_weight_kg,
  transport_trips.loss_percent,
  transport_trips.id,
  transport_trips.note
from transport_trips
on conflict (code) do update set
  season_id = coalesce(trips.season_id, excluded.season_id),
  rice_type_id = coalesce(trips.rice_type_id, excluded.rice_type_id),
  start_date = coalesce(trips.start_date, excluded.start_date),
  transporter_boat_id = excluded.transporter_boat_id,
  route_id = excluded.route_id,
  factory_id = excluded.factory_id,
  loaded_weight_kg = excluded.loaded_weight_kg,
  unloaded_weight_kg = excluded.unloaded_weight_kg,
  loss_weight_kg = excluded.loss_weight_kg,
  loss_percent = excluded.loss_percent,
  legacy_transport_trip_id = excluded.legacy_transport_trip_id;

update purchase_slips
set trip_id = trips.id
from trips
where purchase_slips.trip_id is null
  and purchase_slips.transport_trip_id = trips.legacy_transport_trip_id;

update attachments
set
  trip_id = trips.id,
  transport_trip_id = null
from trips
where attachments.trip_id is null
  and attachments.transport_trip_id = trips.legacy_transport_trip_id;

update processing_records
set
  trip_id = trips.id,
  transport_trip_id = null
from trips
where processing_records.trip_id is null
  and processing_records.transport_trip_id = trips.legacy_transport_trip_id;

insert into trip_expenses (trip_id, type, description, amount, expense_date, payment_status, party_name, note)
select
  trips.id,
  'transport_cost'::trip_expense_type,
  'Backfill từ chuyến ghe: tiền vận chuyển',
  transport_trips.transport_cost,
  transport_trips.trip_date,
  transport_trips.payment_status,
  transporter_boats.boat_name,
  transport_trips.note
from transport_trips
join trips on trips.legacy_transport_trip_id = transport_trips.id
left join transporter_boats on transporter_boats.id = transport_trips.transporter_boat_id
where transport_trips.transport_cost > 0
  and not exists (
    select 1
    from trip_expenses
    where trip_expenses.trip_id = trips.id
      and trip_expenses.type = 'transport_cost'
      and trip_expenses.description = 'Backfill từ chuyến ghe: tiền vận chuyển'
  );

insert into trip_expenses (trip_id, type, description, amount, expense_date, payment_status, party_name, note)
select
  trips.id,
  'rice_carrying_labor'::trip_expense_type,
  'Backfill từ chuyến ghe: tiền công',
  transport_trips.labor_fee,
  transport_trips.trip_date,
  transport_trips.payment_status,
  transporter_boats.boat_name,
  transport_trips.note
from transport_trips
join trips on trips.legacy_transport_trip_id = transport_trips.id
left join transporter_boats on transporter_boats.id = transport_trips.transporter_boat_id
where transport_trips.labor_fee > 0
  and not exists (
    select 1
    from trip_expenses
    where trip_expenses.trip_id = trips.id
      and trip_expenses.type = 'rice_carrying_labor'
      and trip_expenses.description = 'Backfill từ chuyến ghe: tiền công'
  );

insert into trip_expenses (trip_id, type, description, amount, expense_date, payment_status, party_name, note)
select
  trips.id,
  'weighing_fee'::trip_expense_type,
  'Backfill từ chuyến ghe: tiền cân',
  transport_trips.weighing_fee,
  transport_trips.trip_date,
  transport_trips.payment_status,
  transporter_boats.boat_name,
  transport_trips.note
from transport_trips
join trips on trips.legacy_transport_trip_id = transport_trips.id
left join transporter_boats on transporter_boats.id = transport_trips.transporter_boat_id
where transport_trips.weighing_fee > 0
  and not exists (
    select 1
    from trip_expenses
    where trip_expenses.trip_id = trips.id
      and trip_expenses.type = 'weighing_fee'
      and trip_expenses.description = 'Backfill từ chuyến ghe: tiền cân'
  );

alter table attachments drop constraint if exists attachments_exactly_one_parent;

alter table attachments add constraint attachments_exactly_one_parent check (
  num_nonnulls(
    farmer_id,
    authorization_letter_id,
    purchase_slip_id,
    trip_id,
    transport_trip_id,
    processing_record_id,
    payment_id,
    debt_id
  ) = 1
);

create unique index if not exists trips_legacy_transport_trip_id_idx
  on trips(legacy_transport_trip_id)
  where legacy_transport_trip_id is not null;

create index if not exists trips_transporter_boat_id_idx on trips(transporter_boat_id);
create index if not exists trips_route_id_idx on trips(route_id);
create index if not exists trips_factory_id_idx on trips(factory_id);
create index if not exists trips_legacy_transport_trip_id_lookup_idx on trips(legacy_transport_trip_id);
create index if not exists attachments_trip_id_idx on attachments(trip_id);
create index if not exists processing_records_trip_id_idx on processing_records(trip_id);
