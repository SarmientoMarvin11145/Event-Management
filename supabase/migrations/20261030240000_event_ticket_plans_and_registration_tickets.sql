create table public.event_ticket_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  price numeric(10, 2) not null default 0 check (price >= 0),
  capacity integer check (capacity is null or capacity > 0),
  requires_address boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, name)
);

create index event_ticket_plans_event_active_idx
  on public.event_ticket_plans (event_id, active, sort_order);

insert into public.event_ticket_plans (event_id, name, price, capacity)
select events.id, 'General admission', events.ticket_price, events.capacity
from public.events
where not exists (
  select 1 from public.event_ticket_plans
  where event_ticket_plans.event_id = events.id
);

alter table public.event_ticket_plans enable row level security;
grant select on public.event_ticket_plans to anon, authenticated;

create policy "Visitors can view active plans for published events"
  on public.event_ticket_plans for select to anon, authenticated
  using (
    active
    and exists (
      select 1 from public.events
      where events.id = event_ticket_plans.event_id
        and events.status = 'published'
        and events.moderation_status not in ('under_review', 'removed')
    )
  );

create policy "Organization admins can view all their event ticket plans"
  on public.event_ticket_plans for select to authenticated
  using (
    exists (
      select 1 from public.events
      where events.id = event_ticket_plans.event_id
        and public.can_manage_event(events.id)
    )
  );

alter table public.registrations
  add column ticket_plan_id uuid references public.event_ticket_plans (id) on delete set null,
  add column quantity integer not null default 1 check (quantity > 0 and quantity <= 20),
  add column ticket_unit_price numeric(10, 2) not null default 0 check (ticket_unit_price >= 0),
  add column attendee_name text,
  add column attendee_email text,
  add column attendee_phone text,
  add column attendee_address text;

update public.registrations
set ticket_unit_price = coalesce(event_ticket_plans.price, events.ticket_price, 0)
from public.events
left join public.event_ticket_plans on event_ticket_plans.event_id = events.id
where registrations.event_id = events.id;

alter table public.registrations
  drop constraint if exists registrations_attendee_id_event_id_key;
create unique index registrations_one_active_event_per_attendee_idx
  on public.registrations (attendee_id, event_id)
  where status in ('confirmed', 'pending', 'waitlisted', 'invited');

alter table public.payment_transactions
  add column ticket_plan_id uuid references public.event_ticket_plans (id) on delete set null,
  add column quantity integer not null default 1 check (quantity > 0 and quantity <= 20);

drop policy if exists "Attendees can register for free published events" on public.registrations;
revoke insert on public.registrations from authenticated;
revoke insert (attendee_id, event_id) on public.registrations from authenticated;
revoke execute on function public.register_for_event(uuid) from public, anon, authenticated;
revoke execute on function public.register_for_event_with_seat(uuid, text) from public, anon, authenticated;

drop policy if exists "Attendees can cancel their upcoming registrations" on public.registrations;
create policy "Attendees can cancel their upcoming registrations"
  on public.registrations for update to authenticated
  using (
    (select auth.uid()) = attendee_id
    and status = 'confirmed'
    and exists (
      select 1 from public.events
      where events.id = registrations.event_id
        and events.start_date > now()
        and (
          (registrations.ticket_plan_id is null and events.ticket_price = 0)
          or exists (
            select 1 from public.event_ticket_plans
            where event_ticket_plans.id = registrations.ticket_plan_id
              and event_ticket_plans.price = 0
          )
        )
    )
  )
  with check ((select auth.uid()) = attendee_id and status = 'cancelled');

alter table public.payment_transactions
  drop constraint if exists payment_transactions_status_check;
alter table public.payment_transactions
  add constraint payment_transactions_status_check
  check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'));

create table public.registration_tickets (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  ticket_number text not null unique,
  qr_token uuid not null unique default gen_random_uuid(),
  seat_number text,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'used')),
  created_at timestamptz not null default now(),
  unique (registration_id, ticket_number)
);

