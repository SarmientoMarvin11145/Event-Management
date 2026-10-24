create or replace function public.can_manage_organization(p_organization_id uuid)
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
      and members.role = 'organization_admin'
      and members.status = 'active'
      and profiles.account_status = 'active'
  );
$$;

revoke insert, update on public.registrations from authenticated;
revoke insert (attendee_id, event_id), update (status) on public.registrations from authenticated;
grant update (status) on public.registrations to authenticated;
revoke insert, update, delete on public.attendance_logs from authenticated;

drop policy if exists "Attendees can cancel their upcoming registrations" on public.registrations;
create policy "Attendees can cancel their upcoming registrations"
  on public.registrations for update to authenticated
  using (
    (select auth.uid()) = attendee_id
    and status in ('confirmed', 'pending', 'waitlisted', 'invited')
    and exists (
      select 1 from public.events
      where events.id = registrations.event_id
        and events.start_date > now()
    )
  )
  with check ((select auth.uid()) = attendee_id and status = 'cancelled');

create or replace function public.prevent_cancelling_checked_in_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled'
    and old.status is distinct from new.status
    and exists (
      select 1 from public.attendance_logs
      where registration_id = old.id
    ) then
    raise exception 'A checked-in registration cannot be cancelled';
  end if;
  return new;
end;
$$;

create trigger registrations_prevent_cancel_after_checkin
  before update of status on public.registrations
  for each row execute function public.prevent_cancelling_checked_in_registration();

create or replace function public.admin_record_attendance(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_org_id uuid;
  target_event_id uuid;
  checkin_open timestamptz;
  checkin_close timestamptz;
begin
  select events.organization_id, events.id,
    events.checkin_opens_at, events.checkin_closes_at
  into event_org_id, target_event_id, checkin_open, checkin_close
  from public.registrations
  join public.events on events.id = registrations.event_id
  where registrations.id = p_registration_id
    and registrations.status = 'confirmed';
  if event_org_id is null or not public.is_organization_member(event_org_id) then
    raise exception 'Confirmed registration not found or access was denied';
  end if;
  if not public.can_manage_organization(event_org_id) and not exists (
    select 1
    from public.organization_members members
    left join public.organization_member_events assignments on assignments.membership_id = members.id
    where members.organization_id = event_org_id
      and members.user_id = (select auth.uid())
      and members.status = 'active'
      and members.role in ('event_manager', 'check_in_staff')
      and (assignments.event_id = target_event_id or members.role = 'event_manager')
  ) then
    raise exception 'Check-in permission for this event is required';
  end if;
  if checkin_open is not null and now() < checkin_open then raise exception 'Check-in is not open yet'; end if;
  if checkin_close is not null and now() > checkin_close then raise exception 'Check-in is closed'; end if;
  insert into public.attendance_logs (registration_id, check_in_method)
  values (p_registration_id, 'manual')
  on conflict (registration_id) do nothing;
  if not found then raise exception 'This registration has already been checked in'; end if;
  perform public.log_organization_activity(
    event_org_id, 'attendance.checked_in', 'registration', p_registration_id::text, '{}'::jsonb
  );
end;
$$;

create or replace function public.register_for_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  event_row public.events%rowtype;
  registration_id uuid;
  registration_status text;
  current_registrations integer;
begin
  if current_user_id is null then raise exception 'Sign in to register for an event'; end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id and account_status = 'active'
  ) then raise exception 'An active account is required to register'; end if;

  select * into event_row from public.events where id = p_event_id for update;
  if not found or event_row.status <> 'published' or event_row.start_date <= now()
    or event_row.venue_id is not null or event_row.ticket_price <> 0
    or not public.is_public_organization_active(event_row.organization_id)
    or (event_row.registration_opens_at is not null and now() < event_row.registration_opens_at)
    or (event_row.registration_deadline is not null and now() > event_row.registration_deadline) then
    raise exception 'This event is not available for registration';
  end if;
  if exists (
    select 1 from public.registrations
    where registrations.attendee_id = current_user_id and registrations.event_id = p_event_id
  ) then raise exception 'You already have a registration for this event'; end if;
  select count(*) into current_registrations
  from public.registrations
  where event_id = p_event_id and status in ('confirmed', 'pending', 'invited');
  if event_row.capacity is not null and current_registrations >= event_row.capacity then
    if event_row.waitlist_enabled then
      registration_status := 'waitlisted';
    else
      raise exception 'This event has reached capacity';
    end if;
  elsif event_row.registration_approval = 'manual' then
    registration_status := 'pending';
  else
    registration_status := 'confirmed';
  end if;
  insert into public.registrations (attendee_id, event_id, status)
  values (current_user_id, p_event_id, registration_status)
  returning id into registration_id;
  return registration_id;
