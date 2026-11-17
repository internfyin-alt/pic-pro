-- Run in the same Supabase project configured in .env.local.
-- Restores the registration rate limiter without resetting existing data.
create table if not exists public.rate_limits (
  key text primary key,
  hits integer not null,
  expires_at timestamptz not null
);

alter table public.rate_limits enable row level security;

create or replace function public.take_rate_limit(
  p_key text, p_limit integer, p_seconds integer
) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.rate_limits(key, hits, expires_at)
  values (p_key, 1, now() + make_interval(secs => p_seconds))
  on conflict (key) do update set
    hits = case when rate_limits.expires_at < now()
      then 1 else rate_limits.hits + 1 end,
    expires_at = case when rate_limits.expires_at < now()
      then now() + make_interval(secs => p_seconds)
      else rate_limits.expires_at end
  returning hits into n;
  return n <= p_limit;
end;
$$;

revoke all on function public.take_rate_limit(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.take_rate_limit(text, integer, integer)
to service_role;

notify pgrst, 'reload schema';
