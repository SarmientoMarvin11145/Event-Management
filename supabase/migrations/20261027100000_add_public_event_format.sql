alter table public.events
  add column if not exists event_format text not null default 'unspecified';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_event_format_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_event_format_check
      check (event_format in ('in_person', 'online', 'hybrid', 'unspecified'));
  end if;
end;
$$;

update public.events events
set event_format = case
  when nullif(trim(details.online_meeting_url), '') is not null
    and (events.venue_id is not null or nullif(trim(events.venue_name), '') is not null)
    then 'hybrid'
  when nullif(trim(details.online_meeting_url), '') is not null then 'online'
  when events.venue_id is not null or nullif(trim(events.venue_name), '') is not null
    then 'in_person'
  else 'unspecified'
end
from (select event_id, online_meeting_url from public.event_private_details) details
where events.id = details.event_id;

update public.events events
set event_format = case
  when events.venue_id is not null or nullif(trim(events.venue_name), '') is not null
    then 'in_person'
  else 'unspecified'
end
where not exists (
  select 1 from public.event_private_details details
  where details.event_id = events.id
    and nullif(trim(details.online_meeting_url), '') is not null
);

create or replace function public.sync_event_format()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event_id uuid;
  has_online_link boolean;
  has_venue boolean;
  resolved_format text;
begin
  if tg_table_name = 'events' then
    target_event_id := new.id;
    has_venue := new.venue_id is not null or nullif(trim(new.venue_name), '') is not null;
    select exists (
      select 1
      from public.event_private_details details
      where details.event_id = target_event_id
        and nullif(trim(details.online_meeting_url), '') is not null
    ) into has_online_link;

    new.event_format := case
      when has_online_link and has_venue then 'hybrid'
      when has_online_link then 'online'
      when has_venue then 'in_person'
      else 'unspecified'
    end;
    return new;
  end if;

  target_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  select exists (
    select 1
    from public.event_private_details details
    where details.event_id = target_event_id
      and nullif(trim(details.online_meeting_url), '') is not null
  ) into has_online_link;
  select exists (
    select 1
    from public.events events
    where events.id = target_event_id
      and (events.venue_id is not null or nullif(trim(events.venue_name), '') is not null)
  ) into has_venue;

  resolved_format := case
    when has_online_link and has_venue then 'hybrid'
    when has_online_link then 'online'
    when has_venue then 'in_person'
    else 'unspecified'
  end;
  update public.events
  set event_format = resolved_format
  where id = target_event_id;
  return null;
end;
$$;

drop trigger if exists sync_event_format_from_event on public.events;
create trigger sync_event_format_from_event
before insert or update on public.events
for each row execute function public.sync_event_format();

drop trigger if exists sync_event_format_from_private_details on public.event_private_details;
create trigger sync_event_format_from_private_details
after insert or update or delete on public.event_private_details
for each row execute function public.sync_event_format();
