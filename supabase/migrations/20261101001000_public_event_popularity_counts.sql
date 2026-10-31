create or replace function public.get_public_event_registration_counts(p_event_ids uuid[])
returns table (
  event_id uuid,
  confirmed_ticket_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select registrations.event_id, coalesce(sum(registrations.quantity), 0)::bigint
  from public.registrations
  join public.events on events.id = registrations.event_id
  where registrations.event_id = any(p_event_ids)
    and registrations.status = 'confirmed'
    and events.status = 'published'
    and events.moderation_status not in ('under_review', 'removed')
    and public.is_public_organization_active(events.organization_id)
  group by registrations.event_id;
$$;

revoke execute on function public.get_public_event_registration_counts(uuid[]) from public;
grant execute on function public.get_public_event_registration_counts(uuid[]) to anon, authenticated;