create index registration_tickets_registration_idx
  on public.registration_tickets (registration_id, created_at);

alter table public.registration_tickets enable row level security;
grant select on public.registration_tickets to authenticated;

create policy "Attendees can view their own registration tickets"
  on public.registration_tickets for select to authenticated
  using (
    exists (
      select 1 from public.registrations
      where registrations.id = registration_tickets.registration_id
        and registrations.attendee_id = (select auth.uid())
    )
  );

create or replace function public.get_event_ticket_plans(p_event_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  price numeric,
  capacity integer,
  sold_quantity bigint,
  available_quantity bigint,
  requires_address boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select plans.id, plans.name, plans.description, plans.price, plans.capacity,
    coalesce(sales.quantity, 0)::bigint,
    case when plans.capacity is null then null
      else greatest(plans.capacity - coalesce(sales.quantity, 0), 0)::bigint
    end,
    plans.requires_address
  from public.event_ticket_plans plans
  join public.events on events.id = plans.event_id
  left join lateral (
    select sum(registrations.quantity) as quantity
    from public.registrations
    where registrations.ticket_plan_id = plans.id
      and registrations.status in ('confirmed', 'pending')
  ) sales on true
  where plans.event_id = p_event_id
    and plans.active
    and (
      (events.status = 'published' and events.moderation_status not in ('under_review', 'removed'))
      and public.is_public_organization_active(events.organization_id)
      or public.can_manage_event(events.id)
    )
  order by plans.sort_order, plans.created_at;
$$;

revoke execute on function public.get_event_ticket_plans(uuid) from public;
grant execute on function public.get_event_ticket_plans(uuid) to anon, authenticated;

create or replace function public.get_event_ticket_summary(p_event_ids uuid[])
returns table (
  event_id uuid,
  starting_price numeric,
  available_quantity bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select events.id,
    min(plans.price) filter (
      where (plans.capacity is null or plans.capacity > coalesce(plan_sales.quantity, 0))
        and (events.capacity is null or events.capacity > coalesce(event_sales.quantity, 0))
    ),
    case
      when events.capacity is null and bool_or(plans.id is not null and plans.capacity is null) then null
      else least(
        coalesce(sum(
          case when plans.id is null then 0
          when plans.capacity is null then
            case when events.capacity is null then 9223372036854775807::bigint
              else greatest(events.capacity - coalesce(event_sales.quantity, 0), 0)::bigint end
          else greatest(plans.capacity - coalesce(plan_sales.quantity, 0), 0)::bigint end
        ), 0),
        case when events.capacity is null then 9223372036854775807::bigint
          else greatest(events.capacity - coalesce(event_sales.quantity, 0), 0)::bigint end
      )
    end
  from public.events
  left join public.event_ticket_plans plans
    on plans.event_id = events.id and plans.active
  left join lateral (
    select sum(registrations.quantity) as quantity
    from public.registrations
    where registrations.ticket_plan_id = plans.id
      and registrations.status in ('confirmed', 'pending')
  ) plan_sales on true
  left join lateral (
    select sum(registrations.quantity) as quantity
    from public.registrations
    where registrations.event_id = events.id
      and registrations.status in ('confirmed', 'pending')
  ) event_sales on true
  where events.id = any(p_event_ids)
    and events.status = 'published'
    and events.moderation_status not in ('under_review', 'removed')
    and public.is_public_organization_active(events.organization_id)
  group by events.id, events.capacity, event_sales.quantity;
$$;

revoke execute on function public.get_event_ticket_summary(uuid[]) from public;
grant execute on function public.get_event_ticket_summary(uuid[]) to anon, authenticated;

create or replace function public.admin_save_event_ticket_plan(
  p_plan_id uuid,
  p_event_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_capacity integer,
  p_requires_address boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events%rowtype;
  saved_plan_id uuid;
  reserved_quantity bigint;
begin
  select * into event_row
  from public.events
  where id = p_event_id
  for update;
  if not found or not public.can_manage_event(p_event_id) then
    raise exception 'Event not found or access was denied';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120 then
    raise exception 'Ticket plan name must be between 1 and 120 characters';
  end if;
  if length(coalesce(p_description, '')) > 1000 then
    raise exception 'Ticket plan description must be 1000 characters or fewer';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Ticket price must be zero or greater';
  end if;
  if p_capacity is not null and p_capacity < 1 then
    raise exception 'Available quantity must be a positive whole number';
  end if;
  if p_price > 0 and event_row.currency <> 'PHP' then
    raise exception 'Paid ticket plans currently support PHP checkout only';
  end if;

  if p_plan_id is not null then
    select coalesce(sum(quantity), 0) into reserved_quantity
    from public.registrations
    where ticket_plan_id = p_plan_id and status in ('confirmed', 'pending');
    if p_capacity is not null and p_capacity < reserved_quantity then
      raise exception 'Available quantity cannot be lower than existing reservations';
    end if;
    update public.event_ticket_plans
    set name = trim(p_name),
        description = coalesce(p_description, ''),
        price = p_price,
        capacity = p_capacity,
        requires_address = coalesce(p_requires_address, false),
        updated_at = now()
    where id = p_plan_id and event_id = p_event_id
    returning id into saved_plan_id;
  else
    insert into public.event_ticket_plans
      (event_id, name, description, price, capacity, requires_address)
    values
      (p_event_id, trim(p_name), coalesce(p_description, ''), p_price,
        p_capacity, coalesce(p_requires_address, false))
    returning id into saved_plan_id;
  end if;

  if saved_plan_id is null then
    raise exception 'Ticket plan not found or access was denied';
  end if;
  return saved_plan_id;
end;
$$;

revoke execute on function public.admin_save_event_ticket_plan(uuid, uuid, text, text, numeric, integer, boolean) from public, anon;
grant execute on function public.admin_save_event_ticket_plan(uuid, uuid, text, text, numeric, integer, boolean) to authenticated;

create or replace function public.admin_delete_event_ticket_plan(
  p_event_id uuid,
  p_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_event(p_event_id) then
    raise exception 'Event not found or access was denied';
  end if;
  if exists (
    select 1 from public.registrations
    where ticket_plan_id = p_plan_id
      and status in ('confirmed', 'pending')
  ) then
    raise exception 'A ticket plan with active registrations cannot be deleted';
  end if;
  delete from public.event_ticket_plans
  where id = p_plan_id and event_id = p_event_id;
  if not found then raise exception 'Ticket plan not found'; end if;
end;
$$;

revoke execute on function public.admin_delete_event_ticket_plan(uuid, uuid) from public, anon;
grant execute on function public.admin_delete_event_ticket_plan(uuid, uuid) to authenticated;

create or replace function public.admin_set_event_cover(
  p_event_id uuid,
  p_banner_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_banner_url is not null and (
    length(p_banner_url) > 2000
    or p_banner_url !~ '^https://[^[:space:]]+$'
  ) then
    raise exception 'Event cover must be a valid HTTPS URL';
  end if;
  update public.events
  set banner_url = p_banner_url, updated_at = now()
  where id = p_event_id and public.can_manage_event(id);
  if not found then raise exception 'Event not found or access was denied'; end if;
end;
$$;

revoke execute on function public.admin_set_event_cover(uuid, text) from public, anon;
grant execute on function public.admin_set_event_cover(uuid, text) to authenticated;

create or replace function public.issue_registration_tickets(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_row public.registrations%rowtype;
begin
  select * into registration_row
  from public.registrations
  where id = p_registration_id
  for update;
  if not found or registration_row.status <> 'confirmed' then
    raise exception 'Confirmed registration not found';
  end if;
  insert into public.registration_tickets (registration_id, ticket_number, seat_number)
  select registration_row.id,
    registration_row.registration_code || '-' || ticket_index::text,
    (
      select reservations.seat_id
      from public.event_seat_reservations reservations
      where reservations.registration_id = registration_row.id
      order by reservations.seat_id
      offset ticket_index - 1
      limit 1
    )
  from generate_series(1, registration_row.quantity) as ticket_index
  on conflict (registration_id, ticket_number) do update
  set status = 'confirmed',
      qr_token = gen_random_uuid(),
      seat_number = excluded.seat_number
  where public.registration_tickets.status = 'cancelled';
end;
$$;

do $$
declare
  registration_row record;
begin
  for registration_row in
    select id from public.registrations where status = 'confirmed'
  loop
    perform public.issue_registration_tickets(registration_row.id);
  end loop;
end;
$$;

create or replace function public.cancel_registration_tickets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.registration_tickets
    set status = 'cancelled'
    where registration_id = new.id and status = 'confirmed';
  end if;
  return new;
end;
$$;

create trigger registrations_cancel_issued_tickets
  after update of status on public.registrations
  for each row execute function public.cancel_registration_tickets();

revoke execute on function public.cancel_registration_tickets() from public, anon, authenticated;
revoke execute on function public.issue_registration_tickets(uuid) from public, anon, authenticated;
grant execute on function public.issue_registration_tickets(uuid) to service_role;

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
  if p_status = 'confirmed' and target_registration.ticket_unit_price > 0 and not exists (
    select 1 from public.payment_transactions
    where registration_id = target_registration.id and status = 'paid'
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
    delete from public.event_seat_reservations
    where registration_id = target_registration.id;
  end if;
  update public.registrations set
    status = p_status,
    cancelled_at = case when p_status = 'cancelled' then now() else null end,
    cancellation_reason = case when p_status = 'cancelled' then nullif(left(trim(coalesce(p_cancellation_reason, '')), 500), '') else null end,
    updated_at = now()
  where id = p_registration_id;
  if p_status = 'confirmed' then
    perform public.issue_registration_tickets(p_registration_id);
  end if;
end;
$$;

create or replace function public.register_for_event_ticket_plan(
  p_event_id uuid,
  p_plan_id uuid,
  p_quantity integer,
  p_full_name text,
  p_email text,
  p_phone text,
  p_address text default null,
  p_seat_ids text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  event_row public.events%rowtype;
  plan_row public.event_ticket_plans%rowtype;
  registration_id uuid;
  reserved_quantity bigint;
  event_reserved_quantity bigint;
  valid_seats bigint;
  registration_status text;
begin
  if current_user_id is null then raise exception 'Sign in to register for an event'; end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id and account_status = 'active'
  ) then raise exception 'An active account is required to register'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'Choose between 1 and 20 tickets';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 1 and 120 then
    raise exception 'Full name is required';
  end if;
  if p_email is null or length(trim(p_email)) > 254
    or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if p_phone is null or length(trim(p_phone)) not between 7 and 40 then
    raise exception 'A valid contact number is required';
  end if;

  select * into event_row
  from public.events
  where id = p_event_id
  for update;
  if not found or event_row.status <> 'published'
    or event_row.start_date <= now()
    or (event_row.registration_opens_at is not null and event_row.registration_opens_at > now())
    or (event_row.registration_deadline is not null and event_row.registration_deadline < now())
    or not public.is_public_organization_active(event_row.organization_id) then
    raise exception 'This event is not available for registration';
  end if;

  select * into plan_row
  from public.event_ticket_plans
  where id = p_plan_id and event_id = p_event_id and active
  for update;
  if not found then raise exception 'The selected ticket plan is not available'; end if;
  if plan_row.price > 0 then
    raise exception 'Paid ticket plans must be checked out securely';
  end if;
  if plan_row.requires_address and length(trim(coalesce(p_address, ''))) = 0 then
    raise exception 'Address is required for this ticket plan';
  end if;
  if exists (
    select 1 from public.registrations
    where attendee_id = current_user_id and event_id = p_event_id
      and status in ('confirmed', 'pending', 'waitlisted', 'invited')
  ) then raise exception 'You already have an active registration for this event'; end if;

  select coalesce(sum(quantity), 0) into reserved_quantity
  from public.registrations
  where ticket_plan_id = p_plan_id and status in ('confirmed', 'pending');
  if plan_row.capacity is not null and reserved_quantity + p_quantity > plan_row.capacity then
    raise exception 'Not enough tickets remain for this plan';
  end if;
  select coalesce(sum(quantity), 0) into event_reserved_quantity
  from public.registrations
  where event_id = p_event_id and status in ('confirmed', 'pending');
  if event_row.capacity is not null and event_reserved_quantity + p_quantity > event_row.capacity then
    raise exception 'Not enough event capacity remains';
  end if;
  if event_row.venue_id is not null then
    if coalesce(cardinality(p_seat_ids), 0) <> p_quantity then
      raise exception 'Choose one available seat for each ticket';
    end if;
    if exists (
      select seat_id from unnest(p_seat_ids) as selected(seat_id)
      group by seat_id having count(*) > 1
    ) then raise exception 'A seat can only be selected once'; end if;
    select count(*) into valid_seats
    from unnest(p_seat_ids) as selected(seat_id)
    where exists (
      select 1
      from public.venues
      cross join lateral jsonb_array_elements(public.venues.seat_plan -> 'rows') as row_item
      cross join lateral jsonb_array_elements(row_item -> 'seats') as seat_item
      where public.venues.id = event_row.venue_id
        and seat_item ->> 'id' = selected.seat_id
        and seat_item ->> 'enabled' = 'true'
    );
    if valid_seats <> p_quantity then raise exception 'A selected seat is not available'; end if;
    if exists (
      select 1 from public.event_seat_reservations
      where event_id = p_event_id and seat_id = any(p_seat_ids)
    ) then raise exception 'A selected seat has already been reserved'; end if;
  elsif coalesce(cardinality(p_seat_ids), 0) > 0 then
    raise exception 'This event does not use assigned seats';
  end if;

  registration_status := case
    when event_row.registration_approval = 'manual' then 'pending'
    else 'confirmed'
  end;
  insert into public.registrations (
    attendee_id, event_id, status, ticket_type, ticket_plan_id, quantity,
    ticket_unit_price, attendee_name, attendee_email, attendee_phone, attendee_address, seat_number
  ) values (
    current_user_id, p_event_id, registration_status, plan_row.name, plan_row.id,
    p_quantity, plan_row.price, trim(p_full_name), lower(trim(p_email)), trim(p_phone),
    nullif(trim(coalesce(p_address, '')), ''),
    case when p_quantity = 1 then p_seat_ids[1] else null end
  ) returning id into registration_id;

  if event_row.venue_id is not null then
    insert into public.event_seat_reservations (event_id, seat_id, registration_id)
    select p_event_id, selected.seat_id, registration_id
    from unnest(p_seat_ids) as selected(seat_id);
  end if;
  if registration_status = 'confirmed' then
    perform public.issue_registration_tickets(registration_id);
  end if;
  return registration_id;
end;
$$;

revoke execute on function public.register_for_event_ticket_plan(uuid, uuid, integer, text, text, text, text, text[]) from public, anon;
grant execute on function public.register_for_event_ticket_plan(uuid, uuid, integer, text, text, text, text, text[]) to authenticated;

create or replace function public.create_paymongo_event_ticket_order(
  p_user_id uuid,
  p_event_id uuid,
  p_plan_id uuid,
  p_quantity integer,
  p_full_name text,
  p_email text,
  p_phone text,
  p_address text default null,
  p_seat_ids text[] default null
)
returns table (
  order_id uuid,
  reference_number text,
  registration_id uuid,
  amount bigint,
  currency text,
  item_name text,
  success_path text,
  cancel_path text,
  checkout_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events%rowtype;
  plan_row public.event_ticket_plans%rowtype;
  profile_status text;
  registration_id uuid;
  transaction_row public.payment_transactions%rowtype;
  reserved_quantity bigint;
  event_reserved_quantity bigint;
  valid_seats bigint;
begin
  select account_status into profile_status
  from public.profiles where id = p_user_id;
  if profile_status is distinct from 'active' then
    raise exception 'An active account is required to purchase an event ticket';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'Choose between 1 and 20 tickets';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 1 and 120 then
    raise exception 'Full name is required';
  end if;
  if p_email is null or length(trim(p_email)) > 254
    or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if p_phone is null or length(trim(p_phone)) not between 7 and 40 then
    raise exception 'A valid contact number is required';
  end if;

  select * into event_row from public.events
  where id = p_event_id for update;
  if not found or event_row.status <> 'published'
    or event_row.start_date <= now()
    or (event_row.registration_opens_at is not null and event_row.registration_opens_at > now())
    or (event_row.registration_deadline is not null and event_row.registration_deadline < now())
    or not public.is_public_organization_active(event_row.organization_id) then
    raise exception 'This event is not available for paid registration';
  end if;
  if event_row.currency <> 'PHP' then
    raise exception 'PayMongo checkout currently supports PHP-priced events only';
  end if;

  select * into plan_row from public.event_ticket_plans
  where id = p_plan_id and event_id = p_event_id and active
  for update;
  if not found or plan_row.price <= 0 then
    raise exception 'Choose an available paid ticket plan';
  end if;
  if plan_row.requires_address and length(trim(coalesce(p_address, ''))) = 0 then
    raise exception 'Address is required for this ticket plan';
  end if;
  if exists (
    select 1 from public.registrations
    where attendee_id = p_user_id and event_id = p_event_id
      and status in ('confirmed', 'pending', 'waitlisted', 'invited')
  ) then
    raise exception 'You already have an active registration or payment for this event';
  end if;

  select coalesce(sum(quantity), 0) into reserved_quantity
  from public.registrations
  where ticket_plan_id = p_plan_id and status in ('confirmed', 'pending');
  if plan_row.capacity is not null and reserved_quantity + p_quantity > plan_row.capacity then
    raise exception 'Not enough tickets remain for this plan';
  end if;
  select coalesce(sum(quantity), 0) into event_reserved_quantity
  from public.registrations
  where event_id = p_event_id and status in ('confirmed', 'pending');
  if event_row.capacity is not null and event_reserved_quantity + p_quantity > event_row.capacity then
    raise exception 'Not enough event capacity remains';
  end if;
  if event_row.venue_id is not null then
    if coalesce(cardinality(p_seat_ids), 0) <> p_quantity then
      raise exception 'Choose one available seat for each ticket';
    end if;
    if exists (
      select seat_id from unnest(p_seat_ids) as selected(seat_id)
      group by seat_id having count(*) > 1
    ) then raise exception 'A seat can only be selected once'; end if;
    select count(*) into valid_seats
    from unnest(p_seat_ids) as selected(seat_id)
    where exists (
      select 1
      from public.venues
      cross join lateral jsonb_array_elements(public.venues.seat_plan -> 'rows') as row_item
      cross join lateral jsonb_array_elements(row_item -> 'seats') as seat_item
      where public.venues.id = event_row.venue_id
        and seat_item ->> 'id' = selected.seat_id
        and seat_item ->> 'enabled' = 'true'
    );
    if valid_seats <> p_quantity then raise exception 'A selected seat is not available'; end if;
    if exists (
      select 1 from public.event_seat_reservations
      where event_id = p_event_id and seat_id = any(p_seat_ids)
    ) then raise exception 'A selected seat has already been reserved'; end if;
  elsif coalesce(cardinality(p_seat_ids), 0) > 0 then
    raise exception 'This event does not use assigned seats';
  end if;

  insert into public.registrations (
    attendee_id, event_id, status, ticket_type, ticket_plan_id, quantity,
    ticket_unit_price, attendee_name, attendee_email, attendee_phone, attendee_address, seat_number
  ) values (
    p_user_id, p_event_id, 'pending', plan_row.name, plan_row.id,
    p_quantity, plan_row.price, trim(p_full_name), lower(trim(p_email)), trim(p_phone),
    nullif(trim(coalesce(p_address, '')), ''),
    case when p_quantity = 1 then p_seat_ids[1] else null end
  ) returning id into registration_id;

  if event_row.venue_id is not null then
    insert into public.event_seat_reservations (event_id, seat_id, registration_id)
    select p_event_id, selected.seat_id, registration_id
    from unnest(p_seat_ids) as selected(seat_id);
  end if;

  insert into public.payment_transactions (
    reference_number, user_id, organization_id, event_id, registration_id,
    ticket_plan_id, quantity, payment_type, amount, currency
  ) values (
    'KURO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    p_user_id, event_row.organization_id, p_event_id, registration_id,
    plan_row.id, p_quantity, 'event_ticket',
    round(plan_row.price * 100)::bigint * p_quantity, event_row.currency
  ) returning * into transaction_row;

  return query select transaction_row.id, transaction_row.reference_number,
    registration_id, transaction_row.amount, transaction_row.currency,
    event_row.title || ' - ' || plan_row.name,
    '/my-tickets?payment=processing',
    '/e/' || event_row.slug || '/register?payment=cancelled&reference=' || transaction_row.reference_number,
    null::text;
end;
$$;

revoke execute on function public.create_paymongo_event_ticket_order(uuid, uuid, uuid, integer, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.create_paymongo_event_ticket_order(uuid, uuid, uuid, integer, text, text, text, text, text[]) to service_role;

create or replace function public.complete_paymongo_payment(
  p_reference_number text,
  p_checkout_session_id text,
  p_payment_id text,
  p_amount bigint,
  p_currency text
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
      paid_at = now()
  where id = transaction_row.id;
  return true;
end;
$$;

revoke execute on function public.complete_paymongo_payment(text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.complete_paymongo_payment(text, text, text, bigint, text) to service_role;

create or replace function public.set_paymongo_order_terminal_status(
  p_reference_number text,
  p_checkout_session_id text,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_row public.payment_transactions%rowtype;
begin
  if p_status is null or p_status not in ('failed', 'expired', 'cancelled') then
    raise exception 'Invalid terminal payment status';
  end if;
  select * into transaction_row
  from public.payment_transactions
  where reference_number = p_reference_number
  for update;
  if not found then return false; end if;
  if transaction_row.status = p_status then return true; end if;
  if transaction_row.status <> 'pending'
    or (nullif(p_checkout_session_id, '') is not null
      and transaction_row.checkout_session_id is not null
      and transaction_row.checkout_session_id <> p_checkout_session_id) then
    return false;
  end if;

  update public.payment_transactions
  set status = p_status,
      checkout_session_id = coalesce(checkout_session_id, nullif(p_checkout_session_id, ''))
  where id = transaction_row.id;
  if transaction_row.payment_type = 'event_ticket' then
    update public.registrations
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = transaction_row.registration_id and status = 'pending';
  end if;
  return true;
end;
$$;

revoke execute on function public.set_paymongo_order_terminal_status(text, text, text) from public, anon, authenticated;
grant execute on function public.set_paymongo_order_terminal_status(text, text, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-covers',
  'event-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view event covers" on storage.objects;
create policy "Public can view event covers"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-covers');

drop policy if exists "Organization admins can upload event covers" on storage.objects;
create policy "Organization admins can upload event covers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-covers'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.can_manage_organization(((storage.foldername(name))[1])::uuid)
  );

notify pgrst, 'reload schema';
