-- Farmer STT (unique) and receipt sequence for delivery receipts.

alter table public.farmers
  add column if not exists stt integer;

with numbered_farmers as (
  select
    id,
    row_number() over (order by created_at asc, id asc) as next_stt
  from public.farmers
)
update public.farmers as farmers
set stt = numbered_farmers.next_stt
from numbered_farmers
where farmers.id = numbered_farmers.id
  and farmers.stt is null;

alter table public.farmers
  alter column stt set not null;

create unique index if not exists farmers_stt_idx on public.farmers(stt);

create or replace function public.assign_farmer_stt()
returns trigger
language plpgsql
as $$
begin
  if new.stt is null then
    select coalesce(max(stt), 0) + 1
    into new.stt
    from public.farmers;
  end if;

  return new;
end;
$$;

drop trigger if exists farmers_assign_stt on public.farmers;
create trigger farmers_assign_stt
before insert on public.farmers
for each row
execute function public.assign_farmer_stt();

alter table public.purchase_slips
  add column if not exists receipt_sequence integer;

with missing_contract_sequence as (
  select
    id,
    row_number() over (
      partition by farmer_id
      order by purchase_date asc, created_at asc, id asc
    ) as next_contract_sequence
  from public.purchase_slips
  where contract_sequence is null
)
update public.purchase_slips as slips
set contract_sequence = missing_contract_sequence.next_contract_sequence
from missing_contract_sequence
where slips.id = missing_contract_sequence.id;

with numbered_receipts as (
  select
    id,
    row_number() over (
      partition by extract(year from purchase_date)
      order by purchase_date asc, created_at asc, id asc
    ) as next_receipt_sequence
  from public.purchase_slips
)
update public.purchase_slips as slips
set receipt_sequence = numbered_receipts.next_receipt_sequence
from numbered_receipts
where slips.id = numbered_receipts.id
  and slips.receipt_sequence is null;

alter table public.purchase_slips
  alter column receipt_sequence set not null;

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
    where extract(year from purchase_date) = extract(year from new.purchase_date);
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_slips_assign_sequences on public.purchase_slips;
create trigger purchase_slips_assign_sequences
before insert on public.purchase_slips
for each row
execute function public.assign_purchase_slip_sequences();
