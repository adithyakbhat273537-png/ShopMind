-- RLS controls which profile rows an authenticated user may read; PostgreSQL
-- table privileges must also allow the query to reach that policy.
grant select on table public.profiles to authenticated;
