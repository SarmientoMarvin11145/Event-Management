alter table public.organizations
  add column if not exists description text not null default '',
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website text,
  add column if not exists address text,
  add column if not exists timezone text not null default 'Asia/Manila',
  add column if not exists default_language text not null default 'en',
  add column if not exists branding jsonb not null default '{}'::jsonb,
  add column if not exists registration_defaults jsonb not null default '{}'::jsonb;

alter table public.events
  add column if not exists short_description text not null default '',
  add column if not exists category text not null default 'other',
  add column if not exists tags text[] not null default '{}',
  add column if not exists registration_opens_at timestamptz,
  add column if not exists registration_deadline timestamptz,
  add column if not exists checkin_opens_at timestamptz,
  add column if not exists checkin_closes_at timestamptz,
  add column if not exists timezone text not null default 'Asia/Manila',
  add column if not exists registration_approval text not null default 'automatic'
    check (registration_approval in ('automatic', 'manual')),
  add column if not exists waitlist_enabled boolean not null default false;

alter table public.registrations
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.attendance_logs
  add column if not exists check_in_method text not null default 'manual'
    check (check_in_method in ('manual', 'qr'));

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('organization_admin', 'event_manager', 'check_in_staff', 'viewer')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id, status);
create index if not exists organization_members_org_idx
  on public.organization_members (organization_id, role, status);

create table if not exists public.organization_member_events (
  membership_id uuid not null references public.organization_members (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, event_id)
);

alter table public.organization_member_events enable row level security;
grant select on public.organization_member_events to authenticated;

create table if not exists public.organization_activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_activity_created_idx
  on public.organization_activity_logs (organization_id, created_at desc);

create table if not exists public.event_private_details (
  event_id uuid primary key references public.events (id) on delete cascade,
  online_meeting_url text,
  updated_at timestamptz not null default now()
);

alter table public.organization_members enable row level security;
alter table public.organization_activity_logs enable row level security;
alter table public.event_private_details enable row level security;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.superadmin_organization_owners owners
    join public.profiles on profiles.id = owners.user_id
    where owners.organization_id = p_organization_id
      and owners.user_id = (select auth.uid())
      and profiles.account_status = 'active'
      and profiles.role = 'admin'
  ) or exists (
    select 1
    from public.organization_members members
    join public.profiles on profiles.id = members.user_id
    where members.organization_id = p_organization_id
      and members.user_id = (select auth.uid())
      and members.status = 'active'
      and profiles.account_status = 'active'
  );
$$;

create or replace function public.can_manage_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.superadmin_organization_owners owners
    where owners.organization_id = p_organization_id
      and owners.user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.organization_members members
    join public.profiles on profiles.id = members.user_id
    where members.organization_id = p_organization_id
      and members.user_id = (select auth.uid())
      and members.role = 'organization_admin'
      and members.status = 'active'
      and profiles.account_status = 'active'
  );
$$;

create or replace function public.is_admin_org_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_organization(p_organization_id);
$$;

revoke execute on function public.is_organization_member(uuid) from public, anon;
revoke execute on function public.can_manage_organization(uuid) from public, anon;
revoke execute on function public.is_admin_org_owner(uuid) from public, anon;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.can_manage_organization(uuid) to authenticated;
grant execute on function public.is_admin_org_owner(uuid) to authenticated;

create or replace function public.get_my_organization_memberships()
returns table (organization_id uuid, role text, membership_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select owners.organization_id, 'organization_admin'::text, null::uuid
  from public.superadmin_organization_owners owners
  join public.profiles on profiles.id = owners.user_id
  where owners.user_id = (select auth.uid())
    and profiles.role = 'admin'
    and profiles.account_status = 'active'
  union
  select members.organization_id, members.role, members.id
  from public.organization_members members
  join public.profiles on profiles.id = members.user_id
  where members.user_id = (select auth.uid())
    and members.status = 'active'
    and profiles.account_status = 'active';
$$;

revoke execute on function public.get_my_organization_memberships() from public, anon;
grant execute on function public.get_my_organization_memberships() to authenticated;

create policy "Organization members can view their organization"
  on public.organizations for select to authenticated
  using (public.is_organization_member(id));

create policy "Organization members can view their events"
  on public.events for select to authenticated
  using (public.is_organization_member(organization_id));

create policy "Organization members can view venue plans"
  on public.venues for select to authenticated
  using (public.is_organization_member(organization_id));

create policy "Organization admins can create events"
  on public.events for insert to authenticated
  with check (public.can_manage_organization(organization_id));

create policy "Organization admins can update events"
  on public.events for update to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

create policy "Organization members can view event registrations"
  on public.registrations for select to authenticated
  using (
    exists (
      select 1 from public.events
      where events.id = registrations.event_id
        and public.is_organization_member(events.organization_id)
    )
  );

create policy "Organization members can view attendance logs"
  on public.attendance_logs for select to authenticated
  using (
    exists (
      select 1
      from public.registrations
      join public.events on events.id = registrations.event_id
      where registrations.id = attendance_logs.registration_id
        and public.is_organization_member(events.organization_id)
    )
  );

create policy "Users can view their organization membership"
  on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_organization(organization_id));

