-- Add the new authorization letter structure without removing legacy fields.

create type authorization_letter_status as enum ('draft', 'active', 'expired', 'cancelled');

alter table authorization_letters
  add column code text,
  add column authorized_receiver_broker_id uuid references brokers(id) on delete restrict,
  add column status authorization_letter_status not null default 'draft',
  add column pdf_attachment_id uuid references attachments(id) on delete set null;

create table authorization_letter_purchase_slips (
  authorization_letter_id uuid not null references authorization_letters(id) on delete cascade,
  purchase_slip_id uuid not null references purchase_slips(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (authorization_letter_id, purchase_slip_id)
);

create unique index authorization_letters_code_idx
  on authorization_letters(code)
  where code is not null;

create index authorization_letters_authorized_receiver_broker_id_idx
  on authorization_letters(authorized_receiver_broker_id);

create index authorization_letters_status_idx
  on authorization_letters(status);

create index authorization_letters_pdf_attachment_id_idx
  on authorization_letters(pdf_attachment_id);

create index authorization_letter_purchase_slips_purchase_slip_id_idx
  on authorization_letter_purchase_slips(purchase_slip_id);
