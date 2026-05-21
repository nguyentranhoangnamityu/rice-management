-- Edge Functions use service_role and Auth triggers run as supabase_auth_admin.
-- Both need table/type privileges before RLS/service-role behavior can help.

grant usage on schema public to service_role;
grant all privileges on table public.app_users to service_role;
grant usage on type public.app_role to service_role;
grant usage on type public.app_user_status to service_role;
grant execute on function public.current_app_role() to service_role;
grant execute on function public.can_manage_app_users() to service_role;
grant execute on function public.has_app_users() to service_role;

grant usage on schema public to supabase_auth_admin;
grant select, insert, update on table public.app_users to supabase_auth_admin;
grant usage on type public.app_role to supabase_auth_admin;
grant usage on type public.app_user_status to supabase_auth_admin;