create policy "Members can view their event assignments"
  on public.organization_member_events for select to authenticated
  using (
    exists (
      select 1 from public.organization_members members
      where members.id = organization_member_events.membership_id
        and (
          members.user_id = (select auth.uid())
          or public.can_manage_organization(members.organization_id)
        )
    )
  );

create policy "Organization members can view activity"
  on public.organization_activity_logs for select to authenticated
  using (public.is_organization_member(organization_id));

create policy "Organization admins can view private event details"
  on public.event_private_details for select to authenticated
  using (
    exists (
      select 1 from public.events
      where events.id = event_private_details.event_id
        and public.is_organization_member(events.organization_id)
    )
    or exists (
      select 1 from public.registrations
      where registrations.event_id = event_private_details.event_id
        and registrations.attendee_id = (select auth.uid())
        and registrations.status in ('confirmed', 'pending', 'invited')
    )
  );

grant select on public.organization_members, public.organization_activity_logs,
  public.event_private_details to authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update on public.events to authenticated;
grant select, update (status) on public.registrations to authenticated;
grant select on public.attendance_logs to authenticated;

create or replace function public.log_organization_activity(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Organization access required';
  end if;
  insert into public.organization_activity_logs
    (organization_id, actor_id, action, entity_type, entity_id, details)
  values
    (p_organization_id, (select auth.uid()), p_action, p_entity_type, p_entity_id,
      coalesce(p_details, '{}'::jsonb));
end;
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events
    where events.id = p_event_id
      and public.can_manage_organization(events.organization_id)
  ) or exists (
    select 1
    from public.events
    join public.organization_member_events assignments on assignments.event_id = events.id
    join public.organization_members members on members.id = assignments.membership_id
    join public.profiles on profiles.id = members.user_id
    where events.id = p_event_id
      and members.user_id = (select auth.uid())
      and members.role = 'event_manager'
      and members.status = 'active'
      and profiles.account_status = 'active'
  );
$$;

revoke execute on function public.can_manage_event(uuid) from public, anon;
grant execute on function public.can_manage_event(uuid) to authenticated;