end;
$$;

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
  registration_status text;
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
  if exists (
    select 1 from public.event_seat_reservations
    where event_id = p_event_id and seat_id = p_seat_id
  ) then raise exception 'This seat has already been reserved. Please choose another seat'; end if;
  if exists (
    select 1 from public.registrations
    where attendee_id = current_user_id and event_id = p_event_id
  ) then raise exception 'You already have a registration for this event'; end if;
  if event_row.capacity is not null and (
    select count(*) from public.registrations
    where event_id = p_event_id and status in ('confirmed', 'pending', 'invited')
  ) >= event_row.capacity then raise exception 'This event has reached capacity'; end if;

  registration_status := case
    when event_row.registration_approval = 'manual' then 'pending'
    else 'confirmed'
  end;
  insert into public.registrations (attendee_id, event_id, seat_number, status)
  values (current_user_id, p_event_id, p_seat_id, registration_status)
  returning id into registration_id;
  insert into public.event_seat_reservations (event_id, seat_id, registration_id)
  values (p_event_id, p_seat_id, registration_id);
  return registration_id;
end;
$$;

drop function if exists public.admin_list_organization_attendees(uuid, text, uuid, text);

create function public.admin_list_organization_attendees(
  p_organization_id uuid,
  p_search text default null,
  p_event_id uuid default null,
  p_status text default null,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  registration_id uuid,
  attendee_id uuid,
  attendee_name text,
  attendee_email text,
  event_id uuid,
  event_title text,
  event_start timestamptz,
  registration_status text,
  registered_at timestamptz,
  checked_in_at timestamptz,
  seat_number text,
  registration_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_organization(p_organization_id) and not exists (
    select 1
    from public.organization_members members
    join public.organization_member_events assignments on assignments.membership_id = members.id
    join public.events on events.id = assignments.event_id
    where members.organization_id = p_organization_id
      and members.user_id = (select auth.uid())
      and members.status = 'active'
      and members.role in ('event_manager', 'check_in_staff')
      and public.is_organization_member(p_organization_id)
  ) then raise exception 'Attendee access required'; end if;
  if p_search is not null and length(p_search) > 100 then raise exception 'Search query is too long'; end if;
  if p_status is not null and p_status not in ('confirmed', 'pending', 'cancelled', 'waitlisted', 'invited') then
    raise exception 'Invalid registration status filter';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000
    or p_offset is null or p_offset < 0 or p_offset > 1000000000 then
    raise exception 'Invalid attendee page range';
  end if;
  return query
  select registrations.id, profiles.id, coalesce(profiles.full_name, 'Attendee'),
    case when coalesce((attendee_settings.privacy_preferences ->> 'share_contact_with_organizers')::boolean, false)
      then auth_users.email::text else null end,
    events.id, events.title, events.start_date, registrations.status,
    registrations.created_at, attendance_logs.check_in_time, registrations.seat_number,
    registrations.registration_code
  from public.registrations
  join public.events on events.id = registrations.event_id
  join public.profiles on profiles.id = registrations.attendee_id
  join auth.users auth_users on auth_users.id = profiles.id
  left join public.attendee_settings on attendee_settings.user_id = profiles.id
  left join public.attendance_logs on attendance_logs.registration_id = registrations.id
  where events.organization_id = p_organization_id
    and (
      public.can_manage_organization(p_organization_id)
      or exists (
        select 1
        from public.organization_members members
        join public.organization_member_events assignments on assignments.membership_id = members.id
        where members.organization_id = p_organization_id
          and members.user_id = (select auth.uid())
          and members.status = 'active'
          and members.role in ('event_manager', 'check_in_staff')
          and assignments.event_id = events.id
      )
    )
    and (p_event_id is null or events.id = p_event_id)
    and (p_status is null or registrations.status = p_status)
    and (
      p_search is null
      or profiles.full_name ilike '%' || p_search || '%'
      or (
        coalesce((attendee_settings.privacy_preferences ->> 'share_contact_with_organizers')::boolean, false)
        and auth_users.email ilike '%' || p_search || '%'
      )
      or registrations.registration_code ilike '%' || p_search || '%'
    )
  order by registrations.created_at desc, registrations.id desc
  limit p_limit offset p_offset;
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
  target_registration public.registrations%rowtype;
  target_event public.events%rowtype;
  active_registration_count integer;
begin
  if p_status not in ('confirmed', 'cancelled', 'waitlisted') then
    raise exception 'Invalid registration status';
  end if;
  select * into target_registration
  from public.registrations
  where id = p_registration_id
  for update;
  if not found then raise exception 'Registration not found'; end if;
  select * into target_event
  from public.events
  where id = target_registration.event_id
  for update;
  if not found or not public.can_manage_event(target_event.id) then
    raise exception 'Registration not found or access was denied';
  end if;

  if p_status <> 'confirmed' and exists (
    select 1 from public.attendance_logs where registration_id = target_registration.id
  ) then
    raise exception 'A checked-in registration cannot be cancelled or waitlisted';
  end if;
  if p_status = 'confirmed' and target_event.ticket_price > 0 then
    raise exception 'Paid registrations cannot be confirmed until checkout is configured';
  end if;
  if p_status = 'confirmed' and target_registration.status <> 'confirmed' then
    select count(*) into active_registration_count
    from public.registrations
    where event_id = target_event.id
      and id <> target_registration.id
      and status in ('confirmed', 'pending', 'invited');
    if target_event.capacity is not null and active_registration_count >= target_event.capacity then
      raise exception 'Event capacity has been reached';
    end if;
    if target_event.venue_id is not null then
      if target_registration.seat_number is null then
        raise exception 'This attendee has no seat assigned; they must register for an available seat';
      end if;
      if not exists (
        select 1 from public.event_seat_reservations
        where event_id = target_event.id
          and registration_id = target_registration.id
          and seat_id = target_registration.seat_number
      ) then
        insert into public.event_seat_reservations (event_id, seat_id, registration_id)
        values (target_event.id, target_registration.seat_number, target_registration.id)
        on conflict do nothing;
        if not found then
          raise exception 'The attendee seat has already been reserved; choose another seat before confirming';
        end if;
      end if;
    end if;
  end if;

  if p_status in ('cancelled', 'waitlisted') then
    delete from public.event_seat_reservations
    where registration_id = target_registration.id;
  end if;
  update public.registrations set
    status = p_status,
    cancelled_at = case when p_status = 'cancelled' then now() else null end,
    cancellation_reason = case when p_status = 'cancelled' then nullif(left(trim(coalesce(p_cancellation_reason, '')), 500), '') else null end,
    updated_at = now()
  where id = p_registration_id;
end;
$$;

drop policy if exists "Organization members can view event registrations" on public.registrations;
create policy "Assigned organization staff can view event registrations"
  on public.registrations for select to authenticated
  using (
    exists (
      select 1 from public.events
      where events.id = registrations.event_id
        and (public.can_manage_organization(events.organization_id) or public.can_manage_event(events.id))
    )
  );

drop policy if exists "Organization members can view attendance logs" on public.attendance_logs;
create policy "Assigned organization staff can view attendance logs"
  on public.attendance_logs for select to authenticated
  using (
    exists (
      select 1 from public.registrations
      join public.events on events.id = registrations.event_id
      where registrations.id = attendance_logs.registration_id
        and (public.can_manage_organization(events.organization_id) or public.can_manage_event(events.id))
    )
  );

create or replace function public.admin_list_organization_members(p_organization_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  full_name text,
  email text,
  role text,
  status text,
  created_at timestamptz,
  event_assignments bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_organization(p_organization_id) then raise exception 'Organization admin access required'; end if;
  return query
  select members.id, members.user_id, coalesce(profiles.full_name, 'Staff member'),
    auth_users.email::text, members.role, members.status, members.created_at,
    (select count(*) from public.organization_member_events assignments where assignments.membership_id = members.id)
  from public.organization_members members
  join public.profiles on profiles.id = members.user_id
  join auth.users auth_users on auth_users.id = members.user_id
  where members.organization_id = p_organization_id
  order by members.created_at desc;
end;
$$;

create or replace function public.admin_assign_staff_to_event(
  p_organization_id uuid,
  p_membership_id uuid,
  p_event_id uuid,
  p_assign boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_organization(p_organization_id) then raise exception 'Organization admin access required'; end if;
  if not exists (
    select 1 from public.organization_members
    where id = p_membership_id and organization_id = p_organization_id
      and role in ('event_manager', 'check_in_staff') and status = 'active'
  ) then raise exception 'Choose active event manager or check-in staff'; end if;
  if not exists (
    select 1 from public.events where id = p_event_id and organization_id = p_organization_id
  ) then raise exception 'Event not found in this organization'; end if;
  if p_assign then
    insert into public.organization_member_events (membership_id, event_id)
    values (p_membership_id, p_event_id) on conflict do nothing;
  else
    delete from public.organization_member_events
    where membership_id = p_membership_id and event_id = p_event_id;
  end if;
  perform public.log_organization_activity(
    p_organization_id,
    case when p_assign then 'staff.event_assigned' else 'staff.event_unassigned' end,
    'event', p_event_id::text, jsonb_build_object('membership_id', p_membership_id)
  );
end;
$$;

create or replace function public.admin_change_event_status(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.events%rowtype;
begin
  if p_status not in ('draft', 'published', 'cancelled') then raise exception 'Invalid event status'; end if;
  select * into target_event from public.events where id = p_event_id for update;
  if not found or not public.can_manage_event(p_event_id) then raise exception 'Event not found or access was denied'; end if;
  if target_event.status = p_status then return; end if;
  if p_status = 'published' then
    if target_event.start_date <= now() then raise exception 'Only future events can be published'; end if;
    if target_event.ticket_price > 0 then raise exception 'Paid event publishing is unavailable until checkout is configured'; end if;
  end if;
  update public.events set status = p_status, updated_at = now() where id = p_event_id;
end;
$$;

create or replace function public.prevent_venue_booking_conflicts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.venue_id is null or new.status = 'cancelled' then return new; end if;
  perform 1 from public.venues where id = new.venue_id for update;
  if exists (
    select 1 from public.events existing
    where existing.venue_id = new.venue_id
      and existing.id is distinct from new.id
      and existing.status <> 'cancelled'
      and new.start_date < coalesce(existing.end_date, existing.start_date + interval '1 hour')
      and existing.start_date < coalesce(new.end_date, new.start_date + interval '1 hour')
  ) then raise exception 'This venue is booked during the selected event time'; end if;
  return new;
end;
$$;

create trigger events_prevent_venue_booking_conflicts
  before insert or update of venue_id, start_date, end_date, status on public.events
  for each row execute function public.prevent_venue_booking_conflicts();

create or replace function public.log_venue_activity()
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
    case when tg_op = 'INSERT' then 'venue.created' else 'venue.updated' end,
    'venue', new.id::text, jsonb_build_object('name', new.name)
  );
  return new;
end;
$$;

create trigger venues_log_organization_activity
  after insert or update on public.venues
  for each row execute function public.log_venue_activity();

create or replace function public.notify_organization_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events%rowtype;
begin
  select * into event_row from public.events where id = new.event_id;
  insert into public.notifications (user_id, type, title, message, link)
  select owners.user_id, 'registration', 'New event registration',
    'A registration was received for ' || event_row.title || '.',
    '/admin/attendees?organization_id=' || event_row.organization_id::text || '&event_id=' || event_row.id::text
  from public.superadmin_organization_owners owners
  join public.profiles on profiles.id = owners.user_id
  where owners.organization_id = event_row.organization_id
    and profiles.role = 'admin'
    and profiles.account_status = 'active'
  union
  select members.user_id, 'registration', 'New event registration',
    'A registration was received for ' || event_row.title || '.',
    '/admin/attendees?organization_id=' || event_row.organization_id::text || '&event_id=' || event_row.id::text
  from public.organization_members members
  join public.profiles on profiles.id = members.user_id
  where members.organization_id = event_row.organization_id
    and members.status = 'active'
    and profiles.account_status = 'active'
    and (
      members.role = 'organization_admin'
      or (
        members.role = 'event_manager'
        and exists (
          select 1 from public.organization_member_events assignments
          where assignments.membership_id = members.id
            and assignments.event_id = event_row.id
        )
      )
    );
  return new;
end;
$$;

create trigger registrations_notify_organization
  after insert on public.registrations
  for each row execute function public.notify_organization_registration();

create or replace function public.log_registration_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_activity_logs
    (organization_id, actor_id, action, entity_type, entity_id, details)
  select events.organization_id, (select auth.uid()),
    case when tg_op = 'INSERT' then 'registration.created' else 'registration.status_updated' end,
    'registration', new.id::text,
    jsonb_build_object(
      'status', new.status,
      'previous_status', case when tg_op = 'UPDATE' then old.status else null end
    )
  from public.events
  where events.id = new.event_id;
  return new;
end;
$$;

create trigger registrations_log_organization_activity
  after insert or update on public.registrations
  for each row execute function public.log_registration_activity();

create or replace function public.notify_attendee_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_title text;
  should_notify boolean;
  notification_title text;
  notification_message text;
begin
  select events.title into event_title
  from public.events
  where events.id = new.event_id;
  select coalesce(
    (
      select attendee_settings.notification_preferences ->> 'registration_confirmations'
      from public.attendee_settings
      where attendee_settings.user_id = new.attendee_id
    ),
    'true'
  ) = 'true'
  into should_notify;

  if not should_notify or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;
  if new.status = 'confirmed' then
    notification_title := 'Registration confirmed';
    notification_message := 'Your registration for ' || coalesce(event_title, 'an event') || ' is confirmed.';
  elsif new.status = 'pending' then
    notification_title := 'Registration submitted';
    notification_message := 'Your registration for ' || coalesce(event_title, 'an event') || ' is awaiting organizer approval.';
  elsif new.status = 'waitlisted' then
    notification_title := 'Added to waitlist';
    notification_message := 'You are on the waitlist for ' || coalesce(event_title, 'an event') || '.';
  else
    notification_title := 'Registration updated';
    notification_message := 'Your registration for ' || coalesce(event_title, 'an event') || ' is now ' || new.status || '.';
  end if;
  insert into public.notifications (user_id, type, title, message, link)
  values (new.attendee_id, 'registration', notification_title, notification_message, '/my-tickets');
  return new;
end;
$$;

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
  if not public.can_manage_organization(p_organization_id) then raise exception 'Organization admin access required'; end if;
  select jsonb_build_object(
    'eventCount', (select count(*) from public.events where organization_id = p_organization_id),
    'upcomingCount', (select count(*) from public.events where organization_id = p_organization_id and start_date >= now() and status = 'published'),
    'registrationCount', (select count(*) from public.registrations join public.events on events.id = registrations.event_id where events.organization_id = p_organization_id and registrations.status <> 'cancelled'),
    'attendeeCount', (select count(distinct registrations.attendee_id) from public.registrations join public.events on events.id = registrations.event_id where events.organization_id = p_organization_id and registrations.status <> 'cancelled'),
    'checkedInCount', (select count(*) from public.attendance_logs join public.registrations on registrations.id = attendance_logs.registration_id join public.events on events.id = registrations.event_id where events.organization_id = p_organization_id),
    'staffCount', (select count(*) from public.organization_members where organization_id = p_organization_id and status = 'active'),
    'draftCount', (select count(*) from public.events where organization_id = p_organization_id and status = 'draft'),
    'publishedCount', (select count(*) from public.events where organization_id = p_organization_id and status = 'published'),
    'ongoingCount', (select count(*) from public.events where organization_id = p_organization_id and status = 'published' and start_date <= now() and coalesce(end_date, start_date + interval '1 hour') >= now()),
    'completedCount', (select count(*) from public.events where organization_id = p_organization_id and coalesce(end_date, start_date + interval '1 hour') < now()),
    'cancelledCount', (select count(*) from public.events where organization_id = p_organization_id and status = 'cancelled'),
    'attendanceRate', coalesce((
      select round(100.0 * count(distinct attendance_logs.registration_id) /
        nullif(count(distinct registrations.id), 0), 1)
      from public.events
      join public.registrations on registrations.event_id = events.id and registrations.status = 'confirmed'
      left join public.attendance_logs on attendance_logs.registration_id = registrations.id
      where events.organization_id = p_organization_id
        and events.status <> 'cancelled'
        and coalesce(events.end_date, events.start_date + interval '1 hour') <= now()
    ), 0),
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
          and events.status = 'published'
        order by events.start_date limit 8
      ) event_rows
    ), '[]'::jsonb),
    'chart', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(chart_rows.month_start, 'Mon'),
        'registrations', chart_rows.registrations,
        'attended', chart_rows.attended
      ) order by chart_rows.month_start)
      from (
        select months.month_start,
          (select count(*) from public.registrations
            join public.events on events.id = registrations.event_id
            where events.organization_id = p_organization_id
              and events.start_date >= months.month_start
              and events.start_date < months.month_start + interval '1 month'
              and events.status <> 'cancelled'
              and registrations.status <> 'cancelled') as registrations,
          (select count(*) from public.attendance_logs
            join public.registrations on registrations.id = attendance_logs.registration_id
            join public.events on events.id = registrations.event_id
            where events.organization_id = p_organization_id
              and events.start_date >= months.month_start
              and events.start_date < months.month_start + interval '1 month'
              and events.status <> 'cancelled') as attended
        from generate_series(
          date_trunc('month', now()) - interval '5 months',
          date_trunc('month', now()),
          interval '1 month'
        ) as months(month_start)
      ) chart_rows
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
      ) logs left join public.profiles on profiles.id = logs.actor_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

