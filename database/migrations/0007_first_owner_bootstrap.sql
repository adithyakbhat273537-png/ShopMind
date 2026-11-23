-- One-time owner bootstrap. Only the first signup explicitly requesting admin
-- receives that role; a transaction-scoped advisory lock prevents races.
create or replace function public.create_customer_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_role text; has_admin boolean;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'requested_role', 'customer');
  if requested_role = 'admin' then
    perform pg_advisory_xact_lock(hashtext('shopmind-first-owner-bootstrap'));
    select exists(select 1 from public.profiles where role = 'admin') into has_admin;
    if not has_admin then
      insert into public.profiles (id, full_name, role)
      values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'admin')
      on conflict (id) do nothing;
      return new;
    end if;
  end if;
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;
