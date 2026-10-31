alter table public.payment_transactions
  add column refund_id text unique,
  add column refund_status text not null default 'none'
    check (refund_status in ('none', 'pending', 'succeeded', 'failed')),
  add column refunded_at timestamptz;

create or replace function public.admin_list_registration_payment_statuses(
  p_registration_ids uuid[]
)
returns table (
  registration_id uuid,
  payment_status text,
  payment_amount bigint,
  payment_currency text,
  refund_status text,
  ticket_unit_price numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_registration_ids is null or cardinality(p_registration_ids) > 1000 then
    raise exception 'Invalid registration list';
  end if;
  return query
  select registrations.id, payments.status, payments.amount,
    payments.currency, coalesce(payments.refund_status, 'none'),
    registrations.ticket_unit_price
  from public.registrations
  join public.events on events.id = registrations.event_id
  left join lateral (
    select payment_transactions.status, payment_transactions.amount,
      payment_transactions.currency, payment_transactions.refund_status
    from public.payment_transactions
    where payment_transactions.registration_id = registrations.id
      and payment_transactions.payment_type = 'event_ticket'
    order by payment_transactions.created_at desc
    limit 1
  ) payments on true
  where registrations.id = any(p_registration_ids)
    and public.can_manage_event(events.id);
end;
$$;

revoke execute on function public.admin_list_registration_payment_statuses(uuid[]) from public, anon;
grant execute on function public.admin_list_registration_payment_statuses(uuid[]) to authenticated;

create or replace function public.admin_get_registration_checkout(p_registration_id uuid)
returns table (
  reference_number text,
  checkout_session_id text,
  payment_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.registrations
    where id = p_registration_id
      and public.can_manage_event(event_id)
  ) then raise exception 'Registration not found or access was denied'; end if;
  return query
  select payments.reference_number, payments.checkout_session_id, payments.status
  from public.payment_transactions payments
  where payments.registration_id = p_registration_id
    and payments.payment_type = 'event_ticket'
  order by payments.created_at desc
  limit 1;
end;
$$;

revoke execute on function public.admin_get_registration_checkout(uuid) from public, anon;
grant execute on function public.admin_get_registration_checkout(uuid) to authenticated;

create or replace function public.admin_begin_event_ticket_refund(p_registration_id uuid)
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
  select * into registration_row
  from public.registrations
  where id = p_registration_id
  for update;
  if not found then raise exception 'Registration not found'; end if;
  if not public.can_manage_event(registration_row.event_id) then
    raise exception 'Registration not found or access was denied';
  end if;
  if exists (
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
  set refund_status = 'pending', refund_id = null
  where id = payment_row.id;
  return query select payment_row.payment_id, payment_row.amount,
    payment_row.currency, 'pending'::text;
end;
$$;

revoke execute on function public.admin_begin_event_ticket_refund(uuid) from public, anon;
grant execute on function public.admin_begin_event_ticket_refund(uuid) to authenticated;

create or replace function public.admin_get_event_ticket_refund(p_registration_id uuid)
returns table (
  refund_id text,
  payment_id text,
  amount bigint,
  currency text,
  payment_status text,
  refund_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.registrations
    where id = p_registration_id
      and public.can_manage_event(event_id)
  ) then raise exception 'Registration not found or access was denied'; end if;
  return query
  select payments.refund_id, payments.payment_id, payments.amount,
    payments.currency, payments.status, payments.refund_status
  from public.payment_transactions payments
  where payments.registration_id = p_registration_id
    and payments.payment_type = 'event_ticket'
  order by payments.created_at desc
  limit 1;
end;
$$;

revoke execute on function public.admin_get_event_ticket_refund(uuid) from public, anon;
grant execute on function public.admin_get_event_ticket_refund(uuid) to authenticated;

create or replace function public.set_event_ticket_refund_status(
  p_registration_id uuid,
  p_refund_id text,
  p_refund_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payment_transactions%rowtype;
begin
  if p_refund_status not in ('pending', 'succeeded', 'failed') then
    raise exception 'Invalid refund status';
  end if;
  select * into payment_row
  from public.payment_transactions
  where registration_id = p_registration_id
    and payment_type = 'event_ticket'
  order by created_at desc
  limit 1
  for update;
  if not found or payment_row.status not in ('paid', 'refunded')
    or payment_row.refund_status not in ('pending', p_refund_status)
    or (payment_row.refund_id is not null and payment_row.refund_id <> p_refund_id) then
    return false;
  end if;
  update public.payment_transactions
  set refund_id = coalesce(refund_id, nullif(p_refund_id, '')),
      refund_status = p_refund_status,
      status = case when p_refund_status = 'succeeded' then 'refunded' else status end,
      refunded_at = case when p_refund_status = 'succeeded' then coalesce(refunded_at, now()) else refunded_at end
  where id = payment_row.id;
  if p_refund_status = 'succeeded' then
    update public.registrations
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = p_registration_id and status <> 'cancelled';
    delete from public.event_seat_reservations
    where registration_id = p_registration_id;
  end if;
  return true;
end;
$$;

revoke execute on function public.set_event_ticket_refund_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_event_ticket_refund_status(uuid, text, text) to service_role;

create or replace function public.prevent_cancelling_pending_event_checkout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'waitlisted')
    and old.status not in ('cancelled', 'waitlisted')
    and exists (
      select 1 from public.payment_transactions
      where registration_id = old.id
        and payment_type = 'event_ticket'
        and status = 'pending'
    ) then
    raise exception 'Expire the pending PayMongo checkout before cancelling this registration';
  end if;
  return new;
end;
$$;

create trigger registrations_prevent_cancelling_pending_checkout
  before update of status on public.registrations
  for each row execute function public.prevent_cancelling_pending_event_checkout();

revoke execute on function public.prevent_cancelling_pending_event_checkout() from public, anon, authenticated;

notify pgrst, 'reload schema';