drop policy if exists "Organization members can view activity" on public.organization_activity_logs;
create policy "Organization admins can view activity"
  on public.organization_activity_logs for select to authenticated
  using (public.can_manage_organization(organization_id));

drop policy if exists "Organization admins can view private event details" on public.event_private_details;
create policy "Eligible staff and attendees can view private event details"
  on public.event_private_details for select to authenticated
  using (
    exists (
      select 1 from public.events
      where events.id = event_private_details.event_id
        and (
          public.can_manage_event(events.id)
          or exists (
            select 1
            from public.organization_members members
            join public.organization_member_events assignments on assignments.membership_id = members.id
            join public.profiles on profiles.id = members.user_id
            where members.organization_id = events.organization_id
              and members.user_id = (select auth.uid())
              and members.status = 'active'
              and members.role = 'check_in_staff'
              and profiles.account_status = 'active'
              and assignments.event_id = events.id
          )
        )
    )
    or exists (
      select 1 from public.registrations
      where registrations.event_id = event_private_details.event_id
        and registrations.attendee_id = (select auth.uid())
        and registrations.status in ('confirmed', 'pending', 'invited')
    )
  );

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
      public.can_manage_event(events.id)
      or exists (
        select 1
        from public.organization_members members
        join public.organization_member_events assignments on assignments.membership_id = members.id
        join public.profiles on profiles.id = members.user_id
        where members.organization_id = events.organization_id
          and members.user_id = (select auth.uid())
          and members.status = 'active'
          and members.role = 'check_in_staff'
          and profiles.account_status = 'active'
          and assignments.event_id = events.id
      )
      or exists (
        select 1 from public.registrations
        where registrations.event_id = events.id
          and registrations.attendee_id = (select auth.uid())
          and registrations.status in ('confirmed', 'pending', 'invited')
      )
    );
