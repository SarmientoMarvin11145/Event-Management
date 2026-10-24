create or replace function public.is_attendee_registered_for_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.registrations
    where registrations.event_id = p_event_id
      and registrations.attendee_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_attendee_registered_for_event(uuid) from public, anon;
grant execute on function public.is_attendee_registered_for_event(uuid) to authenticated;

drop policy if exists "Attendees can view events they registered for" on public.events;
create policy "Attendees can view events they registered for"
  on public.events for select to authenticated
  using (public.is_attendee_registered_for_event(id));
