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
