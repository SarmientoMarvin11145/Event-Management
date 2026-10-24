alter table public.organizations
  add column if not exists subscription_expires_at timestamptz;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  user_id uuid not null references public.profiles (id) on delete restrict,
  organization_id uuid references public.organizations (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  registration_id uuid references public.registrations (id) on delete set null,
  payment_type text not null
    check (payment_type in ('event_ticket', 'organization_subscription')),
  plan_tier text check (plan_tier in ('pro', 'business')),
  amount bigint not null check (amount > 0),
  currency text not null check (currency = 'PHP'),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded')),
  checkout_session_id text unique,
  payment_id text unique,
  checkout_url text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint payment_transaction_target_check check (
    (payment_type = 'event_ticket' and event_id is not null and registration_id is not null and plan_tier is null)
    or
    (payment_type = 'organization_subscription' and organization_id is not null and event_id is null and registration_id is null and plan_tier is not null)
  )
);

create index if not exists payment_transactions_user_created_idx
  on public.payment_transactions (user_id, created_at desc);
create index if not exists payment_transactions_org_created_idx
  on public.payment_transactions (organization_id, created_at desc);
create index if not exists payment_transactions_status_created_idx
  on public.payment_transactions (status, created_at desc);

drop policy if exists "Attendees can cancel their upcoming registrations"
  on public.registrations;
create policy "Attendees can cancel their upcoming registrations"
  on public.registrations for update to authenticated
  using (
    (select auth.uid()) = attendee_id
    and status = 'confirmed'
    and exists (
      select 1 from public.events
      where events.id = registrations.event_id
        and events.start_date > now()
        and events.ticket_price = 0
    )
  )
  with check ((select auth.uid()) = attendee_id and status = 'cancelled');

alter table public.payment_transactions enable row level security;
grant select on public.payment_transactions to authenticated;

create or replace function public.is_organization_admin(p_organization_id uuid)
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

revoke execute on function public.is_organization_admin(uuid) from public, anon;
grant execute on function public.is_organization_admin(uuid) to authenticated, service_role;

drop policy if exists "Users can view their payment transactions"
  on public.payment_transactions;
create policy "Users can view their payment transactions"
  on public.payment_transactions for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_superadmin()
    or (
      organization_id is not null
      and public.is_organization_admin(organization_id)
    )
  );

