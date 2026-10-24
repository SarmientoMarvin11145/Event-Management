This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Authentication setup

Authentication uses Supabase email/password auth with cookie-based sessions.
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
`.env.local`. Do not use a Supabase service-role key in the browser.

In your Supabase project:

1. Enable email confirmations under **Authentication → Providers → Email**.
2. Set the site URL to your app's origin, such as `http://localhost:3000`.
3. Add each app origin's `/auth/callback` URL to the allowed redirect URLs. For
   local development, add `http://localhost:3000/auth/callback`; add the
   production URL when deploying.

The app provides `/login`, `/register`, `/forgot-password`, and
`/reset-password`. Email verification and password reset links return through
`/auth/callback`. After sign-in, users are directed to `/dashboard`, admins to
`/admin/dashboard`, and superadmins to `/superadmin/dashboard` based on
`profiles.role`.

The profile table and signup trigger are defined in
[`supabase/migrations/20261015150600_create_profiles.sql`](./supabase/migrations/20261015150600_create_profiles.sql).
Run the migration in the Supabase SQL Editor, or apply it with
`npx supabase db push` after initializing and linking the Supabase CLI. It
creates a profile row for new users and backfills existing users; row-level
security restricts profile access to the owning user.

## Public site and event listings

The guest landing page uses KURO branding and reads public events from Supabase.
Apply `supabase/migrations/20261015150800_create_public_events.sql` after the
profile and role migrations. It creates organizations and events with row-level
security; published events remain visible while registration has not closed or
the event has not ended. Events without an end time are treated as ending one
hour after their start. Apply
`supabase/migrations/20261024210000_include_active_public_events.sql` to update
public event visibility in existing Supabase projects. The
`20261024200000_add_paymongo_test_event.sql` migration adds one published
PayMongo test webinar so it appears in the welcome-page event feed after
`supabase db push`.
Apply `supabase/migrations/20261024220000_allow_favorites_for_active_events.sql`
to allow attendees to save events while registration remains open or the event
has not ended.

The feature, AI, integrations, pricing, and resource sections are product
previews. PayMongo test-mode checkout is available for paid event tickets and
organization plans; live payments are not enabled.

Apply `supabase/migrations/20261016100000_record_policy_consent.sql` after the
profile migration to store the Terms and Privacy policy versions and acceptance
timestamps on newly created profiles. The linked policies are preview drafts;
have them reviewed and finalized by the KURO operator and legal counsel before
production signup.

## Route areas and roles

Route groups keep public URLs stable while organizing landing and event pages,
authentication, user pages, organization administration, and platform
administration. Organization-admin pages use organization-scoped live records;
they do not seed demo metrics or attendees. Access checks run in the protected
server layouts and database functions; `src/proxy.js` refreshes Supabase sessions.

Apply `supabase/migrations/20261015150700_add_profile_roles.sql` after the
profile migration. New accounts receive the `user` role. To grant administrative
access, update a profile's role from a trusted Supabase SQL session; role changes
are intentionally not available through the user-facing profile API. Allowed
roles are `user`, `admin`, and `superadmin`.

## Attendee workspace

Apply `supabase/migrations/20261016110000_create_attendee_portal.sql` after the
profile, role, policy-consent, and public-event migrations. It extends attendee
profiles and creates owner-scoped registrations, attendance, certificates,
favorites, notifications, reviews, settings, support requests, and organizer
applications. It also adds the public, limited-field certificate verification
function. Row-level security restricts attendee records to their owner.

The attendee workspace includes a data-backed dashboard, profile and settings
forms, free-event registration and cancellation, tickets, event history and CSV
export, certificates, favorites, notifications, support requests, and organizer
applications. PayMongo test checkout can issue one ticket per attendee and event;
seat selection and multi-ticket orders are not implemented. QR scanning, ticket PDFs and wallet passes,
outbound notification delivery, organizer approval, direct messaging, and
attendee-to-organizer certificate issuance require workflows or integrations
that are not part of this preview. The app reports these limitations rather
than presenting them as completed actions.

## PayMongo test checkout

Paid checkout is restricted to PayMongo test keys. Add these server-side values
to `.env.local` (never use a `NEXT_PUBLIC_` prefix for either secret):

```dotenv
PAYMONGO_SECRET_KEY=sk_test_replace_with_your_test_secret
PAYMONGO_WEBHOOK_SECRET=replace_with_your_webhook_signing_secret
SUPABASE_SERVICE_ROLE_KEY=replace_with_your_rotated_server_secret
```

Get the PayMongo test secret from the PayMongo Dashboard's test mode and create
a webhook for `checkout_session.payment.paid` pointing to
`https://<your-public-app-host>/api/payments/webhook`. Copy that endpoint's
signing secret to `PAYMONGO_WEBHOOK_SECRET`. PayMongo must be able to reach the
webhook over HTTPS; for local testing, use a secure public tunnel or a deployed
test environment. Payment status is confirmed by the signed webhook, not by
returning from the checkout page.

Use a newly rotated Supabase service-role secret from the Supabase project API
settings for `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses row-level security
and must stay server-only. After changing `.env.local`, restart the dev server.
Apply `20261024190000_add_paymongo_payments.sql` and
`20261024200000_add_paymongo_test_event.sql` after the attendee and organization
admin migrations. The second migration adds the sample test event.

## Superadmin console

Apply `supabase/migrations/20261016130000_create_superadmin_console.sql` after
the attendee-portal migration and refresh the Supabase API schema cache. The
console is available at `/superadmin` and includes role-protected organization,
application, user, event, support, analytics, broadcast, audit, settings,
feature-flag, content, and task screens. The migration adds superadmin-only
row-level security policies and guarded database functions; do not grant
superadmin roles to untrusted accounts.

Organizer approval creates an organization, assigns its owner, promotes the
applicant to admin, and adds an in-app notification. User role changes cannot
create additional superadmins or modify the current superadmin account.
Suspended/banned accounts are blocked from protected pages and app server
actions. Organization suspension hides its events from public event listings.

Plan labels, feature flags, platform settings, content, and in-app broadcasts
are stored by KURO, but are not a substitute for the respective runtime
integrations. The payment ledger records PayMongo test transactions only; live
payments, refunds, payouts, and automated subscription renewals are unavailable.
There is no outbound email/SMS provider, impersonation, forced logout, IP firewall, uptime
telemetry, backup control, or job queue in this project. The console marks
these capabilities unavailable rather than fabricating status or financial
metrics. Published content is saved but is not yet wired into the public site;
maintenance mode and feature flags likewise require explicit runtime gates
before they affect other routes.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