$$;

create or replace function public.admin_get_organization_reports(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.can_manage_organization(p_organization_id) then
    raise exception 'Organization admin access required';
  end if;
  select jsonb_build_object(
    'registrationCount', (
      select count(*) from public.registrations
      join public.events on events.id = registrations.event_id
      where events.organization_id = p_organization_id and registrations.status <> 'cancelled'
    ),
    'attendedCount', (
      select count(*) from public.attendance_logs
      join public.registrations on registrations.id = attendance_logs.registration_id
      join public.events on events.id = registrations.event_id
      where events.organization_id = p_organization_id
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', report_rows.id,
        'title', report_rows.title,
        'start_date', report_rows.start_date,
        'status', report_rows.status,
        'capacity', report_rows.capacity,
        'ticket_price', report_rows.ticket_price,
        'currency', report_rows.currency,
        'registrations', report_rows.registrations,
        'confirmed', report_rows.confirmed,
        'attended', report_rows.attended
      ) order by report_rows.start_date desc)
      from (
        select events.id, events.title, events.start_date, events.status,
          events.capacity, events.ticket_price, events.currency,
          count(distinct registrations.id) filter (where registrations.status <> 'cancelled') as registrations,
          count(distinct registrations.id) filter (where registrations.status = 'confirmed') as confirmed,
          count(distinct attendance_logs.registration_id) as attended
        from public.events
        left join public.registrations on registrations.event_id = events.id
        left join public.attendance_logs on attendance_logs.registration_id = registrations.id
        where events.organization_id = p_organization_id
        group by events.id
      ) report_rows
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_get_event_summary(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.can_manage_event(p_event_id) then
    raise exception 'Event management access required';
  end if;
  select jsonb_build_object(
    'registrations', (
      select count(*) from public.registrations
      where event_id = p_event_id and status <> 'cancelled'
    ),
    'confirmed', (
      select count(*) from public.registrations
      where event_id = p_event_id and status = 'confirmed'
    ),
    'pending', (
      select count(*) from public.registrations
      where event_id = p_event_id and status = 'pending'
    ),
    'waitlisted', (
      select count(*) from public.registrations
      where event_id = p_event_id and status = 'waitlisted'
    ),
    'checkedIn', (
      select count(*) from public.attendance_logs
      join public.registrations on registrations.id = attendance_logs.registration_id
      where registrations.event_id = p_event_id
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.log_organization_activity(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.register_for_event(uuid) from public, anon;
revoke execute on function public.register_for_event_with_seat(uuid, text) from public, anon;
revoke execute on function public.admin_list_organization_attendees(uuid, text, uuid, text, integer, integer) from public, anon;
revoke execute on function public.admin_list_organization_members(uuid) from public, anon;
revoke execute on function public.admin_assign_staff_to_event(uuid, uuid, uuid, boolean) from public, anon;
revoke execute on function public.admin_change_event_status(uuid, text) from public, anon;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.register_for_event_with_seat(uuid, text) to authenticated;
grant execute on function public.admin_list_organization_attendees(uuid, text, uuid, text, integer, integer) to authenticated;
grant execute on function public.admin_list_organization_members(uuid) to authenticated;
grant execute on function public.admin_assign_staff_to_event(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_change_event_status(uuid, text) to authenticated;
revoke execute on function public.admin_get_organization_reports(uuid) from public, anon;
grant execute on function public.admin_get_organization_reports(uuid) to authenticated;
revoke execute on function public.admin_get_event_summary(uuid) from public, anon;
grant execute on function public.admin_get_event_summary(uuid) to authenticated;

update public.feature_flags
set enabled = true
where flag_key = 'admin-overview';
