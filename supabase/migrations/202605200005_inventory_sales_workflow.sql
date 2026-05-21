-- Add minimal inventory and rice sale foundations for trip-centric workflow.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'inventory_item_type') then
    create type inventory_item_type as enum ('paddy', 'rice', 'byproduct');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'inventory_transaction_type') then
    create type inventory_transaction_type as enum ('in', 'out', 'adjustment');
  end if;
end $$;

create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id) on delete restrict,
  trip_id uuid references trips(id) on delete set null,
  type inventory_transaction_type not null default 'in',
  item_type inventory_item_type not null default 'paddy',
  quantity_kg numeric(14, 2) not null,
  transaction_date date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_transactions_non_zero_quantity check (quantity_kg <> 0)
);

create table if not exists trip_sales (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  sale_date date not null default current_date,
  buyer_name text,
  rice_weight_kg numeric(14, 2) not null,
  unit_price numeric(14, 2) not null,
  total_amount numeric(14, 2) not null,
  payment_status payment_status not null default 'unpaid',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_sales_non_negative_amounts check (
    rice_weight_kg >= 0
    and unit_price >= 0
    and total_amount >= 0
  )
);

drop trigger if exists warehouses_set_updated_at on warehouses;
create trigger warehouses_set_updated_at
before update on warehouses
for each row execute function set_updated_at();

drop trigger if exists inventory_transactions_set_updated_at on inventory_transactions;
create trigger inventory_transactions_set_updated_at
before update on inventory_transactions
for each row execute function set_updated_at();

drop trigger if exists trip_sales_set_updated_at on trip_sales;
create trigger trip_sales_set_updated_at
before update on trip_sales
for each row execute function set_updated_at();

create index if not exists inventory_transactions_warehouse_id_idx on inventory_transactions(warehouse_id);
create index if not exists inventory_transactions_trip_id_idx on inventory_transactions(trip_id);
create index if not exists inventory_transactions_transaction_date_idx on inventory_transactions(transaction_date);
create index if not exists trip_sales_trip_id_idx on trip_sales(trip_id);
create index if not exists trip_sales_sale_date_idx on trip_sales(sale_date);

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
    case
      when coalesce(sale_totals.total_revenue, 0) > 0 then coalesce(sale_totals.total_revenue, 0)
      else trips.estimated_revenue
    end
    - (
      coalesce(purchase_totals.total_purchase_amount, 0)
      + coalesce(purchase_totals.total_broker_commission, 0)
      + coalesce(expense_totals.total_expense_amount, 0)
    )
  )::numeric(14, 2) as temporary_profit,
  coalesce(sale_totals.total_sale_kg, 0)::numeric(14, 2) as total_sale_kg,
  coalesce(sale_totals.total_revenue, 0)::numeric(14, 2) as total_revenue
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
  where type <> 'fuel_fee'::trip_expense_type
  group by trip_id
) expense_totals on expense_totals.trip_id = trips.id
left join (
  select
    trip_id,
    sum(rice_weight_kg) as total_sale_kg,
    sum(total_amount) as total_revenue
  from trip_sales
  group by trip_id
) sale_totals on sale_totals.trip_id = trips.id;
