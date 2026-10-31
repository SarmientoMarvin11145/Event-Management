alter table public.profiles
  add column if not exists plan_tier text not null default 'free'
    check (plan_tier in ('free', 'pro', 'business')),
  add column if not exists plan_expires_at timestamptz;

with active_organization_plans as (
  select owners.user_id, organizations.plan_tier, organizations.subscription_expires_at,
    row_number() over (
      partition by owners.user_id
      order by
        case organizations.plan_tier when 'business' then 2 when 'pro' then 1 else 0 end desc,
        organizations.subscription_expires_at desc
    ) as plan_rank
  from public.superadmin_organization_owners owners
  join public.organizations on organizations.id = owners.organization_id
  where organizations.plan_tier in ('pro', 'business')
    and organizations.subscription_expires_at > now()
)
update public.profiles
set plan_tier = active_organization_plans.plan_tier,
    plan_expires_at = active_organization_plans.subscription_expires_at
from active_organization_plans
where profiles.id = active_organization_plans.user_id
  and active_organization_plans.plan_rank = 1;

alter table public.events
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

update public.events as events
set created_by = coalesce(
  (
    select owners.user_id
    from public.superadmin_organization_owners owners
    where owners.organization_id = events.organization_id
    limit 1
  ),
  (
    select members.user_id
    from public.organization_members members
    join public.profiles on profiles.id = members.user_id
    where members.organization_id = events.organization_id
      and members.role = 'organization_admin'
      and members.status = 'active'
      and profiles.account_status = 'active'
    order by members.created_at
    limit 1
  )
)
where events.created_by is null;

create index if not exists events_created_by_active_idx
  on public.events (created_by, status, start_date);

alter table public.payment_transactions
  drop constraint if exists payment_transactions_payment_type_check,
  drop constraint if exists payment_transaction_target_check,
  add constraint payment_transactions_payment_type_check
    check (payment_type in ('event_ticket', 'organization_subscription', 'user_subscription')),
  add constraint payment_transaction_target_check check (
    (payment_type = 'event_ticket' and event_id is not null and registration_id is not null and plan_tier is null)
    or
    (payment_type = 'organization_subscription' and organization_id is not null and event_id is null and registration_id is null and plan_tier is not null)
    or
    (payment_type = 'user_subscription' and organization_id is null and event_id is null and registration_id is null and plan_tier is not null)
  );

create unique index if not exists payment_transactions_one_pending_user_plan_idx
  on public.payment_transactions (user_id)
  where payment_type = 'user_subscription' and status = 'pending';

