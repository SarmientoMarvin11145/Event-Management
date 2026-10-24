create or replace function public.is_public_organization_active(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations
    where organizations.id = p_organization_id
      and organizations.status = 'active'
  );
$$;

create or replace function public.has_public_upcoming_events(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events
    where events.organization_id = p_organization_id
      and events.status = 'published'
      and events.start_date >= now()
  );
$$;

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

revoke execute on function public.is_public_organization_active(uuid) from public;
revoke execute on function public.has_public_upcoming_events(uuid) from public, anon;
revoke execute on function public.is_attendee_registered_for_event(uuid) from public, anon;
grant execute on function public.is_public_organization_active(uuid) to anon, authenticated;
grant execute on function public.has_public_upcoming_events(uuid) to anon, authenticated;
grant execute on function public.is_attendee_registered_for_event(uuid) to authenticated;

drop policy if exists "Visitors can view organizations with upcoming events" on public.organizations;
create policy "Visitors can view organizations with upcoming events"
  on public.organizations for select to anon, authenticated
  using (
    status = 'active'
    and public.has_public_upcoming_events(id)
  );

drop policy if exists "Visitors can view published upcoming events" on public.events;
create policy "Visitors can view published upcoming events"
  on public.events for select to anon, authenticated
  using (
    status = 'published'
    and start_date >= now()
    and public.is_public_organization_active(organization_id)
  );

drop policy if exists "Attendees can view events they registered for" on public.events;
create policy "Attendees can view events they registered for"
  on public.events for select to authenticated
  using (public.is_attendee_registered_for_event(id));