create or replace function public.list_my_paymongo_organizations()
returns table (
  id uuid,
  name text,
  plan_tier text,
  subscription_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select organizations.id, organizations.name, organizations.plan_tier,
    organizations.subscription_expires_at
  from public.organizations
  join public.superadmin_organization_owners
    on superadmin_organization_owners.organization_id = organizations.id
  join public.profiles
    on profiles.id = superadmin_organization_owners.user_id
  where profiles.id = (select auth.uid())
    and profiles.role = 'admin'
    and profiles.account_status = 'active'
  order by organizations.name;
$$;

revoke execute on function public.list_my_paymongo_organizations() from public, anon;
grant execute on function public.list_my_paymongo_organizations() to authenticated;

create or replace function public.create_paymongo_event_order(
  p_user_id uuid,
  p_event_id uuid
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
  event_row record;
  profile_row record;
  registration_row public.registrations%rowtype;
  transaction_row public.payment_transactions%rowtype;
  reserved_tickets integer;
  registration_exists boolean;
begin
  select profiles.role, profiles.account_status
    into profile_row
    from public.profiles
    where profiles.id = p_user_id;
  if not found then
    raise exception 'An active account is required to purchase an event ticket.';
  end if;
  if profile_row.account_status <> 'active' then
    raise exception 'An active account is required to purchase an event ticket.';
  end if;

  select events.id, events.title, events.slug, events.start_date,
      events.ticket_price, events.currency, events.status, events.capacity
    into event_row
    from public.events
    where events.id = p_event_id
    for update;
  if not found then
    raise exception 'This event is not available for paid registration.';
  end if;
  if event_row.status <> 'published'
    or event_row.start_date <= now()
    or event_row.ticket_price <= 0 then
    raise exception 'This event is not available for paid registration.';
  end if;
  if event_row.currency <> 'PHP' then
    raise exception 'PayMongo checkout currently supports PHP-priced events only.';
  end if;

  select registrations.*
    into registration_row
    from public.registrations
    where registrations.attendee_id = p_user_id
      and registrations.event_id = p_event_id
    for update;
  registration_exists := found;

  if registration_exists and registration_row.status in ('confirmed', 'pending', 'waitlisted', 'invited') then
    if registration_row.status = 'pending' then
      select payment_transactions.*
        into transaction_row
        from public.payment_transactions
        where payment_transactions.registration_id = registration_row.id
          and payment_transactions.status = 'pending'
        order by payment_transactions.created_at desc
        limit 1;
      if found and transaction_row.checkout_url is not null then
        return query select transaction_row.id, transaction_row.reference_number,
          transaction_row.registration_id, transaction_row.amount,
          transaction_row.currency, event_row.title,
          '/my-tickets?payment=processing', '/e/' || event_row.slug,
          transaction_row.checkout_url;
        return;
      end if;
      raise exception 'A payment for this event is already being prepared. Please retry shortly.';
    end if;
    raise exception 'You already have an active registration for this event.';
  end if;

  select count(*)::integer
    into reserved_tickets
    from public.registrations
    where registrations.event_id = p_event_id
      and registrations.status in ('confirmed', 'pending');
  if event_row.capacity is not null and reserved_tickets >= event_row.capacity then
    raise exception 'This event has reached its ticket capacity.';
  end if;

  if registration_exists then
    update public.registrations
      set status = 'pending', updated_at = now()
      where id = registration_row.id
      returning * into registration_row;
  else
    insert into public.registrations (attendee_id, event_id, status)
      values (p_user_id, p_event_id, 'pending')
      returning * into registration_row;
  end if;

  insert into public.payment_transactions (
    reference_number, user_id, organization_id, event_id, registration_id,
    payment_type, amount, currency
  )
  select 'KURO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    p_user_id, events.organization_id, events.id, registration_row.id,
    'event_ticket', round(events.ticket_price * 100)::bigint, events.currency
  from public.events
  where events.id = p_event_id
  returning * into transaction_row;

  return query select transaction_row.id, transaction_row.reference_number,
    transaction_row.registration_id, transaction_row.amount,
    transaction_row.currency, event_row.title,
    '/my-tickets?payment=processing', '/e/' || event_row.slug, null::text;
end;
$$;

revoke execute on function public.create_paymongo_event_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_paymongo_event_order(uuid, uuid) to service_role;

create or replace function public.create_paymongo_subscription_order(
  p_user_id uuid,
  p_organization_id uuid,
  p_plan_tier text
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
  organization_row public.organizations%rowtype;
  transaction_row public.payment_transactions%rowtype;
  plan_amount bigint;
  plan_name text;
begin
  if not exists (
    select 1
    from public.profiles
    join public.superadmin_organization_owners
      on superadmin_organization_owners.user_id = profiles.id
    where profiles.id = p_user_id
      and profiles.role = 'admin'
      and profiles.account_status = 'active'
      and superadmin_organization_owners.organization_id = p_organization_id
  ) then
    raise exception 'Only an active organization admin can manage its subscription.';
  end if;

  if p_plan_tier = 'pro' then
    plan_amount := 99900;
    plan_name := 'KURO Pro monthly subscription';
  elsif p_plan_tier = 'business' then
    plan_amount := 299900;
    plan_name := 'KURO Business monthly subscription';
  else
    raise exception 'Choose a supported subscription plan.';
  end if;

  select organizations.*
    into organization_row
    from public.organizations
    where organizations.id = p_organization_id
    for update;
  if not found then
    raise exception 'This organization is not available for subscription changes.';
  end if;
  if organization_row.status <> 'active' then
    raise exception 'This organization is not available for subscription changes.';
  end if;

  select payment_transactions.*
    into transaction_row
    from public.payment_transactions
    where payment_transactions.organization_id = p_organization_id
      and payment_transactions.payment_type = 'organization_subscription'
      and payment_transactions.status = 'pending'
    order by payment_transactions.created_at desc
    limit 1;
  if found then
    if transaction_row.plan_tier <> p_plan_tier then
      raise exception 'A subscription checkout is already in progress for this organization.';
    end if;
    if transaction_row.checkout_url is not null then
      return query select transaction_row.id, transaction_row.reference_number,
        null::uuid, transaction_row.amount, transaction_row.currency,
        plan_name, '/admin/billing?payment=processing',
        '/admin/billing', transaction_row.checkout_url;
      return;
    end if;
    raise exception 'A subscription checkout is already being prepared. Please retry shortly.';
  end if;

  insert into public.payment_transactions (
    reference_number, user_id, organization_id, payment_type, plan_tier,
    amount, currency
  )
  values (
    'KURO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    p_user_id, p_organization_id, 'organization_subscription', p_plan_tier,
    plan_amount, 'PHP'
  )
  returning * into transaction_row;

  return query select transaction_row.id, transaction_row.reference_number,
    null::uuid, transaction_row.amount, transaction_row.currency,
    plan_name, '/admin/billing?payment=processing',
    '/admin/billing', null::text;
end;
$$;

revoke execute on function public.create_paymongo_subscription_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_paymongo_subscription_order(uuid, uuid, text) to service_role;

create or replace function public.save_paymongo_checkout_session(
  p_order_id uuid,
  p_checkout_session_id text,
  p_checkout_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_transactions
    set checkout_session_id = p_checkout_session_id,
        checkout_url = p_checkout_url
    where id = p_order_id
      and (
        status = 'pending'
        or (status = 'paid' and checkout_session_id = p_checkout_session_id)
      );
  if not found then
    raise exception 'Pending payment order not found.';
  end if;
end;
$$;

revoke execute on function public.save_paymongo_checkout_session(uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_paymongo_checkout_session(uuid, text, text) to service_role;

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
begin
  select payment_transactions.*
    into transaction_row
    from public.payment_transactions
    where payment_transactions.reference_number = p_reference_number
    for update;
  if not found then
    return false;
  end if;

  if transaction_row.status = 'paid' then
    return transaction_row.checkout_session_id = p_checkout_session_id
      and transaction_row.payment_id = p_payment_id;
  end if;
  if transaction_row.status <> 'pending'
    or transaction_row.amount <> p_amount
    or transaction_row.currency <> p_currency then
    return false;
  end if;
  if transaction_row.checkout_session_id is not null
    and transaction_row.checkout_session_id <> p_checkout_session_id then
    return false;
  end if;

  if transaction_row.payment_type = 'event_ticket' then
    update public.registrations
      set status = 'confirmed', updated_at = now()
      where id = transaction_row.registration_id
        and attendee_id = transaction_row.user_id
        and event_id = transaction_row.event_id
        and status = 'pending';
    if not found then
      return false;
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
    if not found then
      return false;
    end if;
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

update public.feature_flags
  set enabled = true,
      description = 'PayMongo test-mode hosted checkout for event tickets and organization plans.'
  where flag_key = 'payment-gateway';
