alter table public.profiles
  add column terms_policy_version text,
  add column terms_accepted_at timestamptz,
  add column privacy_policy_version text,
  add column privacy_accepted_at timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    avatar_url,
    terms_policy_version,
    terms_accepted_at,
    privacy_policy_version,
    privacy_accepted_at
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), '')
    ),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    case when new.raw_user_meta_data ->> 'terms_policy_version' = '2026-10-16' then '2026-10-16' else null end,
    case when new.raw_user_meta_data ->> 'terms_policy_version' = '2026-10-16' then now() else null end,
    case when new.raw_user_meta_data ->> 'privacy_policy_version' = '2026-10-16' then '2026-10-16' else null end,
    case when new.raw_user_meta_data ->> 'privacy_policy_version' = '2026-10-16' then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;