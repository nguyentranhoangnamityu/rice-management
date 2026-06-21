-- Support historical Excel purchases and individual payment authorization recipients.

alter table public.farmers
  add column if not exists import_identity_key text;

create unique index if not exists farmers_import_identity_key_idx
  on public.farmers(import_identity_key)
  where import_identity_key is not null;

create table if not exists public.authorized_recipients (
  id uuid primary key default gen_random_uuid(),
  import_identity_key text,
  name text not null,
  citizen_id text,
  address text,
  date_of_birth date,
  citizen_id_issued_date date,
  citizen_id_issued_place text,
  bank_account_number text,
  bank_name text,
  bank_account_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists authorized_recipients_import_identity_key_idx
  on public.authorized_recipients(import_identity_key)
  where import_identity_key is not null;

drop trigger if exists authorized_recipients_set_updated_at on public.authorized_recipients;
create trigger authorized_recipients_set_updated_at
before update on public.authorized_recipients
for each row execute function public.set_updated_at();

alter table public.purchase_slips
  alter column season_id drop not null,
  alter column broker_id drop not null,
  add column if not exists authorized_recipient_id uuid
    references public.authorized_recipients(id) on delete restrict,
  add column if not exists contract_sequence integer,
  add column if not exists source_import_key text,
  add column if not exists source_row_number integer,
  add column if not exists source_unit text,
  add column if not exists farmer_bank_account_number_snapshot text,
  add column if not exists farmer_bank_name_snapshot text,
  add column if not exists authorized_person_name_snapshot text,
  add column if not exists authorized_person_citizen_id_snapshot text,
  add column if not exists authorized_person_address_snapshot text,
  add column if not exists authorized_person_bank_account_number_snapshot text,
  add column if not exists authorized_person_bank_name_snapshot text;

create unique index if not exists purchase_slips_source_import_key_idx
  on public.purchase_slips(source_import_key)
  where source_import_key is not null;

create index if not exists purchase_slips_authorized_recipient_id_idx
  on public.purchase_slips(authorized_recipient_id);

alter table public.authorization_letters
  add column if not exists authorized_recipient_id uuid
    references public.authorized_recipients(id) on delete restrict,
  add column if not exists source_import_key text;

create unique index if not exists authorization_letters_source_import_key_idx
  on public.authorization_letters(source_import_key)
  where source_import_key is not null;

create index if not exists authorization_letters_authorized_recipient_id_idx
  on public.authorization_letters(authorized_recipient_id);

alter table public.authorized_recipients enable row level security;

drop policy if exists "authenticated full access" on public.authorized_recipients;
create policy "authenticated full access"
on public.authorized_recipients
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on table public.authorized_recipients to authenticated;

create table if not exists public.purchase_import_audits (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  source_rows integer not null,
  imported_farmers integer not null,
  imported_authorized_recipients integer not null,
  imported_purchase_slips integer not null,
  total_weight_kg numeric(16, 2) not null,
  total_amount numeric(18, 2) not null,
  imported_at timestamptz not null default now(),
  constraint purchase_import_audits_source_file_key unique (source_file)
);

alter table public.purchase_import_audits enable row level security;

drop policy if exists "authenticated read access" on public.purchase_import_audits;
create policy "authenticated read access"
on public.purchase_import_audits
for select
to authenticated
using (true);

grant select on table public.purchase_import_audits to authenticated;
