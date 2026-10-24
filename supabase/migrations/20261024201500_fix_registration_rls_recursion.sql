create or replace function public.can_register_for_event(
  p_event_id uuid,
  p_free_only boolean default true
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events
    where events.id = p_event_id
      and events.status = 'published'
      and events.start_date > now()
      and (
        (p_free_only and events.ticket_price = 0)
        or (not p_free_only and events.ticket_price > 0)
      )
  );
$$;

revoke execute on function public.can_register_for_event(uuid, boolean) from public, anon;
grant execute on function public.can_register_for_event(uuid, boolean) to authenticated;

drop policy if exists "Attendees can register for free published events"
  on public.registrations;
create policy "Attendees can register for free published events"
  on public.registrations for insert to authenticated
  with check (
    (select auth.uid()) = attendee_id
    and status = 'confirmed'
    and public.can_register_for_event(event_id, true)
  );

drop policy if exists "Attendees can cancel their upcoming registrations"
  on public.registrations;
create policy "Attendees can cancel their upcoming registrations"
  on public.registrations for update to authenticated
  using (
    (select auth.uid()) = attendee_id
    and status = 'confirmed'
    and public.can_register_for_event(event_id, true)
  )
  with check ((select auth.uid()) = attendee_id and status = 'cancelled');
