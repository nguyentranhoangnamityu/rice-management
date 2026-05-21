-- Allow app roles to perform CRUD on trip_sales when RLS is enabled.
alter table trip_sales enable row level security;

drop policy if exists trip_sales_select_policy on trip_sales;
create policy trip_sales_select_policy
on trip_sales
for select
to public
using (true);

drop policy if exists trip_sales_insert_policy on trip_sales;
create policy trip_sales_insert_policy
on trip_sales
for insert
to public
with check (true);

drop policy if exists trip_sales_update_policy on trip_sales;
create policy trip_sales_update_policy
on trip_sales
for update
to public
using (true)
with check (true);

drop policy if exists trip_sales_delete_policy on trip_sales;
create policy trip_sales_delete_policy
on trip_sales
for delete
to public
using (true);
