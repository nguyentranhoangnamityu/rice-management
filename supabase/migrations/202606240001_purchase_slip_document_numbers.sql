-- Store contract and delivery receipt numbers from source data (Excel).

alter table public.purchase_slips
  add column if not exists contract_no text,
  add column if not exists receipt_no text;

alter table public.purchase_slips
  alter column receipt_sequence drop not null;

drop trigger if exists purchase_slips_assign_sequences on public.purchase_slips;
drop function if exists public.assign_purchase_slip_sequences();

create index if not exists purchase_slips_contract_no_idx on public.purchase_slips(contract_no);
create index if not exists purchase_slips_receipt_no_idx on public.purchase_slips(receipt_no);