create or replace function public.admin_save_event(
  p_event_id uuid,
  p_organization_id uuid,
  p_title text,
  p_slug text,
  p_short_description text,
  p_description text,
  p_category text,
  p_tags text[],
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_registration_opens_at timestamptz,
  p_registration_deadline timestamptz,
  p_checkin_opens_at timestamptz,
  p_checkin_closes_at timestamptz,
  p_venue_id uuid,
  p_venue_name text,
  p_city text,
  p_capacity integer,
  p_ticket_price numeric,
  p_currency text,
  p_status text,
  p_approval text,
  p_waitlist boolean,
  p_online_meeting_url text,
  p_timezone text,
  p_clear_online_meeting_url boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  old_organization_id uuid;
  resolved_venue_name text;
begin
  if p_event_id is null and not public.can_manage_organization(p_organization_id) then
    raise exception 'Organization admin access required to create events';
  end if;
  if p_title is null or length(trim(p_title)) not between 1 and 200 then
    raise exception 'Event title must be between 1 and 200 characters';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) > 180 then
    raise exception 'Enter a valid URL slug';
  end if;
  if p_category not in ('academic', 'technology', 'sports', 'entertainment', 'conference', 'workshop', 'seminar', 'competition', 'community', 'other') then
    raise exception 'Invalid event category';
  end if;
  if p_start_date is null or (p_end_date is not null and p_end_date <= p_start_date) then
    raise exception 'Event end must be after its start';
  end if;
  if p_registration_opens_at is not null and p_registration_deadline is not null
    and p_registration_deadline < p_registration_opens_at then
    raise exception 'Registration deadline must follow registration opening';
  end if;
  if p_checkin_opens_at is not null and p_checkin_closes_at is not null
    and p_checkin_closes_at < p_checkin_opens_at then
    raise exception 'Check-in closing must follow opening';
  end if;
  if p_capacity is not null and p_capacity < 1 then
    raise exception 'Capacity must be a positive number';
  end if;
  if p_ticket_price is null or p_ticket_price < 0 then
    raise exception 'Ticket price cannot be negative';
  end if;
  if p_status not in ('draft', 'published', 'cancelled') then
    raise exception 'Invalid event status';
  end if;
  if p_status = 'published' and p_start_date <= now() and not exists (
    select 1 from public.events
    where id = p_event_id and status = 'published' and start_date <= now()
  ) then
    raise exception 'Only future events can be published';
  end if;
  if p_status = 'published' and p_ticket_price > 0 then
    raise exception 'Paid event publishing is unavailable until checkout is configured';
  end if;
  if p_approval not in ('automatic', 'manual') then
    raise exception 'Invalid registration approval setting';
  end if;
  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter ISO code';
  end if;
  if p_venue_id is not null then
    select name into resolved_venue_name from public.venues
    where id = p_venue_id and organization_id = p_organization_id;
    if resolved_venue_name is null then
      raise exception 'Choose a venue from this organization';
    end if;
  else
    resolved_venue_name := nullif(trim(p_venue_name), '');
  end if;

  if p_event_id is null then
    insert into public.events (
      organization_id, title, slug, short_description, description, category, tags,
      start_date, end_date, registration_opens_at, registration_deadline,
      checkin_opens_at, checkin_closes_at, venue_id, venue_name, city, capacity,
      ticket_price, currency, status, registration_approval, waitlist_enabled, timezone
    ) values (
      p_organization_id, trim(p_title), p_slug, coalesce(p_short_description, ''),
      coalesce(p_description, ''), p_category, coalesce(p_tags, '{}'),
      p_start_date, p_end_date, p_registration_opens_at, p_registration_deadline,
      p_checkin_opens_at, p_checkin_closes_at, p_venue_id, resolved_venue_name,
      nullif(trim(p_city), ''), p_capacity, p_ticket_price, p_currency, p_status,
      p_approval, coalesce(p_waitlist, false), coalesce(p_timezone, 'Asia/Manila')
    ) returning id into saved_id;
  else
    select organization_id into old_organization_id
    from public.events where id = p_event_id for update;
    if old_organization_id is distinct from p_organization_id
      or not public.can_manage_event(p_event_id) then
      raise exception 'Event not found or access was denied';
    end if;
    if exists (
      select 1 from public.registrations
      where event_id = p_event_id and status in ('confirmed', 'pending', 'invited')
    ) and p_venue_id is distinct from (
      select venue_id from public.events where id = p_event_id
    ) then
      raise exception 'Venue cannot change after attendees have registered';
    end if;
    update public.events set
      title = trim(p_title), slug = p_slug, short_description = coalesce(p_short_description, ''),
      description = coalesce(p_description, ''), category = p_category, tags = coalesce(p_tags, '{}'),
      start_date = p_start_date, end_date = p_end_date,
      registration_opens_at = p_registration_opens_at,
      registration_deadline = p_registration_deadline,
      checkin_opens_at = p_checkin_opens_at, checkin_closes_at = p_checkin_closes_at,
      venue_id = p_venue_id, venue_name = resolved_venue_name,
      city = nullif(trim(p_city), ''), capacity = p_capacity, ticket_price = p_ticket_price,
      currency = p_currency, status = p_status, registration_approval = p_approval,
      waitlist_enabled = coalesce(p_waitlist, false), timezone = coalesce(p_timezone, 'Asia/Manila'),
      updated_at = now()
    where id = p_event_id and organization_id = p_organization_id
    returning id into saved_id;
  end if;
  if saved_id is null then raise exception 'Could not save event'; end if;

  if p_online_meeting_url is not null and length(trim(p_online_meeting_url)) > 0 then
    if p_online_meeting_url !~ '^https://[^[:space:]]+$' then
      raise exception 'Online meeting URL must use HTTPS';
    end if;
    insert into public.event_private_details (event_id, online_meeting_url, updated_at)
    values (saved_id, trim(p_online_meeting_url), now())
    on conflict (event_id) do update set
      online_meeting_url = excluded.online_meeting_url, updated_at = now();
  elsif coalesce(p_clear_online_meeting_url, false) then
    delete from public.event_private_details where event_id = saved_id;
  end if;
  return saved_id;
