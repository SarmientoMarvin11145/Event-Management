alter table public.profiles
  add column if not exists phone text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists country text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists barangay text,
  add column if not exists street_address text,
  add column if not exists occupation text,
  add column if not exists company text,
  add column if not exists job_title text,
  add column if not exists linkedin_url text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists emergency_contact_phone text,
  add column if not exists dietary_restrictions text,
  add column if not exists accessibility_needs text,
  add column if not exists t_shirt_size text,
  add column if not exists language_preference text not null default 'en',
  add column if not exists interests text[] not null default '{}';

grant update (
  full_name,
  avatar_url,
  phone,
  date_of_birth,
  gender,
  country,
  province,
  city,
  barangay,
  street_address,
  occupation,
  company,
  job_title,
  linkedin_url,
  emergency_contact_name,
  emergency_contact_relationship,
  emergency_contact_phone,
  dietary_restrictions,
  accessibility_needs,
  t_shirt_size,
  language_preference,
  interests
) on public.profiles to authenticated;

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'pending', 'cancelled', 'waitlisted', 'invited')),
  ticket_type text not null default 'General admission',
  registration_code text not null unique
    default ('K-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  qr_token uuid not null unique default gen_random_uuid(),
  seat_number text,
  booth_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendee_id, event_id)
);

create index registrations_attendee_created_idx
  on public.registrations (attendee_id, created_at desc);
create index registrations_event_status_idx
  on public.registrations (event_id, status);

alter table public.registrations enable row level security;
grant select on public.registrations to authenticated;
grant insert (attendee_id, event_id) on public.registrations to authenticated;
grant update (status) on public.registrations to authenticated;

create policy "Attendees can view their own registrations"
  on public.registrations for select to authenticated
  using ((select auth.uid()) = attendee_id);

create policy "Attendees can view events they registered for"
  on public.events for select to authenticated
  using (
    exists (
      select 1 from public.registrations
      where registrations.event_id = events.id
        and registrations.attendee_id = (select auth.uid())
    )
  );

create policy "Attendees can view organizations for their registrations"
  on public.organizations for select to authenticated
  using (
    exists (
      select 1
      from public.events
      join public.registrations on registrations.event_id = events.id
      where events.organization_id = organizations.id
        and registrations.attendee_id = (select auth.uid())
    )
  );

create policy "Attendees can register for free published events"
  on public.registrations for insert to authenticated
  with check (
    (select auth.uid()) = attendee_id
    and status = 'confirmed'
    and exists (
      select 1 from public.events
      where events.id = registrations.event_id
        and events.status = 'published'
        and events.start_date > now()
        and events.ticket_price = 0
    )
  );

create policy "Attendees can cancel their upcoming registrations"
  on public.registrations for update to authenticated
  using (
    (select auth.uid()) = attendee_id
    and status = 'confirmed'
    and exists (
      select 1 from public.events
      where events.id = registrations.event_id
        and events.start_date > now()
    )
  )
  with check ((select auth.uid()) = attendee_id and status = 'cancelled');

create trigger registrations_set_updated_at
  before update on public.registrations
  for each row execute function public.set_profile_updated_at();

create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations (id) on delete cascade,
  check_in_time timestamptz not null default now(),
  check_out_time timestamptz,
  constraint attendance_checkout_after_checkin
    check (check_out_time is null or check_out_time >= check_in_time)
);

alter table public.attendance_logs enable row level security;
grant select on public.attendance_logs to authenticated;
create policy "Attendees can view their own attendance"
  on public.attendance_logs for select to authenticated
  using (
    exists (
      select 1 from public.registrations
      where registrations.id = attendance_logs.registration_id
        and registrations.attendee_id = (select auth.uid())
    )
  );

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  certificate_type text not null
    check (certificate_type in ('attendance', 'completion', 'cpd')),
  cpd_units numeric(5, 2) not null default 0 check (cpd_units >= 0),
  certificate_url text,
  verification_code text not null unique
    default ('C-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  issued_at timestamptz not null default now(),
  unique (user_id, event_id, certificate_type)
);

create index certificates_user_issued_idx
  on public.certificates (user_id, issued_at desc);
alter table public.certificates enable row level security;
grant select on public.certificates to authenticated;
create policy "Users can view their own certificates"
  on public.certificates for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create index favorites_user_created_idx on public.favorites (user_id, created_at desc);
alter table public.favorites enable row level security;
grant select, insert, delete on public.favorites to authenticated;
create policy "Users can view their own favorites"
  on public.favorites for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can save upcoming public events"
  on public.favorites for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.events
      where events.id = favorites.event_id
        and events.status = 'published'
        and events.start_date > now()
    )
  );
create policy "Users can remove their own favorites"
  on public.favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('reminder', 'registration', 'certificate', 'announcement', 'system')),
  title text not null,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
create policy "Users can view their own notifications"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can mark their own notifications read"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.notify_attendee_certificate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_title text;
  should_notify boolean;
