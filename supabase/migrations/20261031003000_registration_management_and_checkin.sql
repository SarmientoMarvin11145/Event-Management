alter table public.payment_transactions
  add column if not exists payment_method text,
  add column if not exists refund_reason text,
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refund_requested_by uuid references public.profiles (id) on delete set null;

alter table public.registration_tickets
  drop constraint if exists registration_tickets_status_check;
alter table public.registration_tickets
  add constraint registration_tickets_status_check
  check (status in ('confirmed', 'cancelled', 'used', 'checked_in'));

update public.registration_tickets
set status = 'checked_in'
where status = 'used';

update public.registration_tickets
set status = 'checked_in'
where status = 'confirmed'
  and exists (
    select 1 from public.attendance_logs
    where attendance_logs.registration_id = registration_tickets.registration_id
  );

create table if not exists public.registration_status_history (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists registration_status_history_registration_idx
  on public.registration_status_history (registration_id, created_at desc);

alter table public.registration_status_history enable row level security;
grant select on public.registration_status_history to authenticated;

create policy "Attendees and event managers can view registration history"
  on public.registration_status_history for select to authenticated
  using (
    exists (
      select 1 from public.registrations
      where registrations.id = registration_status_history.registration_id
        and (
          registrations.attendee_id = (select auth.uid())
          or public.can_manage_event(registrations.event_id)
        )
    )
  );

insert into public.registration_status_history (
  registration_id, from_status, to_status, reason, created_at
)
select registrations.id, null, registrations.status,
  'Status snapshot before history tracking was enabled',
  registrations.updated_at
from public.registrations
where not exists (
  select 1 from public.registration_status_history
  where registration_status_history.registration_id = registrations.id
);

create table if not exists public.ticket_check_ins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.registration_tickets (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  checked_in_by uuid references public.profiles (id) on delete set null,
  checked_in_at timestamptz not null default now()
);

create index if not exists ticket_check_ins_event_time_idx
  on public.ticket_check_ins (event_id, checked_in_at desc);

alter table public.ticket_check_ins enable row level security;
grant select on public.ticket_check_ins to authenticated;

create policy "Attendees and event managers can view ticket check-ins"
  on public.ticket_check_ins for select to authenticated
  using (
    exists (
      select 1 from public.registrations
      where registrations.id = ticket_check_ins.registration_id
        and (
          registrations.attendee_id = (select auth.uid())
          or public.can_manage_event(ticket_check_ins.event_id)
        )
    )
  );

create or replace function public.record_registration_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_title text;
begin
  if tg_op = 'INSERT' then
    insert into public.registration_status_history (
      registration_id, from_status, to_status, actor_id, reason
    ) values (
      new.id, null, new.status, (select auth.uid()), 'Registration created'
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.registration_status_history (
      registration_id, from_status, to_status, reason, actor_id
    ) values (
      new.id, old.status, new.status, new.cancellation_reason, (select auth.uid())
    );

    if new.status in ('confirmed', 'cancelled') then
      select events.title into event_title
      from public.events
      where events.id = new.event_id;
      insert into public.notifications (user_id, type, title, message, link)
      values (
        new.attendee_id,
        'registration',
        case when new.status = 'confirmed' then 'Your ticket is ready' else 'Registration cancelled' end,
        case when new.status = 'confirmed'
          then 'Your registration for ' || coalesce(event_title, 'the event') || ' is confirmed. Your ticket is ready in My Tickets.'
          else 'Your registration for ' || coalesce(event_title, 'the event') || ' was cancelled. A cancellation does not mean your payment was refunded.'
        end,
        '/my-tickets'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_record_status_history on public.registrations;
create trigger registrations_record_status_history
  after insert or update of status on public.registrations
  for each row execute function public.record_registration_status_history();

revoke execute on function public.record_registration_status_history() from public, anon, authenticated;

create or replace function public.can_checkin_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_event(p_event_id)
    or exists (
      select 1
      from public.events
      join public.organization_member_events assignments on assignments.event_id = events.id
      join public.organization_members members on members.id = assignments.membership_id
      join public.profiles on profiles.id = members.user_id
      where events.id = p_event_id
        and members.user_id = (select auth.uid())
        and members.role = 'check_in_staff'
        and members.status = 'active'
        and profiles.account_status = 'active'
    );
$$;

revoke execute on function public.can_checkin_event(uuid) from public, anon;
grant execute on function public.can_checkin_event(uuid) to authenticated;

create or replace function public.admin_registration_dashboard_summary(p_organization_id uuid)
returns table (
  total_registrations bigint,
  pending_registrations bigint,
  confirmed_registrations bigint,
  cancelled_registrations bigint,
  refund_requests bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_organization(p_organization_id)
    and not exists (
      select 1
      from public.events
      where events.organization_id = p_organization_id
        and public.can_manage_event(events.id)
    ) then
    raise exception 'Organization access required';
  end if;

  return query
  select count(*)::bigint,
    count(*) filter (where registrations.status = 'pending')::bigint,
    count(*) filter (where registrations.status = 'confirmed')::bigint,
    count(*) filter (where registrations.status = 'cancelled')::bigint,
    count(*) filter (where payments.refund_status = 'pending')::bigint
  from public.registrations
  join public.events on events.id = registrations.event_id
  left join lateral (
    select payment_transactions.refund_status
    from public.payment_transactions
    where payment_transactions.registration_id = registrations.id
      and payment_transactions.payment_type = 'event_ticket'
    order by payment_transactions.created_at desc
    limit 1
  ) payments on true
  where events.organization_id = p_organization_id
    and public.can_manage_event(events.id);
end;
$$;

revoke execute on function public.admin_registration_dashboard_summary(uuid) from public, anon;
grant execute on function public.admin_registration_dashboard_summary(uuid) to authenticated;

create or replace function public.admin_list_event_registrations(
  p_organization_id uuid,
  p_search text default '',
  p_event_id uuid default null,
  p_registration_status text default null,
  p_payment_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  registration_id uuid,
  registration_reference text,
  attendee_name text,
  attendee_email text,
  attendee_phone text,
  event_id uuid,
  event_name text,
  event_start_date timestamptz,
  event_venue text,
  event_banner text,
  ticket_plan text,
  ticket_quantity integer,
  total_amount numeric,
  currency text,
  payment_method text,
  payment_status text,
  registration_status text,
  registration_date timestamptz,
  payment_reference text,
  payment_id text,
  refund_status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 100
    or p_offset is null or p_offset < 0
    or length(coalesce(p_search, '')) > 100 then
    raise exception 'Invalid registration list parameters';
  end if;
  if not public.can_manage_organization(p_organization_id)
    and not exists (
      select 1 from public.events
      where events.organization_id = p_organization_id
        and public.can_manage_event(events.id)
    ) then
    raise exception 'Organization access required';
  end if;

  return query
  with registration_rows as (
    select registrations.id as registration_id,
      registrations.registration_code as registration_reference,
      coalesce(registrations.attendee_name, profiles.full_name, '') as attendee_name,
      coalesce(registrations.attendee_email, '') as attendee_email,
      registrations.attendee_phone,
      events.id as event_id,
      events.title as event_name,
      events.start_date as event_start_date,
      events.venue_name as event_venue,
      events.banner_url as event_banner,
      coalesce(event_ticket_plans.name, registrations.ticket_type, 'General admission') as ticket_plan,
      registrations.quantity as ticket_quantity,
      coalesce(payments.amount::numeric / 100, registrations.ticket_unit_price * registrations.quantity) as total_amount,
      coalesce(payments.currency, events.currency, 'PHP') as currency,
      coalesce(payments.payment_method, case when payments.id is not null then 'PayMongo' else 'Free' end) as payment_method,
      coalesce(payments.status, case when registrations.ticket_unit_price = 0 then 'free' else 'unpaid' end) as payment_status,
      registrations.status as registration_status,
      registrations.created_at as registration_date,
      payments.reference_number as payment_reference,
      payments.payment_id,
      coalesce(payments.refund_status, 'none') as refund_status
    from public.registrations
    join public.events on events.id = registrations.event_id
    left join public.profiles on profiles.id = registrations.attendee_id
    left join public.event_ticket_plans on event_ticket_plans.id = registrations.ticket_plan_id
    left join lateral (
      select payment_transactions.id, payment_transactions.amount,
        payment_transactions.currency, payment_transactions.payment_method,
        payment_transactions.status, payment_transactions.reference_number,
        payment_transactions.payment_id, payment_transactions.refund_status
      from public.payment_transactions
      where payment_transactions.registration_id = registrations.id
        and payment_transactions.payment_type = 'event_ticket'
      order by payment_transactions.created_at desc
      limit 1
    ) payments on true
    where events.organization_id = p_organization_id
      and public.can_manage_event(events.id)
      and (p_event_id is null or events.id = p_event_id)
      and (p_registration_status is null or registrations.status = p_registration_status)
      and (p_payment_status is null or coalesce(payments.status, case
        when registrations.ticket_unit_price = 0 then 'free' else 'unpaid' end) = p_payment_status)
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or position(lower(trim(p_search)) in lower(concat_ws(' ',
          registrations.registration_code,
          registrations.attendee_name,
          registrations.attendee_email,
          profiles.full_name,
          events.title
        ))) > 0
      )
  )
  select registration_rows.*, count(*) over ()::bigint
  from registration_rows
  order by registration_date desc
  limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.admin_list_event_registrations(uuid, text, uuid, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_event_registrations(uuid, text, uuid, text, text, integer, integer) to authenticated;

create or replace function public.admin_get_registration_management_detail(p_registration_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'registration', jsonb_build_object(
      'id', registrations.id,
      'reference', registrations.registration_code,
      'status', registrations.status,
      'ticket_type', registrations.ticket_type,
      'seat_number', registrations.seat_number,
      'quantity', registrations.quantity,
      'unit_price', registrations.ticket_unit_price,
      'created_at', registrations.created_at,
      'cancelled_at', registrations.cancelled_at,
      'cancellation_reason', registrations.cancellation_reason,
      'attendee_name', coalesce(registrations.attendee_name, profiles.full_name, ''),
      'attendee_email', coalesce(registrations.attendee_email, ''),
      'attendee_phone', registrations.attendee_phone,
      'attendee_address', registrations.attendee_address
    ),
    'event', jsonb_build_object(
      'id', events.id,
      'title', events.title,
      'start_date', events.start_date,
      'end_date', events.end_date,
      'venue_name', events.venue_name,
      'city', events.city,
      'banner_url', events.banner_url,
      'currency', events.currency
    ),
    'plan', jsonb_build_object(
      'name', coalesce(event_ticket_plans.name, registrations.ticket_type, 'General admission'),
      'price', registrations.ticket_unit_price
    ),
    'payment', case when payments.id is null then null else jsonb_build_object(
      'reference_number', payments.reference_number,
      'payment_id', payments.payment_id,
      'checkout_session_id', payments.checkout_session_id,
      'status', payments.status,
      'amount', payments.amount,
      'currency', payments.currency,
      'payment_method', payments.payment_method,
      'refund_id', payments.refund_id,
      'refund_status', payments.refund_status,
      'refund_reason', payments.refund_reason,
      'refund_requested_at', payments.refund_requested_at,
      'refund_requested_by', payments.refund_requested_by,
      'paid_at', payments.paid_at,
      'refunded_at', payments.refunded_at
    ) end,
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ticket_number', registration_tickets.ticket_number,
        'status', registration_tickets.status,
        'seat_number', registration_tickets.seat_number,
        'created_at', registration_tickets.created_at
      ) order by registration_tickets.created_at)
      from public.registration_tickets
      where registration_tickets.registration_id = registrations.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'from_status', history.from_status,
        'to_status', history.to_status,
        'reason', history.reason,
        'actor_name', profiles_actor.full_name,
        'created_at', history.created_at
      ) order by history.created_at desc)
      from public.registration_status_history history
      left join public.profiles profiles_actor on profiles_actor.id = history.actor_id
      where history.registration_id = registrations.id
    ), '[]'::jsonb)
  ) into result
  from public.registrations
  join public.events on events.id = registrations.event_id
  left join public.profiles on profiles.id = registrations.attendee_id
  left join public.event_ticket_plans on event_ticket_plans.id = registrations.ticket_plan_id
  left join lateral (
    select payment_transactions.*
    from public.payment_transactions
    where payment_transactions.registration_id = registrations.id
      and payment_transactions.payment_type = 'event_ticket'
    order by payment_transactions.created_at desc
    limit 1
  ) payments on true
  where registrations.id = p_registration_id
    and public.can_manage_event(events.id);

  if result is null then raise exception 'Registration not found or access was denied'; end if;
  return result;