end;
$$;

create or replace function public.admin_update_registration(
  p_registration_id uuid,
  p_status text,
  p_cancellation_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_org_id uuid;
  target_event_id uuid;
begin
  if p_status not in ('confirmed', 'cancelled', 'waitlisted') then
    raise exception 'Invalid registration status';
  end if;
  select events.organization_id, events.id into event_org_id, target_event_id
  from public.registrations
  join public.events on events.id = registrations.event_id
  where registrations.id = p_registration_id;
  if event_org_id is null or not public.can_manage_event(target_event_id) then
    raise exception 'Registration not found or access was denied';
  end if;
  update public.registrations set
    status = p_status,
    cancelled_at = case when p_status = 'cancelled' then now() else null end,
    cancellation_reason = case when p_status = 'cancelled' then nullif(left(trim(coalesce(p_cancellation_reason, '')), 500), '') else null end,
    updated_at = now()
  where id = p_registration_id;
  perform public.log_organization_activity(
    event_org_id, 'registration.' || p_status, 'registration',
    p_registration_id::text, jsonb_build_object('status', p_status)
  );
end;
$$;

create or replace function public.admin_record_attendance(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_org_id uuid;
  checkin_open timestamptz;
  checkin_close timestamptz;
begin
  select events.organization_id,
    events.checkin_opens_at, events.checkin_closes_at
  into event_org_id, checkin_open, checkin_close
  from public.registrations
  join public.events on events.id = registrations.event_id
  where registrations.id = p_registration_id
    and registrations.status = 'confirmed';
  if event_org_id is null or not public.is_organization_member(event_org_id) then
    raise exception 'Confirmed registration not found or access was denied';
  end if;
  if not public.can_manage_organization(event_org_id) and not exists (
    select 1 from public.organization_members
    where organization_id = event_org_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role in ('event_manager', 'check_in_staff')
  ) then
    raise exception 'Check-in permission required';
  end if;
  if checkin_open is not null and now() < checkin_open then
    raise exception 'Check-in is not open yet';
  end if;
  if checkin_close is not null and now() > checkin_close then
    raise exception 'Check-in is closed';
  end if;
  insert into public.attendance_logs (registration_id, check_in_method)
  values (p_registration_id, 'manual')
  on conflict (registration_id) do nothing;
  if not found then
    raise exception 'This registration has already been checked in';
  end if;
  perform public.log_organization_activity(
    event_org_id, 'attendance.checked_in', 'registration',
    p_registration_id::text, '{}'::jsonb
  );
end;
$$;

create or replace function public.admin_update_organization_settings(
  p_organization_id uuid,
  p_name text,
  p_logo_url text,
  p_description text,
  p_contact_email text,
  p_contact_phone text,
  p_website text,
  p_address text,
  p_timezone text,
  p_default_language text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_organization(p_organization_id) then
    raise exception 'Organization admin access required';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120 then
    raise exception 'Organization name must be between 1 and 120 characters';
  end if;
  if p_default_language not in ('en', 'fil', 'ceb') then
    raise exception 'Invalid default language';
  end if;
  if p_logo_url is not null and p_logo_url !~ '^https://[^[:space:]]+$' then
    raise exception 'Organization logo URL must use HTTPS';
  end if;
  if p_website is not null and p_website !~ '^https://[^[:space:]]+$' then
    raise exception 'Organization website must use HTTPS';
  end if;
  update public.organizations set
    name = trim(p_name),
    logo_url = nullif(trim(p_logo_url), ''),
    description = left(coalesce(p_description, ''), 5000),
    contact_email = nullif(trim(p_contact_email), ''),
    contact_phone = nullif(trim(p_contact_phone), ''),
    website = nullif(trim(p_website), ''),
    address = nullif(trim(p_address), ''),
    timezone = left(coalesce(nullif(trim(p_timezone), ''), 'Asia/Manila'), 100),
    default_language = p_default_language
  where id = p_organization_id;
  perform public.log_organization_activity(
    p_organization_id, 'organization.settings_updated', 'organization',
    p_organization_id::text, jsonb_build_object('name', trim(p_name))
  );
end;
$$;

create or replace function public.admin_manage_organization_member(
  p_organization_id uuid,
  p_email text,
  p_role text,
  p_action text,
  p_member_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_user_id uuid;
begin
  if not public.can_manage_organization(p_organization_id) then
    raise exception 'Organization admin access required';
  end if;
  if p_action not in ('invite', 'update', 'remove') then
    raise exception 'Invalid membership action';
  end if;
  if p_action in ('invite', 'update') and p_role not in ('organization_admin', 'event_manager', 'check_in_staff', 'viewer') then
    raise exception 'Invalid organization role';
  end if;

  if p_action = 'invite' then
    if p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Enter the email address of an existing account';
    end if;
    select profiles.id into member_user_id
    from auth.users
    join public.profiles on profiles.id = auth.users.id
    where lower(auth.users.email) = lower(trim(p_email))
      and profiles.account_status = 'active'
      and profiles.role <> 'superadmin';
    if member_user_id is null then
      raise exception 'No active KURO account found for that email. Email invitations are not configured.';
    end if;
    insert into public.organization_members
      (organization_id, user_id, role, invited_by, status)
    values (p_organization_id, member_user_id, p_role, (select auth.uid()), 'active')
    on conflict (organization_id, user_id) do update
      set role = excluded.role, status = 'active', invited_by = excluded.invited_by, updated_at = now();
  elsif p_action = 'update' then
    update public.organization_members set role = p_role, updated_at = now()
    where id = p_member_id and organization_id = p_organization_id;
    if not found then raise exception 'Membership not found'; end if;
  else
    update public.organization_members set status = 'suspended', updated_at = now()
    where id = p_member_id and organization_id = p_organization_id;
    if not found then raise exception 'Membership not found'; end if;
  end if;
  perform public.log_organization_activity(
    p_organization_id, 'organization.member_' || p_action, 'organization_member',
    coalesce(p_member_id::text, member_user_id::text),
    jsonb_build_object('role', p_role)
  );
end;
$$;

revoke execute on function public.admin_save_event(uuid, uuid, text, text, text, text, text, text[], timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, uuid, text, text, integer, numeric, text, text, text, boolean, text, text, boolean) from public, anon;
revoke execute on function public.admin_update_registration(uuid, text, text) from public, anon;
revoke execute on function public.admin_record_attendance(uuid) from public, anon;
revoke execute on function public.admin_update_organization_settings(uuid, text, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.admin_manage_organization_member(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.admin_save_event(uuid, uuid, text, text, text, text, text, text[], timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, uuid, text, text, integer, numeric, text, text, text, boolean, text, text, boolean) to authenticated;
grant execute on function public.admin_update_registration(uuid, text, text) to authenticated;
grant execute on function public.admin_record_attendance(uuid) to authenticated;
grant execute on function public.admin_update_organization_settings(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_manage_organization_member(uuid, text, text, text, uuid) to authenticated;

create or replace function public.log_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_activity_logs
    (organization_id, actor_id, action, entity_type, entity_id, details)
  values (
    new.organization_id, (select auth.uid()),
    case when tg_op = 'INSERT' then 'event.created' else 'event.updated' end,
    'event', new.id::text,
    jsonb_build_object('title', new.title, 'status', new.status)
  );
  return new;
end;
$$;

create trigger events_log_organization_activity
  after insert or update on public.events
  for each row execute function public.log_event_change();

create or replace function public.get_organization_admin_overview(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Organization access required';
  end if;
  select jsonb_build_object(
    'eventCount', (select count(*) from public.events where organization_id = p_organization_id),
    'upcomingCount', (select count(*) from public.events where organization_id = p_organization_id and start_date >= now() and status <> 'cancelled'),
    'registrationCount', (select count(*) from public.registrations join public.events on events.id = registrations.event_id where events.organization_id = p_organization_id),
    'attendeeCount', (select count(distinct registrations.attendee_id) from public.registrations join public.events on events.id = registrations.event_id where events.organization_id = p_organization_id),
    'checkedInCount', (select count(*) from public.attendance_logs join public.registrations on registrations.id = attendance_logs.registration_id join public.events on events.id = registrations.event_id where events.organization_id = p_organization_id),
    'staffCount', (select count(*) from public.organization_members where organization_id = p_organization_id and status = 'active'),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event_rows.id, 'title', event_rows.title, 'start_date', event_rows.start_date,
        'venue_name', event_rows.venue_name, 'status', event_rows.status,
        'registration_count', event_rows.registration_count
      ) order by event_rows.start_date)
      from (
        select events.id, events.title, events.start_date, events.venue_name, events.status,
          (select count(*) from public.registrations where registrations.event_id = events.id and registrations.status <> 'cancelled') as registration_count
        from public.events
        where events.organization_id = p_organization_id
          and events.start_date >= now()
          and events.status <> 'cancelled'
        order by events.start_date
        limit 8
      ) event_rows
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', logs.id, 'action', logs.action, 'entity_type', logs.entity_type,
        'entity_id', logs.entity_id, 'details', logs.details, 'created_at', logs.created_at,
        'actor_name', profiles.full_name
      ) order by logs.created_at desc)
      from (
        select * from public.organization_activity_logs
        where organization_id = p_organization_id
        order by created_at desc limit 8
      ) logs
      left join public.profiles on profiles.id = logs.actor_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.get_organization_admin_overview(uuid) from public, anon;
grant execute on function public.get_organization_admin_overview(uuid) to authenticated;

create or replace function public.admin_get_event_private_details(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select details.online_meeting_url
  from public.event_private_details details
  join public.events on events.id = details.event_id
  where details.event_id = p_event_id
    and (
      public.is_organization_member(events.organization_id)
      or exists (
        select 1 from public.registrations
        where registrations.event_id = events.id
          and registrations.attendee_id = (select auth.uid())
          and registrations.status in ('confirmed', 'pending', 'invited')
      )
    );
$$;

revoke execute on function public.admin_get_event_private_details(uuid) from public, anon;
grant execute on function public.admin_get_event_private_details(uuid) to authenticated;

drop policy if exists "Attendees can register for free published events without assigned seating" on public.registrations;
create policy "Attendees can register for free published events"
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
        and events.registration_approval = 'automatic'
        and (events.registration_opens_at is null or events.registration_opens_at <= now())
        and (events.registration_deadline is null or events.registration_deadline >= now())
        and (events.capacity is null or (
          select count(*) from public.registrations active
          where active.event_id = events.id and active.status in ('confirmed', 'pending', 'invited', 'waitlisted')
        ) < events.capacity)
    )
  );

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
  current_user_id uuid := (select auth.uid());
  event_row public.events%rowtype;
  registration_id uuid;
  profile_status text;
begin
  if current_user_id is null then raise exception 'Sign in to register for an event'; end if;
  select account_status into profile_status from public.profiles where id = current_user_id;
  if profile_status is distinct from 'active' then raise exception 'An active account is required to register'; end if;
  if p_seat_id is null or length(p_seat_id) > 24 then raise exception 'Choose a valid seat'; end if;

  select * into event_row from public.events where id = p_event_id for update;
  if not found or event_row.status <> 'published' or event_row.start_date <= now()
    or event_row.venue_id is null or event_row.ticket_price <> 0
    or not public.is_public_organization_active(event_row.organization_id)
    or (event_row.registration_opens_at is not null and now() < event_row.registration_opens_at)
    or (event_row.registration_deadline is not null and now() > event_row.registration_deadline) then
    raise exception 'This event is not available for seat registration';
  end if;
  if not exists (
    select 1 from public.venues
    cross join lateral jsonb_array_elements(public.venues.seat_plan -> 'rows') as row_item
    cross join lateral jsonb_array_elements(row_item -> 'seats') as seat_item
    where public.venues.id = event_row.venue_id
      and seat_item ->> 'id' = p_seat_id
      and seat_item ->> 'enabled' = 'true'
  ) then raise exception 'The selected seat is not part of this venue plan'; end if;
  if exists (select 1 from public.event_seat_reservations where event_id = p_event_id and seat_id = p_seat_id) then
    raise exception 'This seat has already been reserved. Please choose another seat';
  end if;
  if exists (
    select 1 from public.registrations
    where registrations.attendee_id = current_user_id
      and registrations.event_id = p_event_id
  ) then
    raise exception 'You already have a registration for this event';
  end if;
  if event_row.capacity is not null and (
    select count(*) from public.registrations
    where event_id = p_event_id and status in ('confirmed', 'pending', 'invited', 'waitlisted')
  ) >= event_row.capacity then
    raise exception 'This event has reached capacity';
  end if;
  insert into public.registrations (attendee_id, event_id, seat_number, status)
  values (current_user_id, p_event_id, p_seat_id,
    case when event_row.registration_approval = 'manual' then 'pending' else 'confirmed' end)
  returning id into registration_id;
  insert into public.event_seat_reservations (event_id, seat_id, registration_id)
  values (p_event_id, p_seat_id, registration_id);
  return registration_id;
end;
$$;
