insert into public.organizations (name, slug, sector)
values ('KURO PayMongo Test Organizer', 'kuro-paymongo-test-organizer', 'webinar')
on conflict (slug) do nothing;

insert into public.events (
  organization_id,
  title,
  slug,
  description,
  start_date,
  end_date,
  venue_name,
  city,
  ticket_price,
  currency,
  capacity,
  status
)
select
  organizations.id,
  'PayMongo Test Webinar',
  'paymongo-test-webinar',
  'A sample paid event for testing PayMongo checkout in test mode. No real payment will be collected when using PayMongo test credentials.',
  now() + interval '3 days',
  now() + interval '3 days 2 hours',
  'Online webinar',
  'Online',
  50.00,
  'PHP',
  100,
  'published'
from public.organizations
where organizations.slug = 'kuro-paymongo-test-organizer'
on conflict (slug) do update
set
  organization_id = excluded.organization_id,
  title = excluded.title,
  description = excluded.description,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  venue_name = excluded.venue_name,
  city = excluded.city,
  ticket_price = excluded.ticket_price,
  currency = excluded.currency,
  capacity = excluded.capacity,
  status = excluded.status;