begin
  select events.title into event_title
  from public.events
  where events.id = new.event_id;

  select coalesce(
    (
      select attendee_settings.notification_preferences ->> 'certificate_issued'
      from public.attendee_settings
      where attendee_settings.user_id = new.user_id
    ),
    'true'
  ) = 'true'
  into should_notify;

  if should_notify then
    insert into public.notifications (user_id, type, title, message, link)
    values (
      new.user_id,
      'certificate',
      'Certificate issued',
      'A certificate for ' || coalesce(event_title, 'an event') || ' was added to your account.',
      '/certificates'
    );
  end if;

  return new;
end;
$$;

create trigger certificates_notify_attendee
  after insert on public.certificates
  for each row execute function public.notify_attendee_certificate();

revoke execute on function public.notify_attendee_certificate() from public, anon, authenticated;

create function public.notify_attendee_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_title text;
  should_notify boolean;
begin
  select events.title into event_title
  from public.events
  where events.id = new.event_id;

  select coalesce(
    (
      select attendee_settings.notification_preferences ->> 'registration_confirmations'
      from public.attendee_settings
      where attendee_settings.user_id = new.attendee_id
    ),
    'true'
  ) = 'true'
  into should_notify;

  if should_notify then
    if tg_op = 'INSERT' then
      insert into public.notifications (user_id, type, title, message, link)
      values (
        new.attendee_id,
        'registration',
        'Registration confirmed',
        'Your registration for ' || coalesce(event_title, 'an event') || ' is confirmed.',
        '/my-tickets'
      );
    elsif old.status is distinct from new.status then
      insert into public.notifications (user_id, type, title, message, link)
      values (
        new.attendee_id,
        'registration',
        'Registration updated',
        'Your registration for ' || coalesce(event_title, 'an event') || ' is now ' || new.status || '.',
        '/my-tickets'
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger registrations_notify_attendee
  after insert or update of status on public.registrations
  for each row execute function public.notify_attendee_registration();

revoke execute on function public.notify_attendee_registration() from public, anon, authenticated;

create table public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.event_reviews enable row level security;
grant select on public.event_reviews to authenticated;
grant insert (user_id, event_id, rating, comment) on public.event_reviews to authenticated;
grant update (rating, comment) on public.event_reviews to authenticated;
create policy "Users can view their own reviews"
  on public.event_reviews for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Attendees can review events they attended"
  on public.event_reviews for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.registrations
      join public.attendance_logs on attendance_logs.registration_id = registrations.id
      where registrations.attendee_id = (select auth.uid())
        and registrations.event_id = event_reviews.event_id
    )
  );
create policy "Users can update their own reviews"
  on public.event_reviews for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);

alter table public.follows enable row level security;
grant select, insert, delete on public.follows to authenticated;
create policy "Users can manage their own follows"
  on public.follows for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.attendee_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  notification_preferences jsonb not null default '{
    "event_reminders": true,
    "registration_confirmations": true,
    "certificate_issued": true,
    "organization_events": true,
    "platform_updates": true,
    "promotions": false
  }'::jsonb,
  privacy_preferences jsonb not null default '{
    "profile_visibility": "private",
    "show_in_attendee_lists": false,
    "share_contact_with_organizers": false
  }'::jsonb,
  appearance_preferences jsonb not null default '{
    "theme": "system",
    "language": "en",
    "timezone": "Asia/Manila",
    "date_format": "medium"
  }'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.attendee_settings enable row level security;
grant select, insert, update on public.attendee_settings to authenticated;
create policy "Users can manage their own settings"
  on public.attendee_settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.support_requests enable row level security;
grant select on public.support_requests to authenticated;
grant insert (user_id, subject, message) on public.support_requests to authenticated;
create policy "Users can view their own support requests"
  on public.support_requests for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create support requests"
  on public.support_requests for insert to authenticated
  with check ((select auth.uid()) = user_id);

create table public.organizer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_name text not null,
  organization_type text not null,
  details text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index organizer_applications_user_created_idx
  on public.organizer_applications (user_id, created_at desc);
create unique index organizer_applications_one_pending_per_user_idx
  on public.organizer_applications (user_id)
  where status = 'pending';
alter table public.organizer_applications enable row level security;
grant select, insert on public.organizer_applications to authenticated;
create policy "Users can view their own organizer applications"
  on public.organizer_applications for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can submit organizer applications"
  on public.organizer_applications for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');

create function public.verify_certificate(p_verification_code text)
returns table (
  event_title text,
  organization_name text,
  certificate_type text,
  cpd_units numeric,
  issued_at timestamptz,
  verification_code text
)
language sql
security definer
set search_path = ''
as $$
  select
    events.title,
    organizations.name,
    certificates.certificate_type,
    certificates.cpd_units,
    certificates.issued_at,
    certificates.verification_code
  from public.certificates
  join public.events on events.id = certificates.event_id
  join public.organizations on organizations.id = events.organization_id
  where certificates.verification_code = p_verification_code
  limit 1;
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;
