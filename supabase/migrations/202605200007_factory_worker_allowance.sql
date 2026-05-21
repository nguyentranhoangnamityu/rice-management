-- Add configurable worker allowance per kg for each factory.
alter table factories
  add column if not exists worker_allowance_per_kg numeric(14, 2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'factories_worker_allowance_non_negative'
  ) then
    alter table factories
      add constraint factories_worker_allowance_non_negative
      check (worker_allowance_per_kg >= 0);
  end if;
end $$;
