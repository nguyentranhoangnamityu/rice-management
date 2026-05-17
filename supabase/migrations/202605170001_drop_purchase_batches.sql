-- Remove legacy đợt mua / purchase_items flow. App uses purchase_slips only.

delete from attachments
where purchase_batch_id is not null
   or purchase_item_id is not null;

delete from payments
where purchase_item_id is not null;

delete from debts
where source_type = 'purchase_item';

drop table if exists purchase_items cascade;
drop table if exists purchase_batches cascade;

-- attachments: link to phiếu mua instead of đợt mua / dòng mua
alter table attachments drop constraint if exists attachments_exactly_one_parent;

alter table attachments drop column if exists purchase_batch_id;
alter table attachments drop column if exists purchase_item_id;

alter table attachments
  add column purchase_slip_id uuid references purchase_slips(id) on delete cascade;

alter table attachments add constraint attachments_exactly_one_parent check (
  num_nonnulls(
    farmer_id,
    authorization_letter_id,
    purchase_slip_id,
    transport_trip_id,
    processing_record_id,
    payment_id,
    debt_id
  ) = 1
);

create index if not exists attachments_purchase_slip_id_idx on attachments(purchase_slip_id);

-- payments: farmer payment tied to phiếu mua
alter table payments drop constraint if exists payments_valid_target;

alter table payments drop column if exists purchase_item_id;

alter table payments
  add column purchase_slip_id uuid references purchase_slips(id) on delete restrict;

create index if not exists payments_purchase_slip_id_idx on payments(purchase_slip_id);

alter table payments add constraint payments_valid_target check (
  (payment_type = 'farmer_payment' and farmer_id is not null and purchase_slip_id is not null and debt_id is null)
  or (payment_type = 'debt_payment' and debt_id is not null)
);

-- debts source enum (if any legacy rows remain, already deleted above)
alter type debt_source_type rename value 'purchase_item' to 'purchase_slip';

alter table debts drop constraint if exists debts_type_matches_source;

alter table debts add constraint debts_type_matches_source check (
  (debt_type = 'broker_commission' and source_type = 'purchase_slip')
  or (debt_type = 'transport' and source_type = 'transport_trip')
  or (debt_type = 'processing' and source_type = 'processing_record')
);
