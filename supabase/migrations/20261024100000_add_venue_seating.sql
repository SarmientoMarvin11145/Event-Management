create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  seat_plan jsonb not null check (jsonb_typeof(seat_plan) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index venues_organization_idx on public.venues (organization_id, name);

alter table public.events
  add column venue_id uuid references public.venues (id) on delete set null;

create table public.event_seat_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  seat_id text not null,
  registration_id uuid not null unique references public.registrations (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, seat_id)
);

create index event_seat_reservations_event_idx
  on public.event_seat_reservations (event_id);

alter table public.venues enable row level security;
alter table public.event_seat_reservations enable row level security;

create or replace function public.is_admin_org_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    join public.superadmin_organization_owners
      on superadmin_organization_owners.user_id = profiles.id
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.account_status = 'active'
      and superadmin_organization_owners.organization_id = p_organization_id
  );
$$;

revoke execute on function public.is_admin_org_owner(uuid) from public, anon;
grant execute on function public.is_admin_org_owner(uuid) to authenticated;

create policy "Admins can view their organizations"
  on public.organizations for select to authenticated
  using (public.is_admin_org_owner(id));

create policy "Admins can view their organization events"
  on public.events for select to authenticated
  using (public.is_admin_org_owner(organization_id));

create policy "Admins can view their organization venues"
  on public.venues for select to authenticated
  using (public.is_admin_org_owner(organization_id));

grant select on public.venues to authenticated;
grant select on public.events to authenticated;

drop policy if exists "Attendees can register for free published events" on public.registrations;
create policy "Attendees can register for free published events without assigned seating"
  on public.registrations for insert to authenticated
  with check (
    (select auth.uid()) = attendee_id
    and status = 'confirmed'
    and exists (
      select 1 from public.events
      where events.id = registrations.event_id
        and events.status = 'published'
        and events.start_date > now()
        and events.ticket_price = 0
        and events.venue_id is null
    )
  );

create or replace function public.admin_save_venue_seat_plan(
  p_venue_id uuid,
  p_organization_id uuid,
  p_name text,
  p_seat_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_venue_id uuid;
  row_count integer;
  seat_count integer;
  distinct_seat_count integer;
begin
  if not public.is_admin_org_owner(p_organization_id) then
    raise exception 'Admin access to this organization is required';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120 then
    raise exception 'Venue name must be between 1 and 120 characters';
  end if;
  if p_seat_plan is null
    or jsonb_typeof(p_seat_plan) <> 'object'
    or jsonb_typeof(p_seat_plan -> 'rows') is distinct from 'array' then
    raise exception 'Seat plan must contain a rows array';
  end if;

  row_count := jsonb_array_length(p_seat_plan -> 'rows');
  if row_count < 1 or row_count > 26 then
    raise exception 'Seat plan must contain between 1 and 26 rows';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_seat_plan -> 'rows') as row_item
    where jsonb_typeof(row_item -> 'seats') is distinct from 'array'
      or coalesce(row_item ->> 'label', '') !~ '^[A-Z]{1,8}$'
      or case
        when jsonb_typeof(row_item -> 'seats') = 'array'
          then jsonb_array_length(row_item -> 'seats') > 40
        else false
      end
  ) then
    raise exception 'Each row needs a label and no more than 40 seats';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_seat_plan -> 'rows') as row_item,
      jsonb_array_elements(row_item -> 'seats') as seat_item
    where jsonb_typeof(seat_item) <> 'object'
      or jsonb_typeof(seat_item -> 'enabled') <> 'boolean'
      or coalesce(seat_item ->> 'enabled', '') not in ('true', 'false')
      or coalesce(seat_item ->> 'id', '') !~ ('^' || (row_item ->> 'label') || '-[0-9]{1,2}$')
  ) then
    raise exception 'Each seat needs a valid label and enabled status';
  end if;

  select count(*), count(distinct (seat_item ->> 'id'))
  into seat_count, distinct_seat_count
  from jsonb_array_elements(p_seat_plan -> 'rows') as row_item,
    jsonb_array_elements(row_item -> 'seats') as seat_item;
  if seat_count = 0 or seat_count <> distinct_seat_count or seat_count > 1040
    or not exists (
      select 1
      from jsonb_array_elements(p_seat_plan -> 'rows') as row_item,
        jsonb_array_elements(row_item -> 'seats') as seat_item
      where seat_item ->> 'enabled' = 'true'
    ) then
    raise exception 'Seat plan must contain unique seats and cannot exceed 1040 seats';
  end if;

  if p_venue_id is null then
    insert into public.venues (organization_id, name, seat_plan)
    values (p_organization_id, trim(p_name), p_seat_plan)
    returning id into saved_venue_id;
  else
    if exists (
      select 1
      from public.events
      join public.event_seat_reservations
        on event_seat_reservations.event_id = events.id
      where events.venue_id = p_venue_id
        and events.status <> 'cancelled'
        and coalesce(events.end_date, events.start_date + interval '1 hour') >= now()
    ) then
      raise exception 'A venue plan cannot be changed while seats are reserved for an event';
    end if;

    update public.venues
    set name = trim(p_name), seat_plan = p_seat_plan, updated_at = now()
    where id = p_venue_id
      and organization_id = p_organization_id
      and public.is_admin_org_owner(organization_id)
    returning id into saved_venue_id;
    if saved_venue_id is null then
      raise exception 'Venue not found or access was denied';
    end if;
  end if;

  return saved_venue_id;
