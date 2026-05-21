-- Allow app roles to perform CRUD on warehouses and inventory_transactions when RLS is enabled.

alter table warehouses enable row level security;
alter table inventory_transactions enable row level security;

drop policy if exists warehouses_select_policy on warehouses;
create policy warehouses_select_policy on warehouses for select to public using (true);

drop policy if exists warehouses_insert_policy on warehouses;
create policy warehouses_insert_policy on warehouses for insert to public with check (true);

drop policy if exists warehouses_update_policy on warehouses;
create policy warehouses_update_policy on warehouses for update to public using (true) with check (true);

drop policy if exists warehouses_delete_policy on warehouses;
create policy warehouses_delete_policy on warehouses for delete to public using (true);

drop policy if exists inventory_transactions_select_policy on inventory_transactions;
create policy inventory_transactions_select_policy on inventory_transactions for select to public using (true);

drop policy if exists inventory_transactions_insert_policy on inventory_transactions;
create policy inventory_transactions_insert_policy on inventory_transactions for insert to public with check (true);

drop policy if exists inventory_transactions_update_policy on inventory_transactions;
create policy inventory_transactions_update_policy on inventory_transactions for update to public using (true) with check (true);

drop policy if exists inventory_transactions_delete_policy on inventory_transactions;
create policy inventory_transactions_delete_policy on inventory_transactions for delete to public using (true);
