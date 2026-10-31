alter table public.events
  add column if not exists registration_form jsonb not null default '[]'::jsonb,
  add column if not exists reminder_settings jsonb not null
    default '{"two_days_before": true, "one_day_before": true}'::jsonb;

alter table public.registrations
  add column if not exists registration_answers jsonb not null default '{}'::jsonb;

create table if not exists public.guest_event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  seat_id text,
  attendee_name text not null check (length(attendee_name) between 2 and 120),
  email text not null check (length(email) <= 254),
  registration_answers jsonb not null default '{}'::jsonb,
  registration_code text not null unique
    default ('K-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'confirmed', 'pending', 'cancelled')),
  verification_token_hash text unique,
  verification_expires_at timestamptz,
  verified_at timestamptz,
  ticket_token_hash text unique,
  ticket_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

create index if not exists guest_event_registrations_event_status_idx
  on public.guest_event_registrations (event_id, status);
create index if not exists guest_event_registrations_verification_expiry_idx
  on public.guest_event_registrations (verification_expires_at)
  where status = 'pending_verification';

alter table public.guest_event_registrations enable row level security;
revoke all on public.guest_event_registrations from anon, authenticated;
grant all on public.guest_event_registrations to service_role;

alter table public.event_seat_reservations
  alter column registration_id drop not null,
  add column guest_registration_id uuid unique
    references public.guest_event_registrations (id) on delete cascade,
  add constraint event_seat_reservations_one_registration_check
    check ((registration_id is null) <> (guest_registration_id is null));

create table if not exists public.guest_registration_rate_limits (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists guest_registration_rate_limits_email_created_idx
  on public.guest_registration_rate_limits (email_hash, created_at desc);
create index if not exists guest_registration_rate_limits_ip_created_idx
  on public.guest_registration_rate_limits (ip_hash, created_at desc);
alter table public.guest_registration_rate_limits enable row level security;
revoke all on public.guest_registration_rate_limits from anon, authenticated;
grant all on public.guest_registration_rate_limits to service_role;

create table if not exists public.event_email_deliveries (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  recipient_email text not null,
  reminder_type text not null check (reminder_type in ('two_days_before', 'one_day_before')),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, recipient_email, reminder_type)
);
alter table public.event_email_deliveries enable row level security;
revoke all on public.event_email_deliveries from anon, authenticated;
grant all on public.event_email_deliveries to service_role;

create or replace function public.claim_event_email_delivery(
  p_event_id uuid,
  p_recipient_email text,
  p_reminder_type text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    insert into public.event_email_deliveries (
      event_id, recipient_email, reminder_type, status, last_error, sent_at, created_at
    )
    values (p_event_id, lower(trim(p_recipient_email)), p_reminder_type, 'sending', null, null, now())
    on conflict (event_id, recipient_email, reminder_type) do update
      set status = 'sending', last_error = null, sent_at = null, created_at = now()
      where public.event_email_deliveries.status = 'failed'
        or (public.event_email_deliveries.status = 'sending'
          and public.event_email_deliveries.created_at < now() - interval '20 minutes')
    returning id
  )
  select exists(select 1 from claimed);
$$;

revoke execute on function public.claim_event_email_delivery(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_event_email_delivery(uuid, text, text) to service_role;

create or replace function public.admin_save_event_with_registration_form(
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
  p_clear_online_meeting_url boolean,
  p_banner_url text,
  p_clear_banner boolean,
  p_registration_form jsonb,
  p_reminder_settings jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  field_item jsonb;
  field_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_registration_form, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_registration_form, '[]'::jsonb)) > 20 then
    raise exception 'Registration forms can contain up to 20 questions.';
  end if;
  for field_item in select value from jsonb_array_elements(coalesce(p_registration_form, '[]'::jsonb))
  loop
    field_count := field_count + 1;
    if coalesce(field_item->>'id', '') !~ '^[a-zA-Z0-9_-]{1,40}$'
      or length(coalesce(field_item->>'label', '')) not between 1 and 160
      or coalesce(field_item->>'type', '') not in ('short_text', 'long_text', 'number', 'date', 'dropdown', 'single_choice', 'checkboxes')
      or jsonb_typeof(coalesce(field_item->'required', 'false'::jsonb)) <> 'boolean' then
      raise exception 'A registration form question is invalid.';
    end if;
    if field_item->>'type' in ('dropdown', 'single_choice', 'checkboxes')
      and (jsonb_typeof(field_item->'options') <> 'array'
        or jsonb_array_length(field_item->'options') not between 1 and 30) then
      raise exception 'Choice questions need between 1 and 30 options.';
    end if;
  end loop;

  if jsonb_typeof(coalesce(p_reminder_settings, '{}'::jsonb)) <> 'object' then
    raise exception 'Event reminder settings are invalid.';
  end if;

  saved_id := public.admin_save_event_with_banner(
    p_event_id, p_organization_id, p_title, p_slug, p_short_description,
    p_description, p_category, p_tags, p_start_date, p_end_date,
    p_registration_opens_at, p_registration_deadline, p_checkin_opens_at,
    p_checkin_closes_at, p_venue_id, p_venue_name, p_city, p_capacity,
    p_ticket_price, p_currency, p_status, p_approval, p_waitlist,
    p_online_meeting_url, p_timezone, p_clear_online_meeting_url,
    p_banner_url, p_clear_banner
  );

  update public.events
  set registration_form = coalesce(p_registration_form, '[]'::jsonb),
      reminder_settings = jsonb_build_object(
        'two_days_before', coalesce((p_reminder_settings->>'two_days_before')::boolean, true),
        'one_day_before', coalesce((p_reminder_settings->>'one_day_before')::boolean, true)
      ),
      updated_at = now()
  where id = saved_id and organization_id = p_organization_id;
  return saved_id;
end;
$$;

revoke execute on function public.admin_save_event_with_registration_form(
  uuid, uuid, text, text, text, text, text, text[], timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, uuid, text, text,
  integer, numeric, text, text, text, boolean, text, text, boolean, text,
  boolean, jsonb, jsonb
) from public, anon;
grant execute on function public.admin_save_event_with_registration_form(
  uuid, uuid, text, text, text, text, text, text[], timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, uuid, text, text,
  integer, numeric, text, text, text, boolean, text, text, boolean, text,
  boolean, jsonb, jsonb
) to authenticated;

create or replace function public.register_for_event_with_form(
  p_event_id uuid,
  p_seat_id text,
  p_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_id uuid;
  event_form jsonb;
  field_item jsonb;
  answer jsonb;
  field_id text;
begin
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'Registration answers must be an object.';
  end if;
  select registration_form into event_form
  from public.events
  where id = p_event_id and status = 'published';
  if not found then raise exception 'This event is not available for registration.'; end if;

  for field_item in select value from jsonb_array_elements(coalesce(event_form, '[]'::jsonb))
  loop
    field_id := field_item->>'id';
    answer := p_answers->field_id;
    if coalesce((field_item->>'required')::boolean, false)
      and (answer is null or answer = 'null'::jsonb or answer = '""'::jsonb or answer = '[]'::jsonb) then
      raise exception 'Complete the required registration questions.';
    end if;
    if answer is not null and answer <> 'null'::jsonb then
      if field_item->>'type' in ('dropdown', 'single_choice')
        and not exists (select 1 from jsonb_array_elements_text(field_item->'options') option where option = answer #>> '{}') then
        raise exception 'A registration answer is not one of the available choices.';
      end if;
      if field_item->>'type' = 'checkboxes' and (
        jsonb_typeof(answer) <> 'array'
        or exists (
          select 1 from jsonb_array_elements_text(answer) selected
          where not exists (select 1 from jsonb_array_elements_text(field_item->'options') option where option = selected)
        )
      ) then
        raise exception 'A registration answer is not one of the available choices.';
      end if;
    end if;
  end loop;

  registration_id := case
    when nullif(p_seat_id, '') is null then public.register_for_event(p_event_id)
    else public.register_for_event_with_seat(p_event_id, p_seat_id)
  end;
  update public.registrations
  set registration_answers = coalesce(p_answers, '{}'::jsonb)
  where id = registration_id and attendee_id = (select auth.uid());
  return registration_id;
end;
$$;

revoke execute on function public.register_for_event_with_form(uuid, text, jsonb) from public, anon;
grant execute on function public.register_for_event_with_form(uuid, text, jsonb) to authenticated;

create or replace function public.create_guest_event_registration(
  p_event_id uuid,
  p_attendee_name text,
  p_email text,
  p_seat_id text,
  p_answers jsonb,
  p_verification_token_hash text,
  p_email_hash text,
  p_ip_hash text
)
returns table (registration_id uuid, event_title text, start_date timestamptz, organization_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events%rowtype;
  email_attempts integer;
  ip_attempts integer;
  new_registration_id uuid;
  field_item jsonb;
  answer jsonb;
  field_id text;
begin
  if length(trim(p_attendee_name)) not between 2 and 120
    or length(trim(p_email)) > 254
    or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_verification_token_hash !~ '^[0-9a-f]{64}$'
    or p_email_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'Enter valid registration details.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_email_hash || p_ip_hash, 0));
  select count(*) into email_attempts
  from public.guest_registration_rate_limits
  where guest_registration_rate_limits.email_hash = p_email_hash
    and created_at > now() - interval '1 hour';
  select count(*) into ip_attempts
  from public.guest_registration_rate_limits
  where guest_registration_rate_limits.ip_hash = p_ip_hash
    and created_at > now() - interval '1 hour';
  if email_attempts >= 3 or ip_attempts >= 15 then
    raise exception 'Too many attempts. Please wait before trying again.';
  end if;
  insert into public.guest_registration_rate_limits (email_hash, ip_hash)
  values (p_email_hash, p_ip_hash);

  select events.* into event_row
  from public.events
  where events.id = p_event_id
  for update;
  if not found or event_row.status <> 'published' or event_row.ticket_price <> 0
    or event_row.start_date <= now()
    or not public.is_public_organization_active(event_row.organization_id)
    or (event_row.registration_opens_at is not null and now() < event_row.registration_opens_at)
    or (event_row.registration_deadline is not null and now() > event_row.registration_deadline) then
    raise exception 'This event is not available for guest registration.';
  end if;
  if (event_row.venue_id is null and nullif(p_seat_id, '') is not null)
    or (event_row.venue_id is not null and (p_seat_id is null or length(p_seat_id) > 24)) then
    raise exception 'Choose a valid seat for this event.';
  end if;
  if event_row.venue_id is not null and not exists (
    select 1
    from public.venues
    cross join lateral jsonb_array_elements(public.venues.seat_plan -> 'rows') as row_item
    cross join lateral jsonb_array_elements(row_item -> 'seats') as seat_item
    where public.venues.id = event_row.venue_id
      and seat_item ->> 'id' = p_seat_id
      and seat_item ->> 'enabled' = 'true'
  ) then
    raise exception 'The selected seat is not available.';
  end if;

  for field_item in select value from jsonb_array_elements(coalesce(event_row.registration_form, '[]'::jsonb))
  loop
    field_id := field_item->>'id';
    answer := p_answers->field_id;
    if coalesce((field_item->>'required')::boolean, false)
      and (answer is null or answer = 'null'::jsonb or answer = '""'::jsonb or answer = '[]'::jsonb) then
      raise exception 'Complete the required registration questions.';
    end if;
    if answer is not null and answer <> 'null'::jsonb then
      if field_item->>'type' in ('dropdown', 'single_choice')
        and not exists (select 1 from jsonb_array_elements_text(field_item->'options') option where option = answer #>> '{}') then
        raise exception 'A registration answer is not one of the available choices.';
      end if;
      if field_item->>'type' = 'checkboxes' and (
        jsonb_typeof(answer) <> 'array'
        or exists (
          select 1 from jsonb_array_elements_text(answer) selected
          where not exists (select 1 from jsonb_array_elements_text(field_item->'options') option where option = selected)
        )
      ) then
        raise exception 'A registration answer is not one of the available choices.';
      end if;
    end if;
  end loop;

  if exists (
    select 1 from public.registrations
    where attendee_id in (select id from auth.users where lower(email) = lower(trim(p_email)))
      and event_id = p_event_id
  ) then
    raise exception 'This email already has a registration for this event.';
  end if;

  select guest_event_registrations.id into new_registration_id
  from public.guest_event_registrations
  where event_id = p_event_id and lower(email) = lower(trim(p_email));
  if found then
    update public.guest_event_registrations
    set verification_token_hash = p_verification_token_hash,
        verification_expires_at = now() + interval '30 minutes',
        status = 'pending_verification',
        verified_at = null,
        ticket_token_hash = null,
        ticket_expires_at = null,
        attendee_name = trim(p_attendee_name),
        registration_answers = coalesce(p_answers, '{}'::jsonb),
        seat_id = p_seat_id
    where id = new_registration_id and status <> 'confirmed' and status <> 'pending';
    if not found then raise exception 'This email already has a registration for this event.'; end if;
  else
    insert into public.guest_event_registrations (
      event_id, seat_id, attendee_name, email, registration_answers,
      verification_token_hash, verification_expires_at
    )
    values (
      p_event_id, p_seat_id, trim(p_attendee_name), lower(trim(p_email)), coalesce(p_answers, '{}'::jsonb),
      p_verification_token_hash, now() + interval '30 minutes'
    )
    returning id into new_registration_id;
  end if;

  return query select new_registration_id, event_row.title, event_row.start_date,
    (select organizations.name from public.organizations where organizations.id = event_row.organization_id);
end;
$$;

revoke execute on function public.create_guest_event_registration(uuid, text, text, text, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_guest_event_registration(uuid, text, text, text, jsonb, text, text, text)
  to service_role;

create or replace function public.get_event_account_reminder_recipients(p_event_id uuid)
returns table (email text, attendee_name text, registration_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select users.email::text, profiles.full_name, registrations.registration_code
  from public.registrations
  join auth.users users on users.id = registrations.attendee_id
  left join public.profiles on profiles.id = registrations.attendee_id
  left join public.attendee_settings on attendee_settings.user_id = registrations.attendee_id
  where registrations.event_id = p_event_id
    and registrations.status = 'confirmed'
    and users.email is not null
    and users.email_confirmed_at is not null
    and coalesce((attendee_settings.notification_preferences->>'event_reminders')::boolean, true);
$$;

revoke execute on function public.get_event_account_reminder_recipients(uuid) from public, anon, authenticated;
grant execute on function public.get_event_account_reminder_recipients(uuid) to service_role;

create or replace function public.verify_guest_event_registration(
  p_verification_token_hash text,
  p_ticket_token_hash text
)
returns table (
  registration_id uuid,
  attendee_name text,
  email text,
  event_title text,
  start_date timestamptz,
  registration_code text,
  registration_status text,
  organization_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_row public.guest_event_registrations%rowtype;
  event_row public.events%rowtype;
  registered_count integer;
begin
  select * into registration_row
  from public.guest_event_registrations
  where verification_token_hash = p_verification_token_hash
    and status = 'pending_verification'
    and verification_expires_at > now()
  for update;
  if not found then raise exception 'This verification link is invalid or expired. Please register again.'; end if;

  select * into event_row from public.events where id = registration_row.event_id for update;
  if not found or event_row.status <> 'published' or event_row.start_date <= now()
    or (event_row.registration_deadline is not null and now() > event_row.registration_deadline) then
    raise exception 'This event is no longer available for registration.';
  end if;
  select count(*) into registered_count
  from (
    select id from public.registrations
    where event_id = event_row.id and status in ('confirmed', 'pending', 'invited')
    union all
    select id from public.guest_event_registrations
    where event_id = event_row.id and status in ('confirmed', 'pending')
  ) active_registrations;
  if event_row.capacity is not null and registered_count >= event_row.capacity then
    raise exception 'This event has reached capacity.';
  end if;
  if registration_row.seat_id is not null and exists (
    select 1 from public.event_seat_reservations
    where event_seat_reservations.event_id = event_row.id
      and event_seat_reservations.seat_id = registration_row.seat_id
  ) then
    raise exception 'This seat has already been reserved. Please register again and choose another seat.';
  end if;

  update public.guest_event_registrations
  set status = case when event_row.registration_approval = 'manual' then 'pending' else 'confirmed' end,
      verified_at = now(),
      verification_token_hash = null,
      verification_expires_at = null,
      ticket_token_hash = p_ticket_token_hash,
      ticket_expires_at = greatest(coalesce(event_row.end_date, event_row.start_date + interval '1 hour'), now()) + interval '7 days'
  where id = registration_row.id
  returning * into registration_row;
  if registration_row.seat_id is not null then
    insert into public.event_seat_reservations (event_id, seat_id, guest_registration_id)
    values (event_row.id, registration_row.seat_id, registration_row.id);
  end if;

  return query select registration_row.id, registration_row.attendee_name,
    registration_row.email, event_row.title, event_row.start_date,
    registration_row.registration_code, registration_row.status,
    (select organizations.name from public.organizations where organizations.id = event_row.organization_id);
end;
$$;

revoke execute on function public.verify_guest_event_registration(text, text) from public, anon, authenticated;
grant execute on function public.verify_guest_event_registration(text, text) to service_role;

create or replace function public.get_guest_event_ticket(p_ticket_token_hash text)
returns table (
  attendee_name text,
  event_title text,
  start_date timestamptz,
  venue_name text,
  city text,
  registration_code text,
  registration_status text,
  registration_answers jsonb,
  organization_name text,
  registration_form jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select guests.attendee_name, events.title, events.start_date,
    events.venue_name, events.city, guests.registration_code,
    guests.status, guests.registration_answers, organizations.name, events.registration_form
  from public.guest_event_registrations guests
  join public.events on events.id = guests.event_id
  join public.organizations on organizations.id = events.organization_id
  where guests.ticket_token_hash = p_ticket_token_hash
    and guests.status in ('confirmed', 'pending')
    and guests.verified_at is not null
    and guests.ticket_expires_at > now();
$$;

revoke execute on function public.get_guest_event_ticket(text) from public, anon, authenticated;
grant execute on function public.get_guest_event_ticket(text) to service_role;
