-- Allow signed-in app users to access app user profiles through RLS policies.

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.app_users to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.can_manage_app_users() to authenticated;
grant execute on function public.has_app_users() to authenticated;
