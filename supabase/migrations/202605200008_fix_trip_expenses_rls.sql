-- Allow app roles to perform CRUD on trip_expenses when RLS is enabled.
alter table trip_expenses enable row level security;

drop policy if exists trip_expenses_select_policy on trip_expenses;
create policy trip_expenses_select_policy
on trip_expenses
for select
to public
using (true);

drop policy if exists trip_expenses_insert_policy on trip_expenses;
create policy trip_expenses_insert_policy
on trip_expenses
for insert
to public
with check (true);

drop policy if exists trip_expenses_update_policy on trip_expenses;
create policy trip_expenses_update_policy
on trip_expenses
for update
to public
using (true)
with check (true);

drop policy if exists trip_expenses_delete_policy on trip_expenses;
create policy trip_expenses_delete_policy
on trip_expenses
for delete
to public
using (true);
