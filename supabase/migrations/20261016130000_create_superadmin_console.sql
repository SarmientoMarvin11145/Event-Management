create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'superadmin'
  );
$$;

revoke execute on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

alter table public.profiles
  add column account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'banned'));

alter table public.organizations
  add column plan_tier text not null default 'free'
    check (plan_tier in ('free', 'pro', 'business', 'enterprise')),
  add column status text not null default 'active'
    check (status in ('active', 'suspended', 'pending'));

alter table public.events
  add column moderation_status text not null default 'normal'
    check (moderation_status in ('normal', 'flagged', 'under_review', 'removed')),
  add column moderation_reason text;

alter table public.organizer_applications
  drop constraint if exists organizer_applications_status_check,
  add column requested_plan text not null default 'free'
    check (requested_plan in ('free', 'pro', 'business', 'enterprise')),
  add column review_notes text,
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz;

alter table public.organizer_applications
  add constraint organizer_applications_status_check
  check (status in ('pending', 'under_review', 'needs_info', 'approved', 'rejected'));

drop index if exists public.organizer_applications_one_pending_per_user_idx;
create unique index organizer_applications_one_open_per_user_idx
  on public.organizer_applications (user_id)
  where status in ('pending', 'under_review', 'needs_info');

alter table public.support_requests
  add column priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  add column assigned_to uuid references public.profiles (id) on delete set null,
  add column updated_at timestamptz not null default now();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index support_messages_request_created_idx
  on public.support_messages (request_id, created_at);

create table public.superadmin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.superadmin_organization_owners (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index superadmin_audit_logs_created_idx
  on public.superadmin_audit_logs (created_at desc);

create index profiles_role_status_created_idx
  on public.profiles (role, account_status, created_at desc);
create index organizations_status_created_idx
  on public.organizations (status, created_at desc);
create index events_moderation_status_idx
  on public.events (moderation_status, created_at desc);
create index organizer_applications_status_created_idx
  on public.organizer_applications (status, created_at desc);
create index support_requests_status_priority_created_idx
  on public.support_requests (status, priority, created_at desc);

create table public.platform_settings (
  setting_key text primary key check (setting_key ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  setting_value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.feature_flags (
  flag_key text primary key check (flag_key ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  label text not null,
  description text not null default '',
  enabled boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.feature_flag_overrides (
  flag_key text not null references public.feature_flags (flag_key) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  enabled boolean not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (flag_key, organization_id)
);

create table public.platform_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 160),
  message text not null check (length(trim(message)) between 1 and 5000),
  target_role text check (target_role in ('user', 'admin', 'superadmin')),
  link text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at timestamptz not null default now()
);

create table public.platform_content (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('announcement', 'faq', 'blog')),
  title text not null check (length(trim(title)) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  body text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.superadmin_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 240),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index superadmin_tasks_user_created_idx
  on public.superadmin_tasks (user_id, completed_at, created_at desc);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.certificates enable row level security;
alter table public.organizer_applications enable row level security;
alter table public.support_requests enable row level security;
alter table public.support_messages enable row level security;

create policy "Superadmins can view all profiles"
  on public.profiles for select to authenticated
  using (public.is_superadmin());

create policy "Superadmins can view all organizations"
  on public.organizations for select to authenticated
  using (public.is_superadmin());
create policy "Superadmins can create organizations"
  on public.organizations for insert to authenticated
  with check (public.is_superadmin());
create policy "Superadmins can update organizations"
  on public.organizations for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "Visitors can view organizations with upcoming events" on public.organizations;
create policy "Visitors can view organizations with upcoming events"
  on public.organizations for select to anon, authenticated
  using (
    status = 'active'
    and exists (
      select 1
      from public.events
      where events.organization_id = organizations.id
        and events.status = 'published'
        and events.start_date >= now()
    )
  );

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

revoke execute on function public.is_public_organization_active(uuid) from public;
grant execute on function public.is_public_organization_active(uuid) to anon, authenticated;

drop policy if exists "Visitors can view published upcoming events" on public.events;
create policy "Visitors can view published upcoming events"
  on public.events for select to anon, authenticated
  using (
    status = 'published'
    and start_date >= now()
    and public.is_public_organization_active(organization_id)
  );

create policy "Superadmins can view all events"
  on public.events for select to authenticated
  using (public.is_superadmin());
create policy "Superadmins can update events"
  on public.events for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "Superadmins can view all registrations"
  on public.registrations for select to authenticated
  using (public.is_superadmin());
create policy "Superadmins can view all attendance logs"
  on public.attendance_logs for select to authenticated
  using (public.is_superadmin());
create policy "Superadmins can view all certificates"
  on public.certificates for select to authenticated
  using (public.is_superadmin());

create policy "Superadmins can manage organizer applications"
  on public.organizer_applications for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "Superadmins can manage support requests"
  on public.support_requests for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());
create policy "Superadmins can manage support messages"
  on public.support_messages for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());
create policy "Users can view support messages on their requests"
  on public.support_messages for select to authenticated
  using (
    exists (
      select 1
      from public.support_requests
      where support_requests.id = support_messages.request_id
        and support_requests.user_id = (select auth.uid())
    )
  );
create policy "Users can reply to their own support requests"
  on public.support_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.support_requests
      where support_requests.id = support_messages.request_id
        and support_requests.user_id = (select auth.uid())
    )
  );

