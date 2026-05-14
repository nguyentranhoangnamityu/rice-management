-- Initial schema for Rice Management MVP.

create extension if not exists pgcrypto;

create type factory_type as enum ('drying', 'milling', 'drying_milling');
create type processing_service_type as enum ('drying', 'milling');
create type payment_status as enum ('unpaid', 'partial', 'paid');
create type debt_type as enum ('broker_commission', 'transport', 'processing');
create type debt_party_type as enum ('broker', 'transporter_boat', 'factory');
create type debt_source_type as enum ('purchase_item', 'transport_trip', 'processing_record');
create type payment_type as enum ('farmer_payment', 'debt_payment');
create type payment_method as enum ('bank_transfer', 'cash');
create type transport_price_basis as enum ('loaded_weight', 'unloaded_weight', 'fixed');
create type attachment_type as enum (
  'citizen_id',
  'authorization_letter',
  'transfer_receipt',
  'transport_receipt',
  'processing_receipt',
  'pdf_export',
  'excel_export',
  'other'
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  from_date date,
  to_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_valid_date_range
    check (to_date is null or from_date is null or to_date >= from_date)
);

create table rice_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table farmers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  citizen_id text,
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  address text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table brokers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transporter_boats (
  id uuid primary key default gen_random_uuid(),
  boat_name text not null,
  owner_name text,
  phone text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table factories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type factory_type not null,
  phone text,
  address text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table authorization_letters (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete restrict,
  broker_id uuid not null references brokers(id) on delete restrict,
  signed_date date,
  valid_from date,
  valid_to date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authorization_letters_valid_date_range
    check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table purchase_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  season_id uuid references seasons(id) on delete restrict,
  from_date date not null,
  to_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_batches_valid_date_range check (to_date >= from_date)
);

create table transport_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transport_route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references transport_routes(id) on delete cascade,
  stop_order integer not null,
  location_name text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_route_stops_positive_order check (stop_order > 0),
  constraint transport_route_stops_unique_order unique (route_id, stop_order)
);

create table transport_trips (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  transporter_boat_id uuid not null references transporter_boats(id) on delete restrict,
  route_id uuid not null references transport_routes(id) on delete restrict,
  factory_id uuid references factories(id) on delete restrict,
  season_id uuid references seasons(id) on delete restrict,
  rice_type_id uuid not null references rice_types(id) on delete restrict,
  trip_date date not null,
  loaded_weight_kg numeric(14, 2) not null default 0,
  unloaded_weight_kg numeric(14, 2) not null default 0,
  loss_weight_kg numeric(14, 2) not null default 0,
  loss_percent numeric(8, 4) not null default 0,
  transport_price_basis transport_price_basis not null default 'unloaded_weight',
  transport_price numeric(14, 2) not null default 0,
  transport_cost numeric(14, 2) not null default 0,
  fuel_fee numeric(14, 2) not null default 0,
  labor_fee numeric(14, 2) not null default 0,
  weighing_fee numeric(14, 2) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  payment_status payment_status not null default 'unpaid',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_trips_non_negative_amounts check (
    loaded_weight_kg >= 0
    and unloaded_weight_kg >= 0
    and loss_weight_kg >= 0
    and loss_percent >= 0
    and transport_price >= 0
    and transport_cost >= 0
    and fuel_fee >= 0
    and labor_fee >= 0
    and weighing_fee >= 0
    and total_cost >= 0
  )
);

create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_batch_id uuid not null references purchase_batches(id) on delete restrict,
  farmer_id uuid not null references farmers(id) on delete restrict,
  broker_id uuid not null references brokers(id) on delete restrict,
  authorization_letter_id uuid references authorization_letters(id) on delete restrict,
  transport_trip_id uuid references transport_trips(id) on delete set null,
  rice_type_id uuid not null references rice_types(id) on delete restrict,
  weight_kg numeric(14, 2) not null,
  unit_price numeric(14, 2) not null,
  total_amount numeric(14, 2) not null default 0,
  broker_commission_per_kg numeric(14, 2) not null default 0,
  broker_commission_total numeric(14, 2) not null default 0,
  farmer_payment_status payment_status not null default 'unpaid',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_items_non_negative_amounts check (
    weight_kg >= 0
    and unit_price >= 0
    and total_amount >= 0
    and broker_commission_per_kg >= 0
    and broker_commission_total >= 0
  )
);

