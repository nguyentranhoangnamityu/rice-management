-- Daily document sequence per purchase_date for contract/receipt codes (YYYYDDMMNN).

with numbered_daily as (
  select
    id,
    row_number() over (
      partition by purchase_date
      order by created_at asc, id asc
    ) as next_daily_sequence
  from public.purchase_slips
)
update public.purchase_slips as slips
set receipt_sequence = numbered_daily.next_daily_sequence
from numbered_daily
where slips.id = numbered_daily.id;

create or replace function public.assign_purchase_slip_sequences()
returns trigger
language plpgsql
as $$
begin
  if new.contract_sequence is null then
    select coalesce(max(contract_sequence), 0) + 1
    into new.contract_sequence
    from public.purchase_slips
    where farmer_id = new.farmer_id;
  end if;

  if new.receipt_sequence is null then
    select coalesce(max(receipt_sequence), 0) + 1
    into new.receipt_sequence
    from public.purchase_slips
    where purchase_date = new.purchase_date;
  end if;

  return new;
end;
$$;
