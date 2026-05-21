-- Add extra expense types before the backfill migration uses them.

alter type trip_expense_type add value if not exists 'fuel_fee';
alter type trip_expense_type add value if not exists 'weighing_fee';
