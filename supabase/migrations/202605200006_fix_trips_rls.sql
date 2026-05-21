-- Allow app roles to perform CRUD on trips when RLS is enabled.
alter table trips enable row level security;

drop policy if exists trips_select_policy on trips;
create policy trips_select_policy
on trips
for select
to public
using (true);

drop policy if exists trips_insert_policy on trips;
create policy trips_insert_policy
on trips
for insert
to public
with check (true);

drop policy if exists trips_update_policy on trips;
create policy trips_update_policy
on trips
for update
to public
using (true)
with check (true);

drop policy if exists trips_delete_policy on trips;
create policy trips_delete_policy
on trips
for delete
to public
using (true);