end;
$$;

revoke execute on function public.admin_save_venue_seat_plan(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.admin_save_venue_seat_plan(uuid, uuid, text, jsonb) to authenticated;

create or replace function public.admin_assign_venue_to_event(
  p_event_id uuid,
  p_venue_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_organization_id uuid;
  current_venue_id uuid;
  assigned_venue_name text;
begin
  select organization_id, venue_id into event_organization_id, current_venue_id
  from public.events
  where id = p_event_id
  for update;
  if event_organization_id is null
    or not public.is_admin_org_owner(event_organization_id) then
    raise exception 'Event not found or access was denied';
  end if;
  if not exists (
    select 1 from public.events
    where id = p_event_id and start_date > now()
  ) then
    raise exception 'Only upcoming events can be assigned a venue seat plan';
  end if;

  if p_venue_id is null then
    assigned_venue_name := null;
  else
    select name into assigned_venue_name
    from public.venues
    where id = p_venue_id
      and organization_id = event_organization_id;
    if assigned_venue_name is null then
      raise exception 'Venue not found for this organization';
    end if;
  end if;

  if current_venue_id is distinct from p_venue_id and exists (
    select 1
    from public.registrations
    where event_id = p_event_id
      and status in ('confirmed', 'pending', 'invited')
  ) then
    raise exception 'The event venue cannot be changed after attendees have registered';
  end if;

  update public.events
  set venue_id = p_venue_id, venue_name = assigned_venue_name, updated_at = now()
  where id = p_event_id;
end;
$$;

revoke execute on function public.admin_assign_venue_to_event(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_venue_to_event(uuid, uuid) to authenticated;

create or replace function public.get_event_seat_map(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'venueName', venues.name,
    'rows', venues.seat_plan -> 'rows',
    'reservedSeatIds', coalesce(
      (
        select jsonb_agg(event_seat_reservations.seat_id order by event_seat_reservations.seat_id)
        from public.event_seat_reservations
        where event_seat_reservations.event_id = events.id
      ),
      '[]'::jsonb
    )
  )
  from public.events
  join public.venues on venues.id = events.venue_id
  where events.id = p_event_id
    and events.status = 'published'
    and events.start_date > now()
    and public.is_public_organization_active(events.organization_id);
$$;

revoke execute on function public.get_event_seat_map(uuid) from public;
grant execute on function public.get_event_seat_map(uuid) to anon, authenticated;

create or replace function public.register_for_event_with_seat(
  p_event_id uuid,
  p_seat_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  attendee_id uuid := (select auth.uid());
  event_row public.events%rowtype;
  registration_id uuid;
  profile_status text;
begin
  if attendee_id is null then
    raise exception 'Sign in to register for an event';
  end if;

  select account_status into profile_status
  from public.profiles
  where id = attendee_id;
  if profile_status is distinct from 'active' then
    raise exception 'An active account is required to register';
  end if;
  if p_seat_id is null or length(p_seat_id) > 24 then
    raise exception 'Choose a valid seat';
  end if;

  select * into event_row
  from public.events
  where id = p_event_id
  for update;
  if not found
    or event_row.status <> 'published'
    or event_row.start_date <= now()
    or event_row.venue_id is null
    or event_row.ticket_price <> 0
    or not public.is_public_organization_active(event_row.organization_id) then
    raise exception 'This event is not available for seat registration';
  end if;

  if not exists (
    select 1
    from public.venues
    cross join lateral jsonb_array_elements(public.venues.seat_plan -> 'rows') as row_item
    cross join lateral jsonb_array_elements(row_item -> 'seats') as seat_item
    where public.venues.id = event_row.venue_id
      and seat_item ->> 'id' = p_seat_id
      and seat_item ->> 'enabled' = 'true'
  ) then
    raise exception 'The selected seat is not part of this venue plan';
  end if;

  if exists (
    select 1
    from public.event_seat_reservations
    where event_id = p_event_id
      and seat_id = p_seat_id
  ) then
    raise exception 'This seat has already been reserved. Please choose another seat';
  end if;

  insert into public.registrations (attendee_id, event_id, seat_number)
  values (attendee_id, p_event_id, p_seat_id)
  returning id into registration_id;

  insert into public.event_seat_reservations (event_id, seat_id, registration_id)
  values (p_event_id, p_seat_id, registration_id);

  return registration_id;
end;
$$;

revoke execute on function public.register_for_event_with_seat(uuid, text) from public, anon;
grant execute on function public.register_for_event_with_seat(uuid, text) to authenticated;

create or replace function public.release_cancelled_event_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    delete from public.event_seat_reservations
    where registration_id = new.id;
  end if;
  return new;
end;
$$;

create trigger registrations_release_cancelled_seat
  after update of status on public.registrations
  for each row execute function public.release_cancelled_event_seat();

update public.feature_flags
set enabled = true
where flag_key = 'seating-plans';