end;
$$;

revoke execute on function public.admin_get_registration_management_detail(uuid) from public, anon;
grant execute on function public.admin_get_registration_management_detail(uuid) to authenticated;

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
  active_registration_count bigint;
  active_plan_count bigint;
  assigned_seat_count bigint;
begin
  if p_status not in ('confirmed', 'cancelled', 'waitlisted') then
    raise exception 'Invalid registration status';
  end if;
  if p_status = 'cancelled' and nullif(trim(p_cancellation_reason), '') is null then
    raise exception 'A cancellation reason is required';
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
  if p_status <> 'confirmed' and (
    exists (select 1 from public.attendance_logs where registration_id = target_registration.id)
    or exists (select 1 from public.ticket_check_ins where registration_id = target_registration.id)
  ) then
    raise exception 'A checked-in registration cannot be cancelled or waitlisted';
  end if;
  if p_status = 'confirmed' and target_registration.status = 'cancelled' then
    raise exception 'Cancelled registrations cannot be confirmed';
  end if;
  if p_status = 'confirmed' and target_registration.ticket_unit_price > 0 and not exists (
    select 1 from public.payment_transactions
    where registration_id = target_registration.id
      and payment_type = 'event_ticket'
      and status = 'paid'
      and refund_status = 'none'
  ) then
    raise exception 'Paid registrations cannot be confirmed until payment is verified';
  end if;
  if p_status = 'confirmed' and target_registration.status <> 'confirmed' then
    select coalesce(sum(quantity), 0) into active_registration_count
    from public.registrations
    where event_id = target_event.id
      and id <> target_registration.id
      and status in ('confirmed', 'pending', 'invited');
    if target_event.capacity is not null
      and active_registration_count + target_registration.quantity > target_event.capacity then
      raise exception 'Event capacity has been reached';
    end if;
    if target_registration.ticket_plan_id is not null then
      select coalesce(sum(quantity), 0) into active_plan_count
      from public.registrations
      where ticket_plan_id = target_registration.ticket_plan_id
        and id <> target_registration.id
        and status in ('confirmed', 'pending');
      if exists (
        select 1 from public.event_ticket_plans
        where id = target_registration.ticket_plan_id
          and capacity is not null
          and active_plan_count + target_registration.quantity > capacity
      ) then raise exception 'Ticket plan capacity has been reached'; end if;
    end if;
    if target_event.venue_id is not null then
      select count(*) into assigned_seat_count
      from public.event_seat_reservations
      where event_id = target_event.id
        and registration_id = target_registration.id;
      if assigned_seat_count < target_registration.quantity
        and target_registration.quantity = 1
        and target_registration.seat_number is not null then
        insert into public.event_seat_reservations (event_id, seat_id, registration_id)
        values (target_event.id, target_registration.seat_number, target_registration.id)
        on conflict do nothing;
        if not found then
          raise exception 'The attendee seat has already been reserved; choose another seat before confirming';
        end if;
        assigned_seat_count := assigned_seat_count + 1;
      end if;
      if assigned_seat_count <> target_registration.quantity then
        raise exception 'Every ticket needs an available assigned seat';
      end if;
    end if;
  end if;
  if p_status in ('cancelled', 'waitlisted') then
    delete from public.event_seat_reservations where registration_id = target_registration.id;
  end if;
  update public.registrations set
    status = p_status,
    cancelled_at = case when p_status = 'cancelled' then now() else null end,
    cancellation_reason = case when p_status = 'cancelled'
      then left(trim(p_cancellation_reason), 500) else null end,
    updated_at = now()
  where id = p_registration_id;
  if p_status = 'confirmed' then
    perform public.issue_registration_tickets(p_registration_id);
  end if;
