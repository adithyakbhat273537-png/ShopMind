-- Replace customer workspaces with a pending access state. Public signup never
-- grants Sales access; an owner approves staff from the owner workspace.
alter table public.profiles
  add column if not exists requested_workspace text not null default 'staff';

alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles
set role = 'pending', requested_workspace = 'staff', updated_at = now()
where role = 'customer';

update public.profiles
set requested_workspace = case when role = 'admin' then 'admin' else 'staff' end
where requested_workspace not in ('admin', 'staff');

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'staff', 'pending'));

alter table public.profiles
  drop constraint if exists profiles_requested_workspace_check;

alter table public.profiles
  add constraint profiles_requested_workspace_check check (requested_workspace in ('admin', 'staff'));

create index if not exists profiles_role_created_idx on public.profiles(role, created_at desc);

create or replace function public.create_customer_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_workspace text;
  assigned_role text := 'pending';
  has_admin boolean;
begin
  requested_workspace := case
    when new.raw_user_meta_data ->> 'requested_role' = 'admin' then 'admin'
    else 'staff'
  end;

  if requested_workspace = 'admin' then
    perform pg_advisory_xact_lock(hashtext('shopmind-first-owner-bootstrap'));
    select exists(select 1 from public.profiles where role = 'admin') into has_admin;
    if not has_admin then
      assigned_role := 'admin';
    end if;
  end if;

  insert into public.profiles (id, full_name, role, requested_workspace)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    assigned_role,
    requested_workspace
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Remove the obsolete customer self-update policy entirely. A user's browser
-- cannot edit a role; owner-approved changes go through the protected API.
drop policy if exists "Users update own name only" on public.profiles;
