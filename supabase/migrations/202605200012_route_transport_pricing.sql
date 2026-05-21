-- Store default transport pricing on routes; trips derive transport_cost from route + weights.

alter table transport_routes
  add column if not exists transport_price_basis transport_price_basis not null default 'unloaded_weight';

alter table transport_routes
  add column if not exists transport_price numeric(14, 2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transport_routes_non_negative_transport_price'
      and conrelid = 'transport_routes'::regclass
  ) then
    alter table transport_routes
      add constraint transport_routes_non_negative_transport_price check (transport_price >= 0);
  end if;
end $$;
