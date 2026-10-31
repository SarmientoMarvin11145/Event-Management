create or replace function public.enforce_individual_event_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_tier text;
  organization_tier text;
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

  if new.organization_id is not null then
    select organizations.plan_tier into organization_tier
    from public.organizations
    where organizations.id = new.organization_id
      and organizations.plan_tier in ('pro', 'business')
      and organizations.subscription_expires_at > now();
    if organization_tier is not null then
      current_tier := organization_tier;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    was_active_published := old.status = 'published'
      and old.organization_id = new.organization_id
      and coalesce(old.end_date, old.start_date + interval '1 hour') >= now();
  end if;

  if new.ticket_price > 0
    and (tg_op = 'INSERT' or old.ticket_price is distinct from new.ticket_price or old.status <> 'published') then
    if new.currency <> 'PHP' then
      raise exception 'Paid event publishing currently supports PHP checkout only';
    end if;
    if not exists (
      select 1
      from public.organizations
      where id = new.organization_id
        and plan_tier in ('pro', 'business')
        and subscription_expires_at > now()
    ) then
      raise exception 'Paid ticket events require an active Pro or Business plan for this organization';
    end if;
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
