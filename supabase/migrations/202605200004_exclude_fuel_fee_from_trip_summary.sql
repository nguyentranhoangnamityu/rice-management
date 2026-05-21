-- Fuel is paid by the boat owner, so fuel_fee must not be counted in trip cost.
-- The enum value is kept for compatibility if a partial migration already added it.

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
  where type <> 'fuel_fee'::trip_expense_type
  group by trip_id
) expense_totals on expense_totals.trip_id = trips.id;
