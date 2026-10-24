create or replace function public.sync_feature_flag_catalog()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  flag_keys text[] := array[
    'event-discovery',
    'event-registration',
    'notifications',
    'messaging',
    'support',
    'certificates',
    'reviews',
    'admin-overview',
    'admin-events',
    'admin-attendees',
    'admin-staff',
    'admin-venues',
    'admin-reports',
    'admin-settings',
    'user-dashboard',
    'my-tickets',
    'my-events',
    'event-history',
    'favorites',
    'organizer-applications',
    'user-profile',
    'user-settings',
    'ai-chatbot',
    'seating-plans',
    'booth-management',
    'facial-check-in',
    'payment-gateway',
    'offline-mode',
    'advanced-analytics'
  ];
  flag_labels jsonb := jsonb_build_object(
    'event-discovery', 'Event discovery',
    'event-registration', 'Event registration',
    'notifications', 'Notifications and alerts',
    'messaging', 'Messages and inbox',
    'support', 'Help and support',
    'certificates', 'Certificates',
    'reviews', 'Event reviews',
    'admin-overview', 'Admin overview',
    'admin-events', 'Admin event management',
    'admin-attendees', 'Admin attendees',
    'admin-staff', 'Admin staff',
    'admin-venues', 'Admin venues',
    'admin-reports', 'Admin reports',
    'admin-settings', 'Admin settings',
    'user-dashboard', 'User dashboard',
    'my-tickets', 'My tickets',
    'my-events', 'My events',
    'event-history', 'Event history',
    'favorites', 'Saved events',
    'organizer-applications', 'Organizer applications',
    'user-profile', 'User profile',
    'user-settings', 'User settings',
    'ai-chatbot', 'AI attendee support',
    'seating-plans', 'Seating plans',
    'booth-management', 'Booth management',
    'facial-check-in', 'Facial check-in',
    'payment-gateway', 'Paid checkout',
    'offline-mode', 'Offline mode',
    'advanced-analytics', 'Advanced analytics'
  );
  flag_descriptions jsonb := jsonb_build_object(
    'event-discovery', 'Public event browsing and search.',
    'event-registration', 'Users can register for published events.',
    'notifications', 'In-app notifications and broadcasts.',
    'messaging', 'User messages page and inbox link.',
    'support', 'Support requests and help pages.',
    'certificates', 'Certificates, CPD totals, and verification.',
    'reviews', 'Ratings and feedback on history.',
    'admin-overview', 'Organization admin overview dashboard.',
    'admin-events', 'Create and manage organization events.',
    'admin-attendees', 'View and manage event attendees.',
    'admin-staff', 'Manage organization staff access.',
    'admin-venues', 'Manage venues used by events.',
    'admin-reports', 'Attendance and event reports.',
    'admin-settings', 'Organization preferences.',
    'user-dashboard', 'Attendee home dashboard.',
    'my-tickets', 'Ticket lists and cancellation.',
    'my-events', 'Attending, invited, waitlisted, interested.',
    'event-history', 'Past registrations and CSV export.',
    'favorites', 'Bookmarking and saved lists.',
    'organizer-applications', 'Apply-as-organizer flow.',
    'user-profile', 'Editable attendee profile.',
    'user-settings', 'Notification and account settings.',
    'ai-chatbot', 'AI support not connected.',
    'seating-plans', 'Seating plan workflows.',
    'booth-management', 'Exhibitor and booth workflows.',
    'facial-check-in', 'Requires privacy review.',
    'payment-gateway', 'No payment provider connected.',
    'offline-mode', 'Offline event operations.',
    'advanced-analytics', 'Organization analytics.'
  );
  enabled_by_default text[] := array[
    'event-discovery',
    'event-registration',
    'notifications',
    'messaging',
    'support',
    'certificates',
    'reviews',
    'admin-overview',
    'admin-events',
    'admin-attendees',
    'admin-staff',
    'admin-venues',
    'admin-reports',
    'admin-settings',
    'user-dashboard',
    'my-tickets',
    'my-events',
    'event-history',
    'favorites',
    'organizer-applications',
    'user-profile',
    'user-settings',
    'seating-plans'
  ];
  flag_key text;
begin
  foreach flag_key in array flag_keys loop
    insert into public.feature_flags (flag_key, label, description, enabled)
    values (flag_key, flag_labels ->> flag_key, flag_descriptions ->> flag_key, flag_key = any(enabled_by_default))
    on conflict (flag_key) do update
      set label = excluded.label,
          description = excluded.description;
  end loop;
end;
$$;

select public.sync_feature_flag_catalog();
