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
  if p_status = 'published' and p_ticket_price > 0 and p_currency <> 'PHP' then
    raise exception 'Paid event publishing currently supports PHP checkout only';
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
