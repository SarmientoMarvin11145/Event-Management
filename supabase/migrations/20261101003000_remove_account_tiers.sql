create or replace function public.enforce_event_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
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

  return new;
end;
$$;

revoke execute on function public.enforce_event_account() from public, anon, authenticated;

drop trigger if exists events_enforce_individual_event_plan on public.events;
create trigger events_enforce_event_account
  before insert or update of status, ticket_price, venue_id, created_by on public.events
  for each row execute function public.enforce_event_account();
drop function if exists public.enforce_individual_event_plan();

create or replace function public.admin_change_event_status(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.events%rowtype;
begin
  if p_status not in ('draft', 'published', 'cancelled') then
    raise exception 'Invalid event status';
  end if;

  select * into target_event
  from public.events
  where id = p_event_id
  for update;

  if not found or not public.can_manage_event(p_event_id) then
    raise exception 'Event not found or access was denied';
  end if;
  if target_event.status = p_status then return; end if;

  if p_status = 'published' then
    if target_event.start_date <= now() then
      raise exception 'Only future events can be published';
    end if;
    if target_event.ticket_price > 0 and target_event.currency <> 'PHP' then
      raise exception 'Paid event publishing currently supports PHP checkout only';
    end if;
  end if;

  update public.events
  set status = p_status, updated_at = now()
  where id = p_event_id;
end;
$$;

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
  if not found or transaction_row.payment_type <> 'event_ticket' then return false; end if;

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

create or replace function public.superadmin_review_application(
  p_application_id uuid,
  p_decision text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_row public.organizer_applications%rowtype;
  organization_id uuid;
  organization_slug text;
  organization_sector text;
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin access required';
  end if;
  if p_decision not in ('under_review', 'needs_info', 'approved', 'rejected') then
    raise exception 'Invalid application decision';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'Review note must be 2000 characters or fewer';
  end if;

  select * into application_row
  from public.organizer_applications
  where id = p_application_id
  for update;
  if not found then
    raise exception 'Application not found';
  end if;
  if application_row.status in ('approved', 'rejected') then
    raise exception 'This application has already been finalized';
  end if;

  if p_decision = 'approved' then
    organization_sector := case lower(application_row.organization_type)
      when 'school' then 'school'
      when 'education' then 'school'
      when 'restaurant' then 'restaurant'
      when 'hospitality' then 'restaurant'
      when 'lgu' then 'lgu'
      when 'barangay' then 'lgu'
      when 'webinar' then 'webinar'
      when 'expo' then 'expo'
      when 'private' then 'private'
      when 'celebration' then 'private'
      else 'other'
    end;

    organization_slug := trim(both '-' from regexp_replace(
      lower(application_row.organization_name),
      '[^a-z0-9]+',
      '-',
      'g'
    ));
    organization_slug := left(organization_slug, 60) || '-' ||
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    insert into public.organizations (name, slug, sector, status)
    values (application_row.organization_name, organization_slug, organization_sector, 'active')
    returning id into organization_id;

    insert into public.superadmin_organization_owners (organization_id, user_id)
    values (organization_id, application_row.user_id);

    update public.profiles set role = 'admin' where id = application_row.user_id;
    insert into public.notifications (user_id, type, title, message, link)
    values (
      application_row.user_id,
      'announcement',
      'Organizer application approved',
      'Your organization application has been approved. You can now access the organization workspace.',
      '/admin/dashboard'
    );
  elsif p_decision = 'rejected' then
    insert into public.notifications (user_id, type, title, message, link)
    values (
      application_row.user_id,
      'announcement',
      'Organizer application update',
      coalesce(nullif(trim(p_note), ''), 'Your organizer application was not approved at this time.'),
      '/apply-organizer'
    );
  elsif p_decision = 'needs_info' then
    insert into public.notifications (user_id, type, title, message, link)
    values (
      application_row.user_id,
      'announcement',
      'More information requested',
      coalesce(nullif(trim(p_note), ''), 'Please review your organizer application and provide more information.'),
      '/apply-organizer'
    );
  end if;

  update public.organizer_applications
  set status = p_decision,
      review_notes = nullif(trim(p_note), ''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = p_application_id;

  insert into public.superadmin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()),
    'organizer_application.' || p_decision,
    'organizer_application',
    p_application_id::text,
    jsonb_build_object('organization_id', organization_id, 'note', nullif(trim(p_note), ''))
  );

  return organization_id;
end;
$$;

revoke update (requested_plan) on public.organizer_applications from authenticated;

drop function if exists public.get_my_plan_entitlements();
drop function if exists public.create_paymongo_user_subscription_order(uuid, text);
drop function if exists public.create_paymongo_subscription_order(uuid, uuid, text);
drop function if exists public.list_my_paymongo_organizations();

drop index if exists public.payment_transactions_one_pending_user_plan_idx;
alter table public.payment_transactions
  drop constraint if exists payment_transaction_target_check,
  add constraint payment_transaction_target_check check (
    (payment_type = 'event_ticket' and event_id is not null and registration_id is not null)
    or
    (payment_type = 'organization_subscription' and organization_id is not null and event_id is null and registration_id is null)
    or
    (payment_type = 'user_subscription' and organization_id is null and event_id is null and registration_id is null)
  ),
  drop column if exists plan_tier;

alter table public.profiles
  drop column if exists plan_tier,
  drop column if exists plan_expires_at;

alter table public.organizations
  drop column if exists plan_tier,
  drop column if exists subscription_expires_at;

alter table public.organizer_applications
  drop column if exists requested_plan;

notify pgrst, 'reload schema';