end;
$$;

revoke execute on function public.admin_update_registration(uuid, text, text) from public, anon;
grant execute on function public.admin_update_registration(uuid, text, text) to authenticated;

create or replace function public.admin_cancel_pending_registration(
  p_registration_id uuid,
  p_checkout_session_id text,
  p_cancellation_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_row public.registrations%rowtype;
  payment_row public.payment_transactions%rowtype;
begin
  if p_cancellation_reason is null or length(trim(p_cancellation_reason)) not between 1 and 500 then
    raise exception 'A cancellation reason of 1 to 500 characters is required';
  end if;
  select * into registration_row
  from public.registrations
  where id = p_registration_id
  for update;
  if not found or not public.can_manage_event(registration_row.event_id) then
    raise exception 'Registration not found or access was denied';
  end if;
  select * into payment_row
  from public.payment_transactions
  where registration_id = p_registration_id
    and payment_type = 'event_ticket'
  order by created_at desc
  limit 1
  for update;
  if not found or payment_row.status <> 'pending'
    or payment_row.checkout_session_id is null
    or payment_row.checkout_session_id <> p_checkout_session_id then
    raise exception 'The pending payment changed. Refresh the registration and try again';
  end if;
  update public.payment_transactions
  set status = 'cancelled'
  where id = payment_row.id and status = 'pending';
  if not found then raise exception 'The payment status changed before cancellation'; end if;
  delete from public.event_seat_reservations
  where registration_id = p_registration_id;
  update public.registrations
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = left(trim(p_cancellation_reason), 500),
      updated_at = now()
  where id = p_registration_id
    and status in ('pending', 'confirmed', 'waitlisted', 'invited');
  if not found then raise exception 'The registration status changed before cancellation'; end if;
end;
$$;

revoke execute on function public.admin_cancel_pending_registration(uuid, text, text) from public, anon;
grant execute on function public.admin_cancel_pending_registration(uuid, text, text) to authenticated;

create or replace function public.admin_check_in_ticket(p_event_id uuid, p_qr_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket_row public.registration_tickets%rowtype;
  registration_row public.registrations%rowtype;
  payment_row public.payment_transactions%rowtype;
  checkin_open timestamptz;
  checkin_close timestamptz;
  result jsonb;
begin
  if not public.can_checkin_event(p_event_id) then
    raise exception 'Check-in access denied for this event';
  end if;
  select * into ticket_row
  from public.registration_tickets
  where qr_token = p_qr_token
  for update;
  if not found then raise exception 'Ticket QR code is invalid'; end if;
  select * into registration_row
  from public.registrations
  where id = ticket_row.registration_id
  for update;
  if registration_row.event_id <> p_event_id then
    raise exception 'This ticket is for a different event';
  end if;
  select events.checkin_opens_at, events.checkin_closes_at
  into checkin_open, checkin_close
  from public.events
  where events.id = p_event_id and events.status <> 'cancelled';
  if not found then
    raise exception 'This event has been cancelled';
  end if;
  if checkin_open is not null and now() < checkin_open then raise exception 'Check-in is not open yet'; end if;
  if checkin_close is not null and now() > checkin_close then raise exception 'Check-in is closed'; end if;
  if registration_row.status <> 'confirmed' or ticket_row.status <> 'confirmed' then
    raise exception 'This ticket is cancelled, refunded, or not confirmed';
  end if;
  select * into payment_row
  from public.payment_transactions
  where registration_id = registration_row.id
    and payment_type = 'event_ticket'
  order by created_at desc
  limit 1;
  if registration_row.ticket_unit_price > 0
    and (payment_row.id is null or payment_row.status <> 'paid'
      or payment_row.refund_status = 'succeeded') then
    raise exception 'This ticket does not have a valid confirmed payment';
  end if;
  insert into public.ticket_check_ins (
    ticket_id, registration_id, event_id, checked_in_by
  ) values (
    ticket_row.id, registration_row.id, p_event_id, (select auth.uid())
  );
  insert into public.attendance_logs (registration_id, check_in_method)
  values (registration_row.id, 'qr')
  on conflict (registration_id) do nothing;
  update public.registration_tickets
  set status = 'checked_in'
  where id = ticket_row.id;
  result := jsonb_build_object(
    'ticket_number', ticket_row.ticket_number,
    'attendee_name', coalesce(registration_row.attendee_name, ''),
    'event_name', (select events.title from public.events where events.id = p_event_id)
  );
  return result;
end;
$$;

revoke execute on function public.admin_check_in_ticket(uuid, uuid) from public, anon;
grant execute on function public.admin_check_in_ticket(uuid, uuid) to authenticated;

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
  if event_org_id is null or not public.can_checkin_event(target_event_id) then
    raise exception 'Confirmed registration not found or check-in access was denied';
  end if;
  if checkin_open is not null and now() < checkin_open then raise exception 'Check-in is not open yet'; end if;
  if checkin_close is not null and now() > checkin_close then raise exception 'Check-in is closed'; end if;
  insert into public.attendance_logs (registration_id, check_in_method)
  values (p_registration_id, 'manual')
  on conflict (registration_id) do nothing;
  if not found then raise exception 'This registration has already been checked in'; end if;
  insert into public.ticket_check_ins (
    ticket_id, registration_id, event_id, checked_in_by
  )
  select registration_tickets.id, registration_tickets.registration_id,
    target_event_id, (select auth.uid())
  from public.registration_tickets
  where registration_tickets.registration_id = p_registration_id
    and registration_tickets.status = 'confirmed'
  on conflict (ticket_id) do nothing;
  update public.registration_tickets
  set status = 'checked_in'
  where registration_id = p_registration_id and status = 'confirmed';
  perform public.log_organization_activity(
    event_org_id, 'attendance.checked_in', 'registration', p_registration_id::text, '{}'::jsonb
  );
end;
$$;

revoke execute on function public.admin_record_attendance(uuid) from public, anon;
grant execute on function public.admin_record_attendance(uuid) to authenticated;

create or replace function public.admin_begin_event_ticket_refund(
  p_registration_id uuid,
  p_refund_reason text
)
returns table (
  payment_id text,
  amount bigint,
  currency text,
  refund_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_row public.registrations%rowtype;
  payment_row public.payment_transactions%rowtype;
begin
  if p_refund_reason is null or length(trim(p_refund_reason)) not between 1 and 500 then
    raise exception 'A refund reason of 1 to 500 characters is required';
  end if;
  select * into registration_row
  from public.registrations
  where id = p_registration_id
  for update;
  if not found then raise exception 'Registration not found'; end if;
  if not public.can_manage_event(registration_row.event_id) then
    raise exception 'Registration not found or access was denied';
  end if;
  if exists (
    select 1 from public.ticket_check_ins
    where registration_id = p_registration_id
  ) or exists (
    select 1 from public.attendance_logs
    where registration_id = p_registration_id
  ) then raise exception 'A checked-in registration cannot be refunded'; end if;
  select * into payment_row
  from public.payment_transactions
  where registration_id = p_registration_id
    and payment_type = 'event_ticket'
  order by created_at desc
  limit 1
  for update;
  if not found or payment_row.status <> 'paid' then
    raise exception 'Only verified paid registrations can be refunded';
  end if;
  if payment_row.refund_status in ('pending', 'succeeded') then
    raise exception 'A refund is already pending or has been completed';
  end if;
  update public.payment_transactions
  set refund_status = 'pending',
      refund_id = null,
      refund_reason = left(trim(p_refund_reason), 500),
      refund_requested_at = now(),
      refund_requested_by = (select auth.uid())
  where id = payment_row.id;
  return query select payment_row.payment_id, payment_row.amount,
    payment_row.currency, 'pending'::text;
end;
$$;

drop function if exists public.admin_begin_event_ticket_refund(uuid);
revoke execute on function public.admin_begin_event_ticket_refund(uuid, text) from public, anon;
grant execute on function public.admin_begin_event_ticket_refund(uuid, text) to authenticated;

create or replace function public.notify_event_ticket_refund_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attendee_id uuid;
  event_title text;
begin
  if new.payment_type <> 'event_ticket'
    or new.refund_status is not distinct from old.refund_status then
    return new;
  end if;
  select registrations.attendee_id, events.title
    into attendee_id, event_title
  from public.registrations
  join public.events on events.id = registrations.event_id
  where registrations.id = new.registration_id;
  if attendee_id is null then return new; end if;
  insert into public.notifications (user_id, type, title, message, link)
  values (
    attendee_id,
    'registration',
    case new.refund_status
      when 'pending' then 'Refund processing'
      when 'succeeded' then 'Refund completed'
      else 'Refund failed'
    end,
    case new.refund_status
      when 'pending' then 'Your refund for ' || coalesce(event_title, 'the event') || ' is being processed.'
      when 'succeeded' then 'Your refund for ' || coalesce(event_title, 'the event') || ' was confirmed. The associated ticket is no longer valid.'
      else 'The refund for ' || coalesce(event_title, 'the event') || ' could not be completed. Contact the event organizer for assistance.'
    end,
    '/my-tickets'
  );
  return new;
end;
$$;

drop trigger if exists payment_transactions_notify_ticket_refund on public.payment_transactions;
create trigger payment_transactions_notify_ticket_refund
  after update of refund_status on public.payment_transactions
  for each row execute function public.notify_event_ticket_refund_status();

revoke execute on function public.notify_event_ticket_refund_status() from public, anon, authenticated;

drop function if exists public.complete_paymongo_payment(text, text, text, bigint, text);

create or replace function public.complete_paymongo_payment(
  p_reference_number text,
  p_checkout_session_id text,
  p_payment_id text,
  p_amount bigint,
  p_currency text,
  p_payment_method text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_row public.payment_transactions%rowtype;
  event_approval text;
  registration_status text;
begin
  select * into transaction_row
  from public.payment_transactions
  where reference_number = p_reference_number
  for update;
  if not found then return false; end if;
  if transaction_row.status = 'paid' then
    return transaction_row.checkout_session_id = p_checkout_session_id
      and transaction_row.payment_id = p_payment_id;
  end if;
  if transaction_row.status <> 'pending'
    or transaction_row.amount <> p_amount
    or transaction_row.currency <> p_currency
    or (transaction_row.checkout_session_id is not null
      and transaction_row.checkout_session_id <> p_checkout_session_id) then
    return false;
  end if;

  if transaction_row.payment_type = 'event_ticket' then
    select registration_approval into event_approval
    from public.events
    where id = transaction_row.event_id;
    if not found then return false; end if;
    select status into registration_status
    from public.registrations
    where id = transaction_row.registration_id
      and attendee_id = transaction_row.user_id
      and event_id = transaction_row.event_id
    for update;
    if not found or registration_status <> 'pending' then return false; end if;
    if event_approval <> 'manual' then
      update public.registrations
      set status = 'confirmed', updated_at = now()
      where id = transaction_row.registration_id;
      perform public.issue_registration_tickets(transaction_row.registration_id);
    end if;
  else
    update public.organizations
    set plan_tier = transaction_row.plan_tier,
        subscription_expires_at = case
          when organizations.plan_tier = transaction_row.plan_tier
            and organizations.subscription_expires_at > now()
            then organizations.subscription_expires_at + interval '1 month'
          else now() + interval '1 month'
        end
    where id = transaction_row.organization_id;
    if not found then return false; end if;
  end if;

  update public.payment_transactions
  set status = 'paid',
      checkout_session_id = p_checkout_session_id,
      payment_id = p_payment_id,
      payment_method = nullif(left(trim(coalesce(p_payment_method, '')), 80), ''),
      paid_at = now()
  where id = transaction_row.id;
  return true;
end;
$$;

revoke execute on function public.complete_paymongo_payment(text, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.complete_paymongo_payment(text, text, text, bigint, text, text) to service_role;

notify pgrst, 'reload schema';
