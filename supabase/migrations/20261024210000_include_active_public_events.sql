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
      and (
        events.registration_deadline is null
        or events.registration_deadline >= now()
        or coalesce(events.end_date, events.start_date + interval '1 hour') >= now()
      )
  );
$$;

drop policy if exists "Visitors can view published upcoming events" on public.events;
create policy "Visitors can view published upcoming events"
  on public.events for select to anon, authenticated
  using (
    status = 'published'
    and (
      registration_deadline is null
      or registration_deadline >= now()
      or coalesce(end_date, start_date + interval '1 hour') >= now()
    )
    and public.is_public_organization_active(organization_id)
  );