create table processing_price_books (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id) on delete cascade,
  season_id uuid not null references seasons(id) on delete restrict,
  service_type processing_service_type not null,
  rice_type_id uuid not null references rice_types(id) on delete restrict,
  unit_price numeric(14, 2) not null,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint processing_price_books_non_negative_price check (unit_price >= 0),
  constraint processing_price_books_valid_date_range
    check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create table processing_records (
  id uuid primary key default gen_random_uuid(),
  transport_trip_id uuid not null references transport_trips(id) on delete restrict,
  factory_id uuid not null references factories(id) on delete restrict,
  season_id uuid references seasons(id) on delete restrict,
  service_type processing_service_type not null,
  rice_type_id uuid not null references rice_types(id) on delete restrict,
  input_weight_kg numeric(14, 2) not null default 0,
  output_weight_kg numeric(14, 2) not null default 0,
  loss_weight_kg numeric(14, 2) not null default 0,
  loss_percent numeric(8, 4) not null default 0,
  unit_price numeric(14, 2) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  payment_status payment_status not null default 'unpaid',
  processed_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint processing_records_non_negative_amounts check (
    input_weight_kg >= 0
    and output_weight_kg >= 0
    and loss_weight_kg >= 0
    and loss_percent >= 0
    and unit_price >= 0
    and total_cost >= 0
  )
);