alter table public.superadmin_audit_logs enable row level security;
alter table public.superadmin_organization_owners enable row level security;
alter table public.platform_settings enable row level security;
alter table public.feature_flags enable row level security;
alter table public.feature_flag_overrides enable row level security;
alter table public.platform_broadcasts enable row level security;
alter table public.platform_content enable row level security;
alter table public.superadmin_tasks enable row level security;

create policy "Superadmins can view audit logs"
  on public.superadmin_audit_logs for select to authenticated
  using (public.is_superadmin());
create policy "Superadmins can view organization ownership"
  on public.superadmin_organization_owners for select to authenticated
  using (public.is_superadmin());
create policy "Superadmins can insert audit logs"
  on public.superadmin_audit_logs for insert to authenticated
  with check (public.is_superadmin() and actor_id = (select auth.uid()));

create policy "Superadmins can manage platform settings"
  on public.platform_settings for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin() and updated_by = (select auth.uid()));
create policy "Superadmins can manage feature flags"
  on public.feature_flags for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin() and updated_by = (select auth.uid()));
create policy "Superadmins can manage feature overrides"
  on public.feature_flag_overrides for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin() and updated_by = (select auth.uid()));
create policy "Superadmins can manage platform broadcasts"
  on public.platform_broadcasts for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin() and created_by = (select auth.uid()));
create policy "Superadmins can manage platform content"
  on public.platform_content for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin() and updated_by = (select auth.uid()));
create policy "Superadmins can manage their own tasks"
  on public.superadmin_tasks for all to authenticated
  using (public.is_superadmin() and user_id = (select auth.uid()))
  with check (public.is_superadmin() and user_id = (select auth.uid()));

grant select on public.profiles, public.organizations, public.events,
  public.registrations, public.attendance_logs, public.certificates,
  public.organizer_applications, public.support_requests, public.support_messages,
  public.superadmin_audit_logs, public.platform_settings, public.feature_flags,
  public.feature_flag_overrides, public.platform_broadcasts, public.platform_content,
  public.superadmin_tasks, public.superadmin_organization_owners to authenticated;
grant insert, update on public.organizations to authenticated;
grant update (status, moderation_status, moderation_reason) on public.events to authenticated;
grant update (status, requested_plan, review_notes, reviewed_by, reviewed_at)
  on public.organizer_applications to authenticated;
grant update (status, priority, assigned_to, updated_at)
  on public.support_requests to authenticated;
grant insert on public.support_messages to authenticated;
grant insert on public.superadmin_audit_logs to authenticated;
grant insert, update, delete on public.platform_settings, public.feature_flags,
  public.feature_flag_overrides, public.platform_content to authenticated;
grant insert, update, delete on public.platform_broadcasts to authenticated;
grant insert, update, delete on public.superadmin_tasks to authenticated;
grant insert on public.notifications to authenticated;

create or replace function public.superadmin_list_users(
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0,
  p_user_ids uuid[] default null
)
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  role text,
  account_status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin access required';
  end if;
  if p_limit is null or p_offset is null or p_limit not between 1 and 500 or p_offset < 0 then
    raise exception 'Invalid pagination range';
  end if;
  if p_search is not null and length(p_search) > 100 then
    raise exception 'Search query is too long';
  end if;

  return query
  select profiles.id, users.email::text, profiles.full_name, profiles.phone,
    profiles.role, profiles.account_status, profiles.created_at
  from public.profiles
  join auth.users as users on users.id = profiles.id
  where (p_user_ids is null or profiles.id = any(p_user_ids))
    and (
      p_search is null
      or users.email ilike '%' || p_search || '%'
      or coalesce(profiles.full_name, '') ilike '%' || p_search || '%'
      or coalesce(profiles.phone, '') ilike '%' || p_search || '%'
    )
  order by profiles.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.superadmin_list_users(text, integer, integer, uuid[]) from public, anon;
