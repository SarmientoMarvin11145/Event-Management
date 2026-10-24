import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getAttendeeSession, getFirstName, eventFromRelation, throwOnSupabaseError } from "@/lib/attendee-data";
import { isFeatureEnabled } from "@/lib/features";
import { EmptyState, EventCard, Panel, PortalHeading, StatCard, StatusMessage } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Dashboard | KURO" };

export default async function DashboardPage() {
  if (!(await isFeatureEnabled("user-dashboard"))) {
    return (
      <div className="space-y-6">
        <PortalHeading title="Dashboard unavailable" description="This feature is currently disabled by the platform team." />
        <Panel><p className="text-sm leading-6 text-[#61736e]">Your dashboard is turned off. Contact KURO support if you need access.</p></Panel>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <PortalHeading title="Your dashboard" description="Your upcoming events, tickets, and attendee activity at a glance." />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  await connection();
  const { supabase, user } = await getAttendeeSession();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [profileResult, registrationsResult, attendanceResult, certificatesResult, eventsResult, notificationsResult, applicationsResult] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, interests, role").eq("id", user.id).maybeSingle(),
    supabase.from("registrations").select("id, status, registration_code, created_at, events(id, title, slug, venue_id, start_date, end_date, venue_name, city, banner_url, status, ticket_price, currency, registration_opens_at, registration_deadline, organizations(name, logo_url))").eq("attendee_id", user.id).order("created_at", { ascending: false }),
    supabase.from("attendance_logs").select("id, registrations!inner(attendee_id)").eq("registrations.attendee_id", user.id),
    supabase.from("certificates").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("events").select("id, title, slug, venue_id, start_date, end_date, registration_opens_at, registration_deadline, ticket_price, currency, venue_name, city, banner_url, status, organizations(name, logo_url)").eq("status", "published").gte("start_date", now.toISOString()).order("start_date").limit(8),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
    supabase.from("organizer_applications").select("id, organization_name, status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
  ]);
  for (const result of [profileResult, registrationsResult, attendanceResult, certificatesResult, eventsResult, notificationsResult, applicationsResult]) {
    throwOnSupabaseError(result.error);
  }

  const registrations = registrationsResult.data || [];
  const activeRegistrations = registrations.filter((item) => ["confirmed", "pending", "waitlisted", "invited"].includes(item.status));
  const upcomingRegistrations = activeRegistrations
    .filter((item) => {
      const event = eventFromRelation(item.events);
      return event && new Date(event.start_date) >= now;
    })
    .sort((a, b) => new Date(eventFromRelation(a.events).start_date) - new Date(eventFromRelation(b.events).start_date));
  const upcoming = upcomingRegistrations.slice(0, 3);
  const ticketCount = registrations.filter((item) => item.status === "confirmed").length;
  const upcomingThisWeek = activeRegistrations.filter((item) => {
    const event = eventFromRelation(item.events);
    return event && new Date(event.start_date) >= now && new Date(event.start_date) <= weekAhead;
  }).length;
  const attendedEvents = attendanceResult.data?.length || 0;
  const registeredIds = new Set(registrations.map((item) => eventFromRelation(item.events)?.id).filter(Boolean));
  const recommendations = (eventsResult.data || []).filter((event) => !registeredIds.has(event.id)).slice(0, 3);
  const application = applicationsResult.data?.[0];
  const firstName = getFirstName(profileResult.data?.full_name, user.email);
  const hour = Number(new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hourCycle: "h23",
  }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const checklist = [
    ["Create your account", true, "/profile"],
    ["Complete your profile", Boolean(profileResult.data?.full_name && profileResult.data?.phone), "/profile"],
    ["Choose your interests", Boolean(profileResult.data?.interests?.length), "/profile"],
    ["Register for your first event", activeRegistrations.length > 0, "/events"],
  ];
  const completedSteps = checklist.filter(([, complete]) => complete).length;

  return (
    <>
      <PortalHeading eyebrow="Your attendee workspace" title={`${greeting}, ${firstName}`} description={`You have ${upcomingThisWeek} upcoming ${upcomingThisWeek === 1 ? "event" : "events"} this week. Here's what's happening with your KURO account.`} />
      {["admin", "superadmin"].includes(profileResult.data?.role) && (
        <StatusMessage>You also have platform access. <Link className="font-bold underline" href={profileResult.data.role === "superadmin" ? "/superadmin/dashboard" : "/admin/dashboard"}>Open your admin workspace</Link></StatusMessage>
      )}
      {application?.status === "pending" && (
        <StatusMessage>Your application for {application.organization_name} is under review. <Link className="font-bold underline" href="/apply-organizer">View status</Link></StatusMessage>
      )}
      {(notificationsResult.count || 0) > 0 && (
        <StatusMessage>{notificationsResult.count} unread {notificationsResult.count === 1 ? "notification" : "notifications"}. <Link className="font-bold underline" href="/notifications">View alerts</Link></StatusMessage>
      )}
      <section aria-label="Attendee statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Upcoming events" value={upcomingRegistrations.length} detail="Your upcoming registrations" />
        <StatCard label="Tickets owned" value={ticketCount} detail="Confirmed registrations" />
        <StatCard label="Events attended" value={attendedEvents} detail="Recorded check-ins" />
        <StatCard label="Certificates earned" value={certificatesResult.count || 0} detail="Issued to your account" />
      </section>
      {completedSteps < checklist.length && (
        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">Getting started</p>
              <h2 className="mt-1 text-lg font-bold text-[#173d39]">Your attendee checklist</h2>
            </div>
            <p className="text-sm font-semibold text-[#61736e]">{completedSteps} of {checklist.length} complete</p>
          </div>
          <div aria-label={`${completedSteps} of ${checklist.length} setup tasks complete`} className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8eee7]" role="progressbar" aria-valuemax={checklist.length} aria-valuemin={0} aria-valuenow={completedSteps}>
            <div className="h-full rounded-full bg-[#ed6148]" style={{ width: `${(completedSteps / checklist.length) * 100}%` }} />
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {checklist.map(([label, complete, href]) => (
              <li key={label}>
                <Link className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-[#526864] hover:bg-[#f4f6f1]" href={href}>
                  <span aria-hidden="true" className={complete ? "font-bold text-emerald-700" : "text-[#9aa8a2]"}>{complete ? "✓" : "○"}</span>{label}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">What&apos;s next</p>
            <h2 className="mt-1 text-2xl font-bold text-[#173d39]">Upcoming events</h2>
          </div>
          <Link className="text-sm font-bold text-[#245c55] hover:text-[#d6533d]" href="/my-tickets">View tickets</Link>
        </div>
        {upcoming.length ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {upcoming.map((registration) => (
              <EventCard event={registration.events} key={registration.id} registration={registration} />
            ))}
          </div>
        ) : (
          <EmptyState title="Your next event starts here" description="You don't have any upcoming registrations. Browse public events and save or register for the ones that interest you." />
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">Discover</p>
              <h2 className="mt-1 text-xl font-bold text-[#173d39]">Upcoming public events</h2>
            </div>
            <Link className="text-sm font-bold text-[#245c55]" href="/events">Browse all</Link>
          </div>
          {recommendations.length ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {recommendations.map((event) => <EventCard event={event} key={event.id} />)}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[#61736e]">There are no other published events to suggest right now. Event suggestions are based on available public listings; personalized recommendations are not active yet.</p>
          )}
        </Panel>
        <Panel>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">Quick actions</p>
          <h2 className="mt-1 text-xl font-bold text-[#173d39]">Your shortcuts</h2>
          <div className="mt-4 grid gap-2">
            {[
              ["/my-tickets", "View my tickets", "my-tickets"],
              ["/events", "Browse events", "event-discovery"],
              ["/certificates", "My certificates", "certificates"],
              ["/profile", "Edit profile", "user-profile"],
              ["/apply-organizer", "Apply as organizer", "organizer-applications"],
            ].map(([href, label]) => (
              <Link className="rounded-md border border-[#dce4dc] px-4 py-3 text-sm font-semibold text-[#245c55] hover:bg-[#f4f6f1]" href={href} key={href}>{label} <span aria-hidden="true">→</span></Link>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[#173d39]">Recent activity</h2>
            <Link className="text-sm font-bold text-[#245c55]" href="/history">View history</Link>
          </div>
          {registrations.length ? (
            <ul className="mt-4 divide-y divide-[#e8eee7]">
              {registrations.slice(0, 4).map((registration) => (
                <li className="py-3" key={registration.id}>
                  <p className="text-sm font-semibold text-[#173d39]">
                    {registration.status === "confirmed" ? "Registered for" : `Registration ${registration.status} for`} {eventFromRelation(registration.events)?.title || "an event"}
                  </p>
                  <p className="mt-1 text-xs text-[#7a8b84]">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(registration.created_at))}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[#61736e]">Your event registrations and attendance activity will appear here.</p>
          )}
        </Panel>
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[#173d39]">Announcements</h2>
            <Link className="text-sm font-bold text-[#245c55]" href="/notifications">All alerts</Link>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#61736e]">You’ll find event updates and account alerts here when they’re sent to your account.</p>
          <Link className="mt-4 inline-flex text-sm font-bold text-[#245c55]" href="/notifications">Open notifications →</Link>
        </Panel>
      </section>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <section aria-label="Loading your dashboard" aria-live="polite" className="space-y-6" role="status">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["Upcoming events", "Tickets owned", "Events attended", "Certificates earned"].map((label) => (
          <div className="kuro-panel rounded-md border border-[#dce4dc] bg-white p-5" key={label}>
            <p className="text-sm font-semibold text-[#61736e]">{label}</p>
            <div aria-hidden="true" className="mt-3 h-8 w-16 animate-pulse rounded bg-[#e8eee7]" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div aria-hidden="true" className="kuro-panel rounded-md border border-[#dce4dc] bg-white p-5" key={item}>
            <div className="h-28 animate-pulse rounded bg-[#e8eee7]" />
            <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-[#e8eee7]" />
            <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-[#e8eee7]" />
          </div>
        ))}
      </div>
      <p className="text-sm text-[#61736e]">Loading your attendee activity…</p>
    </section>
  );
}
