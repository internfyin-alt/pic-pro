-- Run once: initial setup compatible with the rate-limit repair.
begin;
-- Run in your own Supabase SQL Editor. Do not expose service role key in browser.
create extension if not exists pgcrypto;
create table if not exists public.booking_inquiries (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique,
 full_name text not null,
 phone text not null,
 email text not null,
 partner_name text,
 event_type text not null,
 event_date date not null,
 event_city text not null,
 venue text,
 budget text,
 selected_package text,
 details text,
 services text[] not null default '{}',
 status text not null default 'New' check (status in ('New','Contacted','Discussion Ongoing','Quotation Sent','Confirmed','Completed','Cancelled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists booking_inquiries_created_at_idx on public.booking_inquiries(created_at desc);
alter table public.booking_inquiries enable row level security;
-- No public policies: browser users cannot read/write private client leads.
-- API routes use the server-side service role after validation.

-- Run after schema.sql. Service-role-only API; clients have no table/storage access.
create extension if not exists pgcrypto;
create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 display_name text not null default '',
 role text not null default 'photographer' check(role in ('photographer','super_admin')),
 suspended boolean not null default false,
 created_at timestamptz not null default now()
);
create function public.create_photographer() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',''),100)); return new; end; $$;
create trigger on_photographer_signup after insert on auth.users for each row execute function public.create_photographer();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
create table public.events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles,
 slug text not null unique default encode(gen_random_bytes(18),'hex'),
 title text not null check(length(title) between 1 and 120), event_type text not null,
 event_date date, location text not null default '', description text not null default '',
 published boolean not null default false, downloads_enabled boolean not null default true,
 pin_hash text, expires_at timestamptz, status text not null default 'active' check(status in ('active','deleting')),
 created_at timestamptz not null default now()
);
create table public.event_photos (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events on delete cascade,
 storage_path text not null unique, filename text not null, bytes bigint not null check(bytes between 1 and 26214400),
 status text not null default 'uploading' check(status in ('uploading','queued','processing','ready','failed','deleting')),
 face_ids text[] not null default '{}', face_count integer not null default 0,
 attempts integer not null default 0, error text, locked_at timestamptz,
 created_at timestamptz not null default now()
);
create index on public.event_photos(event_id,status);
create index on public.events(owner_id);
create table public.guest_sessions (
 id uuid primary key default gen_random_uuid(), token_hash text not null unique,
 event_id uuid not null references public.events on delete cascade,
 consent_version text not null, consent_at timestamptz not null default now(),
 photo_ids uuid[] not null default '{}', expires_at timestamptz not null default now()+interval '1 hour'
);
create table public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid, action text not null,
 event_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.platform_settings (
 id boolean primary key default true check(id), registration_enabled boolean not null default true,
 matching_enabled boolean not null default true, max_photos_per_event integer not null default 5000 check(max_photos_per_event between 1 and 50000)
);
insert into public.platform_settings(id) values(true);
create table if not exists public.rate_limits (key text primary key, hits integer not null, expires_at timestamptz not null);
create or replace function public.take_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into public.rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set hits=case when rate_limits.expires_at<now() then 1 else rate_limits.hits+1 end,
 expires_at=case when rate_limits.expires_at<now() then now()+make_interval(secs=>p_seconds) else rate_limits.expires_at end returning hits into n;
 return n<=p_limit;
end; $$;
create function public.claim_photo(p_event uuid default null) returns setof public.event_photos
language sql security definer set search_path=public as $$
 update public.event_photos set status='processing',locked_at=now(),attempts=attempts+1
 where id=(select p.id from public.event_photos p join public.events e on e.id=p.event_id
 join public.profiles u on u.id=e.owner_id
 where e.status='active' and not u.suspended and (p_event is null or p.event_id=p_event) and p.attempts<5
 and (p.status='queued' or (p.status='processing' and p.locked_at<now()-interval '5 minutes'))
 order by p.created_at for update of p skip locked limit 1) returning *;
$$;
-- Atomic reservation enforces the upload limit even with simultaneous requests.
create function public.reserve_photo(p_event uuid,p_id uuid,p_path text,p_filename text,p_bytes bigint)
returns void language plpgsql security definer set search_path=public as $$
declare maximum integer;
begin
 perform 1 from public.events where id=p_event and status='active' for update;
 if not found then raise exception 'Event unavailable'; end if;
 select max_photos_per_event into maximum from public.platform_settings where id=true;
 if (select count(*) from public.event_photos where event_id=p_event)>=maximum then raise exception 'Event photo limit reached'; end if;
 insert into public.event_photos(id,event_id,storage_path,filename,bytes) values(p_id,p_event,p_path,p_filename,p_bytes);
end; $$;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_photos enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;
alter table public.rate_limits enable row level security;
revoke all on function public.create_photographer() from public,anon,authenticated;
revoke all on function public.take_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.claim_photo(uuid) from public,anon,authenticated;
revoke all on function public.reserve_photo(uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.take_rate_limit(text,integer,integer), public.claim_photo(uuid), public.reserve_photo(uuid,uuid,text,text,bigint) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('event-photos','event-photos',false,26214400,array['image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=array['image/jpeg','image/png'];
-- Bootstrap an administrator explicitly, never from user-supplied signup metadata:
-- update public.profiles set role='super_admin' where id=(select id from auth.users where email='YOUR_EMAIL');
create function public.event_statistics(p_event uuid) returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('photos',(select count(*) from event_photos where event_id=p_event),'bytes',(select coalesce(sum(bytes),0) from event_photos where event_id=p_event),'searches',(select count(*) from audit_logs where event_id=p_event and action='guest.match'),'downloads',(select count(*) from audit_logs where event_id=p_event and action='photo.download'),'faces',(select coalesce(sum(face_count),0) from event_photos where event_id=p_event));
$$;
create function public.platform_statistics() returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('photographers',(select count(*) from profiles where role='photographer'),'events',(select count(*) from events),'photos',(select count(*) from event_photos),'bytes',(select coalesce(sum(bytes),0) from event_photos),'indexed',(select count(*) from audit_logs where action='photo.indexed'),'searches',(select count(*) from audit_logs where action='guest.match'),'failed',(select count(*) from event_photos where status='failed'));
$$;
revoke all on function public.event_statistics(uuid),public.platform_statistics() from public,anon,authenticated;
grant execute on function public.event_statistics(uuid),public.platform_statistics() to service_role;

notify pgrst, 'reload schema';
commit;