create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  sector text not null default 'other'
    check (sector in ('school', 'restaurant', 'lgu', 'webinar', 'expo', 'private', 'other')),
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  slug text not null unique,
  description text,
  banner_url text,
  start_date timestamptz not null,
  end_date timestamptz,
  venue_name text,
  city text,
  ticket_price numeric(10, 2) not null default 0 check (ticket_price >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_public_schedule_idx
  on public.events (start_date)
  where status = 'published';

alter table public.organizations enable row level security;
alter table public.events enable row level security;

grant select on public.organizations, public.events to anon, authenticated;

create policy "Visitors can view organizations with upcoming events"
  on public.organizations
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.events
      where events.organization_id = organizations.id
        and events.status = 'published'
        and events.start_date >= now()
    )
  );

create policy "Visitors can view published upcoming events"
  on public.events
  for select
  to anon, authenticated
  using (status = 'published' and start_date >= now());