grant execute on function public.superadmin_list_users(text, integer, integer, uuid[]) to authenticated;

create or replace function public.superadmin_update_user(
  p_user_id uuid,
  p_role text,
  p_account_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role text;
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin access required';
  end if;
  if p_role not in ('user', 'admin') then
    raise exception 'Role must be user or admin';
  end if;
  if p_account_status not in ('active', 'suspended', 'banned') then
    raise exception 'Invalid account status';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot change your own role or account status';
  end if;

  select profiles.role into current_role
  from public.profiles
  where profiles.id = p_user_id
  for update;
  if current_role is null then
    raise exception 'User profile not found';
  end if;
  if current_role = 'superadmin' then
    raise exception 'Superadmin roles cannot be changed here';
  end if;

  update public.profiles
  set role = p_role, account_status = p_account_status
  where id = p_user_id;

  insert into public.superadmin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()),
    'user.access_updated',
    'profile',
    p_user_id::text,
    jsonb_build_object('role', p_role, 'account_status', p_account_status)
  );
end;
$$;

revoke execute on function public.superadmin_update_user(uuid, text, text) from public, anon;
grant execute on function public.superadmin_update_user(uuid, text, text) to authenticated;

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

    insert into public.organizations (
      name, slug, sector, plan_tier, status
    )
    values (
      application_row.organization_name,
      organization_slug,
      organization_sector,
      application_row.requested_plan,
      'active'
    )
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

revoke execute on function public.superadmin_review_application(uuid, text, text) from public, anon;
grant execute on function public.superadmin_review_application(uuid, text, text) to authenticated;

create or replace function public.superadmin_send_broadcast(
  p_title text,
  p_message text,
  p_target_role text,
  p_link text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  broadcast_id uuid;
  recipient_total integer;
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin access required';
  end if;
  if length(trim(p_title)) not between 1 and 160 then
    raise exception 'Title must be between 1 and 160 characters';
  end if;
  if length(trim(p_message)) not between 1 and 5000 then
    raise exception 'Message must be between 1 and 5000 characters';
  end if;
  if p_target_role is not null and p_target_role not in ('user', 'admin', 'superadmin') then
    raise exception 'Invalid recipient role';
  end if;
  if p_link is not null and (
    p_link !~ '^/'
    or p_link like '//%'
    or position(E'\\' in p_link) > 0
    or length(p_link) > 500
  ) then
    raise exception 'Broadcast links must be local paths';
  end if;

  insert into public.platform_broadcasts (title, message, target_role, link, created_by)
  values (trim(p_title), trim(p_message), p_target_role, p_link, (select auth.uid()))
  returning id into broadcast_id;

  insert into public.notifications (user_id, type, title, message, link)
  select profiles.id, 'announcement', trim(p_title), trim(p_message), p_link
  from public.profiles
  where profiles.account_status = 'active'
    and (p_target_role is null or profiles.role = p_target_role);
  get diagnostics recipient_total = row_count;

  update public.platform_broadcasts
  set recipient_count = recipient_total
  where id = broadcast_id;

  insert into public.superadmin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()),
    'broadcast.sent',
    'platform_broadcast',
    broadcast_id::text,
    jsonb_build_object('target_role', p_target_role, 'recipient_count', recipient_total)
  );

  return recipient_total;
end;
$$;

revoke execute on function public.superadmin_send_broadcast(text, text, text, text) from public, anon;
grant execute on function public.superadmin_send_broadcast(text, text, text, text) to authenticated;

create or replace function public.superadmin_write_log(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin access required';
  end if;
  insert into public.superadmin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()),
    left(p_action, 120),
    left(p_entity_type, 80),
    left(p_entity_id, 160),
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.superadmin_write_log(text, text, text, jsonb) from public, anon;
grant execute on function public.superadmin_write_log(text, text, text, jsonb) to authenticated;

insert into public.feature_flags (flag_key, label, description, enabled)
values
  ('ai-chatbot', 'AI attendee support', 'AI support features are not connected in this preview.', false),
  ('seating-plans', 'Seating plans', 'Enable seating plan workflows.', false),
  ('booth-management', 'Booth management', 'Enable exhibitor and booth workflows.', false),
  ('facial-check-in', 'Facial check-in', 'Disabled; requires a privacy and security review.', false),
  ('payment-gateway', 'Paid checkout', 'No payment provider is connected.', false),
  ('offline-mode', 'Offline mode', 'Enable offline event operations.', false),
  ('advanced-analytics', 'Advanced analytics', 'Enable organization analytics.', false)
on conflict (flag_key) do nothing;