create or replace function public.get_my_plan_entitlements()
returns table (
  plan_tier text,
  plan_expires_at timestamptz,
  active_event_count bigint,
  active_event_limit integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with account_plan as (
    select
      case when profiles.plan_expires_at > now() then profiles.plan_tier else 'free' end as tier,
      profiles.plan_expires_at
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.account_status = 'active'
  )
  select
    account_plan.tier,
    case when account_plan.tier = 'free' then null else account_plan.plan_expires_at end,
    count(events.id),
    case account_plan.tier when 'free' then 3 when 'pro' then 10 else null end
  from account_plan
  left join public.events
    on events.created_by = (select auth.uid())
    and events.status = 'published'
    and coalesce(events.end_date, events.start_date + interval '1 hour') >= now()
  group by account_plan.tier, account_plan.plan_expires_at;
$$;

revoke execute on function public.get_my_plan_entitlements() from public, anon;
grant execute on function public.get_my_plan_entitlements() to authenticated;

create or replace function public.create_paymongo_user_subscription_order(
  p_user_id uuid,
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
  profile_row public.profiles%rowtype;
  transaction_row public.payment_transactions%rowtype;
  plan_amount bigint;
  plan_name text;
begin
  select profiles.* into profile_row
  from public.profiles
  where profiles.id = p_user_id
  for update;
  if not found or profile_row.account_status <> 'active' then
    raise exception 'An active KURO account is required to change account plans.';
  end if;

  if p_plan_tier = 'pro' then
    plan_amount := 99900;
    plan_name := 'KURO Pro monthly account plan';
  elsif p_plan_tier = 'business' then
    plan_amount := 299900;
    plan_name := 'KURO Business monthly account plan';
  else
    raise exception 'Choose a supported account plan.';
  end if;

  select payment_transactions.* into transaction_row
  from public.payment_transactions
  where payment_transactions.user_id = p_user_id
    and payment_transactions.payment_type = 'user_subscription'
    and payment_transactions.status = 'pending'
  order by payment_transactions.created_at desc
  limit 1;
  if found then
    if transaction_row.plan_tier <> p_plan_tier then
      raise exception 'An account plan checkout is already in progress.';
    end if;
    if transaction_row.checkout_url is not null then
      return query select transaction_row.id, transaction_row.reference_number,
        null::uuid, transaction_row.amount, transaction_row.currency, plan_name,
        '/account-plan?payment=processing', '/account-plan', transaction_row.checkout_url;
      return;
    end if;
    raise exception 'An account plan checkout is already being prepared. Please retry shortly.';
  end if;

  insert into public.payment_transactions (
    reference_number, user_id, organization_id, payment_type, plan_tier, amount, currency
  )
  values (
    'KURO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    p_user_id, null, 'user_subscription', p_plan_tier, plan_amount, 'PHP'
  )
  returning * into transaction_row;

  return query select transaction_row.id, transaction_row.reference_number,
    null::uuid, transaction_row.amount, transaction_row.currency, plan_name,
    '/account-plan?payment=processing', '/account-plan', null::text;
end;
$$;

revoke execute on function public.create_paymongo_user_subscription_order(uuid, text) from public, anon, authenticated;
grant execute on function public.create_paymongo_user_subscription_order(uuid, text) to service_role;

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
  select payment_transactions.* into transaction_row
  from public.payment_transactions
  where payment_transactions.reference_number = p_reference_number
  for update;
  if not found then return false; end if;

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
    if not found then return false; end if;
  elsif transaction_row.payment_type = 'organization_subscription' then
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
  else
    update public.profiles
    set plan_tier = transaction_row.plan_tier,
        plan_expires_at = case
          when profiles.plan_tier = transaction_row.plan_tier
            and profiles.plan_expires_at > now()
            then profiles.plan_expires_at + interval '1 month'
          else now() + interval '1 month'
        end
    where id = transaction_row.user_id
      and account_status = 'active';
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

create or replace function public.enforce_individual_event_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_tier text;
  event_limit integer;
  active_events bigint;
  was_active_published boolean := false;
begin
  if current_user_id is not null then
    if tg_op = 'INSERT' then
      new.created_by := current_user_id;
    else
      new.created_by := old.created_by;
    end if;
  end if;

  if current_user_id is null or public.is_superadmin() or new.status <> 'published' then
    return new;
  end if;

  select case
      when profiles.plan_expires_at > now() then profiles.plan_tier
      else 'free'
    end
  into current_tier
  from public.profiles
  where profiles.id = current_user_id
    and profiles.account_status = 'active';
  if current_tier is null then
    raise exception 'An active KURO account is required to publish events.';
  end if;

  if tg_op = 'UPDATE' then
    was_active_published := old.status = 'published'
      and old.organization_id = new.organization_id
      and coalesce(old.end_date, old.start_date + interval '1 hour') >= now();
  end if;

  if current_tier = 'free' and new.ticket_price > 0
    and (tg_op = 'INSERT' or old.ticket_price is distinct from new.ticket_price or old.status <> 'published') then
    raise exception 'Paid ticket events require a Pro or Business plan.';
  end if;
  if current_tier = 'free' and new.venue_id is not null
    and (tg_op = 'INSERT' or old.venue_id is distinct from new.venue_id or old.status <> 'published') then
    raise exception 'Seating plans require a Pro or Business plan.';
  end if;

  if current_tier = 'business' then
    event_limit := null;
  elsif current_tier = 'pro' then
    event_limit := 10;
  else
    event_limit := 3;
  end if;

  if not was_active_published and event_limit is not null then
    perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
    select count(*) into active_events
    from public.events
    where events.status = 'published'
      and events.created_by = current_user_id
      and events.id is distinct from new.id
      and coalesce(events.end_date, events.start_date + interval '1 hour') >= now();
    if active_events >= event_limit then
      raise exception 'Your % plan allows up to % active events. Upgrade your plan or wait for an event to end.',
        initcap(current_tier), event_limit;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_individual_event_plan() from public, anon, authenticated;
drop trigger if exists events_enforce_individual_event_plan on public.events;
create trigger events_enforce_individual_event_plan
  before insert or update of status, ticket_price, venue_id, created_by on public.events
  for each row execute function public.enforce_individual_event_plan();

create or replace function public.admin_save_event_with_banner(
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
  p_clear_banner boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if p_banner_url is not null and p_clear_banner then
    raise exception 'Choose a banner image or clear the current image, not both.';
  end if;

  saved_id := public.admin_save_event(
    p_event_id, p_organization_id, p_title, p_slug, p_short_description,
    p_description, p_category, p_tags, p_start_date, p_end_date,
    p_registration_opens_at, p_registration_deadline, p_checkin_opens_at,
    p_checkin_closes_at, p_venue_id, p_venue_name, p_city, p_capacity,
    p_ticket_price, p_currency, p_status, p_approval, p_waitlist,
    p_online_meeting_url, p_timezone, p_clear_online_meeting_url
  );
  if p_banner_url is not null or p_clear_banner then
    update public.events
    set banner_url = p_banner_url, updated_at = now()
    where id = saved_id and organization_id = p_organization_id;
  end if;
  return saved_id;
end;
$$;

revoke execute on function public.admin_save_event_with_banner(
  uuid, uuid, text, text, text, text, text, text[], timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, uuid, text, text,
  integer, numeric, text, text, text, boolean, text, text, boolean, text, boolean
) from public, anon;
grant execute on function public.admin_save_event_with_banner(
  uuid, uuid, text, text, text, text, text, text[], timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, uuid, text, text,
  integer, numeric, text, text, text, boolean, text, text, boolean, text, boolean
) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-banners', 'event-banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Organization admins can upload event banners"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-banners'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.can_manage_organization(
        case
          when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then ((storage.foldername(name))[1])::uuid
        end
      )
      or (
        (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.events
          where events.id = case
              when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then ((storage.foldername(name))[2])::uuid
            end
            and events.organization_id = case
              when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then ((storage.foldername(name))[1])::uuid
            end
            and public.can_manage_event(events.id)
        )
      )
    )
  );

create policy "Organization admins can remove event banners"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-banners'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.can_manage_organization(
        case
          when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then ((storage.foldername(name))[1])::uuid
        end
      )
      or (
        (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.events
          where events.id = case
              when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then ((storage.foldername(name))[2])::uuid
            end
            and events.organization_id = case
              when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then ((storage.foldername(name))[1])::uuid
            end
            and public.can_manage_event(events.id)
        )
      )
    )
  );
