update public.profiles
set plan_tier = 'free',
    plan_expires_at = null
where plan_tier <> 'free' or plan_expires_at is not null;

alter table public.profiles
  drop constraint if exists profiles_plan_tier_check,
  add constraint profiles_plan_tier_check check (plan_tier = 'free');

update public.organizations
set plan_tier = 'free',
    subscription_expires_at = null
where plan_tier <> 'free' or subscription_expires_at is not null;

alter table public.organizations
  drop constraint if exists organizations_plan_tier_check,
  add constraint organizations_plan_tier_check check (plan_tier = 'free');

update public.organizer_applications
set requested_plan = 'free'
where requested_plan <> 'free';

alter table public.organizer_applications
  drop constraint if exists organizer_applications_requested_plan_check,
  add constraint organizer_applications_requested_plan_check check (requested_plan = 'free');

update public.payment_transactions
set status = 'cancelled'
where status = 'pending'
  and payment_type in ('user_subscription', 'organization_subscription');

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
  select
    'free'::text,
    null::timestamptz,
    count(events.id),
    3
  from public.profiles
  left join public.events
    on events.created_by = (select auth.uid())
    and events.status = 'published'
    and coalesce(events.end_date, events.start_date + interval '1 hour') >= now()
  where profiles.id = (select auth.uid())
    and profiles.account_status = 'active';
$$;

create or replace function public.enforce_individual_event_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  event_limit integer := 3;
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

  if not exists (
    select 1
    from public.profiles
    where profiles.id = current_user_id
      and profiles.account_status = 'active'
  ) then
    raise exception 'An active KURO account is required to publish events.';
  end if;

  if new.ticket_price > 0
    and new.currency <> 'PHP'
    and (tg_op = 'INSERT' or old.ticket_price is distinct from new.ticket_price or old.status <> 'published') then
    raise exception 'Paid event publishing currently supports PHP checkout only';
  end if;

  if tg_op = 'UPDATE' then
    was_active_published := old.status = 'published'
      and old.organization_id = new.organization_id
      and coalesce(old.end_date, old.start_date + interval '1 hour') >= now();
  end if;

  if not was_active_published then
    perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
    select count(*) into active_events
    from public.events
    where events.status = 'published'
      and events.created_by = current_user_id
      and events.id is distinct from new.id
      and coalesce(events.end_date, events.start_date + interval '1 hour') >= now();
    if active_events >= event_limit then
      raise exception 'Free accounts can publish up to % active events. Wait for an event to end before publishing another.',
        event_limit;
    end if;
  end if;

  return new;
end;
$$;
