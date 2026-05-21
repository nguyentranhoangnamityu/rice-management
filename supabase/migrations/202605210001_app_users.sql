-- User management for employee accounts and app-level roles.

create extension if not exists citext;

create type app_role as enum ('owner', 'manager', 'accountant', 'staff');
create type app_user_status as enum ('pending', 'active', 'inactive');

create table app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email citext not null unique,
  full_name text not null,
  phone text,
  role app_role not null default 'staff',
  status app_user_status not null default 'pending',
  note text,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_not_blank check (length(trim(email::text)) > 0),
  constraint app_users_full_name_not_blank check (length(trim(full_name)) > 0)
);

create trigger app_users_set_updated_at
before update on app_users
for each row execute function set_updated_at();

create index app_users_role_idx on app_users(role);
create index app_users_status_idx on app_users(status);

create or replace function public.current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from app_users
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function public.can_manage_app_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('owner', 'manager'), false)
$$;

create or replace function public.has_app_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_users)
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_user boolean;
begin
  select not exists (select 1 from app_users) into is_first_user;

  insert into app_users (
    auth_user_id,
    email,
    full_name,
    role,
    status
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    case when is_first_user then 'owner'::app_role else 'staff'::app_role end,
    'active'
  )
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        full_name = coalesce(app_users.full_name, excluded.full_name),
        status = case when app_users.status = 'pending' then 'active'::app_user_status else app_users.status end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_app_user on auth.users;
create trigger on_auth_user_created_create_app_user
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table app_users enable row level security;

create policy app_users_select_authenticated
on app_users for select
to authenticated
using (true);

create policy app_users_insert_managers
on app_users for insert
to authenticated
with check (
  (
    public.can_manage_app_users()
    and (public.current_app_role() = 'owner' or role <> 'owner')
  )
  or (
    auth_user_id = auth.uid()
    and role = 'owner'
    and status = 'active'
    and not public.has_app_users()
  )
);

create policy app_users_update_managers
on app_users for update
to authenticated
using (
  public.can_manage_app_users()
  and (public.current_app_role() = 'owner' or role <> 'owner')
)
with check (
  public.can_manage_app_users()
  and (public.current_app_role() = 'owner' or role <> 'owner')
);

create policy app_users_delete_owners
on app_users for delete
to authenticated
using (public.current_app_role() = 'owner');
