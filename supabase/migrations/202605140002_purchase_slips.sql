-- Add purchase slips for the refactored purchase flow.
-- Existing purchase_batches and purchase_items tables are intentionally kept.

create table purchase_slips (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete restrict,
  farmer_id uuid not null references farmers(id) on delete restrict,
  broker_id uuid not null references brokers(id) on delete restrict,
  transport_trip_id uuid references transport_trips(id) on delete set null,
  rice_type_id uuid not null references rice_types(id) on delete restrict,
  authorization_letter_id uuid references authorization_letters(id) on delete restrict,
  authorized_receiver_broker_id uuid references brokers(id) on delete restrict,
  purchase_date date not null,
  weight_kg numeric(14, 2) not null,
  unit_price numeric(14, 2) not null,
  total_amount numeric(14, 2) not null default 0,
  broker_commission_per_kg numeric(14, 2) not null default 0,
  broker_commission_total numeric(14, 2) not null default 0,
  payment_status payment_status not null default 'unpaid',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_slips_non_negative_amounts check (
    weight_kg >= 0
    and unit_price >= 0
    and total_amount >= 0
    and broker_commission_per_kg >= 0
    and broker_commission_total >= 0
  )
);

create table purchase_slip_attachments (
  id uuid primary key default gen_random_uuid(),
  purchase_slip_id uuid not null references purchase_slips(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size integer,
  type attachment_type not null default 'other',
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_slip_attachments_non_negative_file_size
    check (file_size is null or file_size >= 0)
);

create trigger purchase_slips_set_updated_at
before update on purchase_slips
for each row execute function set_updated_at();

create trigger purchase_slip_attachments_set_updated_at
before update on purchase_slip_attachments
for each row execute function set_updated_at();

create index purchase_slips_season_id_idx on purchase_slips(season_id);
create index purchase_slips_farmer_id_idx on purchase_slips(farmer_id);
create index purchase_slips_broker_id_idx on purchase_slips(broker_id);
create index purchase_slips_transport_trip_id_idx on purchase_slips(transport_trip_id);
create index purchase_slips_rice_type_id_idx on purchase_slips(rice_type_id);
create index purchase_slips_authorization_letter_id_idx on purchase_slips(authorization_letter_id);
create index purchase_slips_authorized_receiver_broker_id_idx
  on purchase_slips(authorized_receiver_broker_id);
create index purchase_slips_purchase_date_idx on purchase_slips(purchase_date);
create index purchase_slips_payment_status_idx on purchase_slips(payment_status);

create index purchase_slip_attachments_purchase_slip_id_idx
  on purchase_slip_attachments(purchase_slip_id);
