-- One-time recovery for the existing ShopMind account shown in the owner sign-in screenshot.
-- Run this in Supabase Dashboard → SQL Editor, then sign out and sign in again.
-- This promotes only this exact email address. Do not expose this operation in the public app.

do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower('uniquea902@gmail.com');

  if target_user_id is null then
    raise exception 'No Supabase Auth account found for uniquea902@gmail.com. Sign up first, then run this script.';
  end if;

  insert into public.profiles (id, full_name, role)
  select id, coalesce(raw_user_meta_data ->> 'full_name', ''), 'admin'
  from auth.users
  where id = target_user_id
  on conflict (id) do update
  set role = 'admin', updated_at = now();
end;
$$;
