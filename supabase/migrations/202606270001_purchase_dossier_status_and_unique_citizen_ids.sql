-- Track downloaded purchase dossiers and keep seeded identity records unique.

alter table public.purchase_slips
  add column if not exists dossier_downloaded_at timestamptz;

create index if not exists purchase_slips_dossier_downloaded_at_idx
  on public.purchase_slips(dossier_downloaded_at);

create unique index if not exists farmers_citizen_id_unique_idx
  on public.farmers(citizen_id)
  where citizen_id is not null and btrim(citizen_id) <> '';

create unique index if not exists authorized_recipients_citizen_id_unique_idx
  on public.authorized_recipients(citizen_id)
  where citizen_id is not null and btrim(citizen_id) <> '';
