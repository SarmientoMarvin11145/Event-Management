create or replace function public.can_save_public_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = p_event_id
      and events.status = 'published'
      and organizations.status = 'active'
      and (
        events.registration_deadline is null
        or events.registration_deadline >= now()
        or coalesce(events.end_date, events.start_date + interval '1 hour') >= now()
      )
  );
$$;

revoke execute on function public.can_save_public_event(uuid) from public, anon;
grant execute on function public.can_save_public_event(uuid) to authenticated;

drop policy if exists "Users can save upcoming public events" on public.favorites;
create policy "Users can save active public events"
  on public.favorites for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.can_save_public_event(event_id)
  );