create table debts (
  id uuid primary key default gen_random_uuid(),
  debt_type debt_type not null,
  party_type debt_party_type not null,
  party_id uuid not null,
  source_type debt_source_type not null,
  source_id uuid not null,
  season_id uuid references seasons(id) on delete restrict,
  amount numeric(14, 2) not null,
  paid_amount numeric(14, 2) not null default 0,
  remaining_amount numeric(14, 2) not null default 0,
  status payment_status not null default 'unpaid',
  due_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debts_non_negative_amounts check (
    amount >= 0
    and paid_amount >= 0
    and remaining_amount >= 0
    and paid_amount <= amount
  ),
  constraint debts_type_matches_source check (
    (debt_type = 'broker_commission' and source_type = 'purchase_item')
    or (debt_type = 'transport' and source_type = 'transport_trip')
    or (debt_type = 'processing' and source_type = 'processing_record')
  )
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  payment_type payment_type not null,
  farmer_id uuid references farmers(id) on delete restrict,
  broker_id uuid references brokers(id) on delete restrict,
  transporter_boat_id uuid references transporter_boats(id) on delete restrict,
  factory_id uuid references factories(id) on delete restrict,
  debt_id uuid references debts(id) on delete restrict,
  purchase_item_id uuid references purchase_items(id) on delete restrict,
  amount numeric(14, 2) not null,
  paid_date date not null,
  method payment_method not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_positive_amount check (amount > 0),
  constraint payments_valid_target check (
    (payment_type = 'farmer_payment' and farmer_id is not null and purchase_item_id is not null and debt_id is null)
    or (payment_type = 'debt_payment' and debt_id is not null)
  )
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid references farmers(id) on delete cascade,
  authorization_letter_id uuid references authorization_letters(id) on delete cascade,
  purchase_batch_id uuid references purchase_batches(id) on delete cascade,
  purchase_item_id uuid references purchase_items(id) on delete cascade,
  transport_trip_id uuid references transport_trips(id) on delete cascade,
  processing_record_id uuid references processing_records(id) on delete cascade,
  payment_id uuid references payments(id) on delete cascade,
  debt_id uuid references debts(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size integer,
  type attachment_type not null default 'other',
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attachments_non_negative_file_size check (file_size is null or file_size >= 0),
  constraint attachments_exactly_one_parent check (
    num_nonnulls(
      farmer_id,
      authorization_letter_id,
      purchase_batch_id,
      purchase_item_id,
      transport_trip_id,
      processing_record_id,
      payment_id,
      debt_id
    ) = 1
  )
);

create trigger seasons_set_updated_at
before update on seasons
for each row execute function set_updated_at();

create trigger rice_types_set_updated_at
before update on rice_types
for each row execute function set_updated_at();

create trigger farmers_set_updated_at
before update on farmers
for each row execute function set_updated_at();

create trigger brokers_set_updated_at
before update on brokers
for each row execute function set_updated_at();

create trigger transporter_boats_set_updated_at
before update on transporter_boats
for each row execute function set_updated_at();

create trigger factories_set_updated_at
before update on factories
for each row execute function set_updated_at();

create trigger authorization_letters_set_updated_at
before update on authorization_letters
for each row execute function set_updated_at();

create trigger purchase_batches_set_updated_at
before update on purchase_batches
for each row execute function set_updated_at();

create trigger transport_routes_set_updated_at
before update on transport_routes
for each row execute function set_updated_at();

create trigger transport_route_stops_set_updated_at
before update on transport_route_stops
for each row execute function set_updated_at();

create trigger transport_trips_set_updated_at
before update on transport_trips
for each row execute function set_updated_at();

create trigger purchase_items_set_updated_at
before update on purchase_items
for each row execute function set_updated_at();

create trigger processing_price_books_set_updated_at
before update on processing_price_books
for each row execute function set_updated_at();

create trigger processing_records_set_updated_at
before update on processing_records
for each row execute function set_updated_at();

create trigger debts_set_updated_at
before update on debts
for each row execute function set_updated_at();

create trigger payments_set_updated_at
before update on payments
for each row execute function set_updated_at();

create trigger attachments_set_updated_at
before update on attachments
for each row execute function set_updated_at();

create index authorization_letters_farmer_id_idx on authorization_letters(farmer_id);
create index authorization_letters_broker_id_idx on authorization_letters(broker_id);

create index purchase_batches_season_id_idx on purchase_batches(season_id);
create index purchase_batches_date_range_idx on purchase_batches(from_date, to_date);

create index transport_route_stops_route_id_idx on transport_route_stops(route_id);

create index transport_trips_transporter_boat_id_idx on transport_trips(transporter_boat_id);
create index transport_trips_route_id_idx on transport_trips(route_id);
create index transport_trips_factory_id_idx on transport_trips(factory_id);
create index transport_trips_season_id_idx on transport_trips(season_id);
create index transport_trips_rice_type_id_idx on transport_trips(rice_type_id);
create index transport_trips_trip_date_idx on transport_trips(trip_date);

create index purchase_items_purchase_batch_id_idx on purchase_items(purchase_batch_id);
create index purchase_items_farmer_id_idx on purchase_items(farmer_id);
create index purchase_items_broker_id_idx on purchase_items(broker_id);
create index purchase_items_authorization_letter_id_idx on purchase_items(authorization_letter_id);
create index purchase_items_transport_trip_id_idx on purchase_items(transport_trip_id);
create index purchase_items_rice_type_id_idx on purchase_items(rice_type_id);

create index processing_price_books_factory_id_idx on processing_price_books(factory_id);
create index processing_price_books_season_id_idx on processing_price_books(season_id);
create index processing_price_books_rice_type_id_idx on processing_price_books(rice_type_id);
create index processing_price_books_lookup_idx
  on processing_price_books(factory_id, season_id, service_type, rice_type_id);

create index processing_records_transport_trip_id_idx on processing_records(transport_trip_id);
create index processing_records_factory_id_idx on processing_records(factory_id);
create index processing_records_season_id_idx on processing_records(season_id);
create index processing_records_rice_type_id_idx on processing_records(rice_type_id);
create index processing_records_processed_date_idx on processing_records(processed_date);

create index debts_party_idx on debts(party_type, party_id);
create index debts_source_idx on debts(source_type, source_id);
create index debts_season_id_idx on debts(season_id);
create index debts_status_idx on debts(status);

create index payments_farmer_id_idx on payments(farmer_id);
create index payments_broker_id_idx on payments(broker_id);
create index payments_transporter_boat_id_idx on payments(transporter_boat_id);
create index payments_factory_id_idx on payments(factory_id);
create index payments_debt_id_idx on payments(debt_id);
create index payments_purchase_item_id_idx on payments(purchase_item_id);
create index payments_paid_date_idx on payments(paid_date);

create index attachments_farmer_id_idx on attachments(farmer_id);
create index attachments_authorization_letter_id_idx on attachments(authorization_letter_id);
create index attachments_purchase_batch_id_idx on attachments(purchase_batch_id);
create index attachments_purchase_item_id_idx on attachments(purchase_item_id);
create index attachments_transport_trip_id_idx on attachments(transport_trip_id);
create index attachments_processing_record_id_idx on attachments(processing_record_id);
create index attachments_payment_id_idx on attachments(payment_id);
create index attachments_debt_id_idx on attachments(debt_id);
