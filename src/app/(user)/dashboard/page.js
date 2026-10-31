import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getAttendeeSession, getFirstName, eventFromRelation, throwOnSupabaseError } from "@/lib/attendee-data";
import { isFeatureEnabled } from "@/lib/features";
import { isEventRegistrationAvailable } from "@/lib/event-registration";
import { addFavorite } from "@/app/(user)/actions";
import { EmptyState, EventCard, Panel, PortalHeading, StatusMessage } from "@/components/user/portal-ui";

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
    <div className="space-y-6 sm:space-y-8">
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
  const [profileResult, registrationsResult, eventsResult, applicationsResult] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, interests, role").eq("id", user.id).maybeSingle(),
    supabase.from("registrations").select("id, status, events(id, title, slug, venue_id, start_date, end_date, venue_name, city, banner_url, status, ticket_price, currency, registration_opens_at, registration_deadline, organizations(name, logo_url))").eq("attendee_id", user.id).order("created_at", { ascending: false }),
    supabase.from("events").select("id, title, slug, category, venue_id, start_date, end_date, registration_opens_at, registration_deadline, ticket_price, currency, venue_name, city, banner_url, status, organizations(name, logo_url)").eq("status", "published").gte("start_date", now.toISOString()).order("start_date").limit(8),
    supabase.from("organizer_applications").select("id, organization_name, status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
  ]);
  for (const result of [profileResult, registrationsResult, eventsResult, applicationsResult]) {
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
  const upcomingThisWeek = activeRegistrations.filter((item) => {
    const event = eventFromRelation(item.events);
    return event && new Date(event.start_date) >= now && new Date(event.start_date) <= weekAhead;
  }).length;
  const registeredIds = new Set(registrations.map((item) => eventFromRelation(item.events)?.id).filter(Boolean));
  const recommendations = (eventsResult.data || []).filter((event) => !registeredIds.has(event.id)).slice(0, 3);
  const availableCategories = [...new Set((eventsResult.data || []).map((event) => event.category).filter(Boolean))];
  const categoryValues = (availableCategories.length
    ? availableCategories
    : ["academic", "technology", "sports", "entertainment", "workshop", "community"]).slice(0, 8);
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
    ["Register for your first event", activeRegistrations.length > 0, "/browse-events"],
  ];
  const completedSteps = checklist.filter(([, complete]) => complete).length;

  return (
    <>
      <PortalHeading
        eyebrow="Your KURO workspace"
        title={`${greeting}, ${firstName}`}
        description={`You have ${upcomingThisWeek} upcoming ${upcomingThisWeek === 1 ? "event" : "events"} this week. Find something new or pick up where you left off.`}
        action={<Link className="hidden rounded-xl bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#245c55] sm:inline-flex" href="/my-tickets">My tickets <span aria-hidden="true" className="ml-2">→</span></Link>}
      />
      <form action="/browse-events" className="flex rounded-xl border border-[#d6dfd8] bg-white p-1 shadow-sm md:hidden" role="search">
        <label className="sr-only" htmlFor="dashboard-event-search">Search events</label>
        <span aria-hidden="true" className="flex items-center pl-3 text-[#82918b]">⌕</span>
        <input className="kuro-input min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-[#173d39] outline-none placeholder:text-[#87958f]" id="dashboard-event-search" name="q" placeholder="Search events, cities, venues..." type="search" />
        <button className="rounded-lg bg-[#173d39] px-4 py-2 text-sm font-bold text-white" type="submit">Search</button>
      </form>
      <section aria-label="Explore event categories" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#d6533d]">Find your next plan</p>
            <h2 className="mt-1 text-lg font-black text-[#173d39] sm:text-xl">Explore categories</h2>
          </div>
          <Link className="text-xs font-bold text-[#245c55] hover:text-[#d6533d]" href="/events">All events <span aria-hidden="true">→</span></Link>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible lg:grid-cols-6">
          {categoryValues.map((category) => (
            <Link className="group flex min-w-20 shrink-0 flex-col items-center gap-2 rounded-2xl border border-[#e2e8e1] bg-white px-3 py-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#b8ccc0] hover:shadow-md sm:min-w-0 sm:py-4" href={`/events?category=${encodeURIComponent(category)}`} key={category}>
              <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-[#edf2e9] text-xl text-[#245c55] transition group-hover:bg-[#dfeade]">{categoryIcon(category)}</span>
              <span className="text-[11px] font-bold capitalize leading-tight text-[#526864]">{category.replaceAll("_", " ")}</span>
            </Link>
          ))}
        </div>
      </section>
      <section aria-label="Featured public event" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#d6533d]">Handpicked for you</p>
            <h2 className="mt-1 text-lg font-black text-[#173d39] sm:text-xl">Featured event</h2>
          </div>
          <Link className="text-xs font-bold text-[#245c55] hover:text-[#d6533d]" href="/events">See all <span aria-hidden="true">→</span></Link>
        </div>
        {recommendations.length ? (
          <FeaturedDashboardEvent event={recommendations[0]} now={now.getTime()} />
        ) : (
          <div className="rounded-2xl border border-dashed border-[#cbd8d1] bg-white px-5 py-7 text-center shadow-sm">
            <p className="text-sm font-bold text-[#173d39]">Your next event starts here.</p>
            <p className="mt-1 text-xs leading-5 text-[#61736e]">Browse KURO to discover upcoming events and find your next experience.</p>
            <Link className="mt-4 inline-flex rounded-xl bg-[#ed6148] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#d74d37]" href="/events">Explore events</Link>
          </div>
        )}
      </section>
      {application?.status === "pending" && !["admin", "superadmin"].includes(profileResult.data?.role) && (
        <StatusMessage>Your application for {application.organization_name} is under review. <Link className="font-bold underline" href="/apply-organizer">View status</Link></StatusMessage>
      )}
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

      <section aria-label="More public events" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">Discover</p>
            <h2 className="mt-1 text-xl font-black text-[#173d39]">More events to explore</h2>
          </div>
          <Link className="text-sm font-bold text-[#245c55] hover:text-[#d6533d]" href="/browse-events">Browse all <span aria-hidden="true">→</span></Link>
        </div>
        {recommendations.length > 1 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.slice(1).map((event) => <EventCard event={event} key={event.id} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#cbd8d1] bg-white px-5 py-6 text-center shadow-sm">
            <p className="text-sm leading-6 text-[#61736e]">{recommendations.length ? "That’s the featured event for now. Browse all public events to find more listings." : "There are no other published events to suggest right now. Event suggestions are based on available public listings; personalized recommendations are not active yet."}</p>
          </div>
        )}
      </section>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <section aria-label="Loading your dashboard" aria-live="polite" className="space-y-6" role="status">
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div aria-hidden="true" className="kuro-panel rounded-2xl border border-[#dce4dc] bg-white p-5 shadow-sm" key={item}>
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

function FeaturedDashboardEvent({ event, now }) {
  const startTime = new Date(event.start_date).getTime();
  const endTime = new Date(event.end_date || startTime + 60 * 60 * 1000).getTime();
  const canRegister = event.status === "published"
    && isEventRegistrationAvailable(event, now)
    && Number.isFinite(endTime)
    && endTime >= now
    && Boolean(event.slug);
  const dateLabel = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(event.start_date));
  const location = [event.venue_name, event.city].filter(Boolean).join(", ") || "Location to be announced";

  return (
    <article className="group relative isolate min-h-56 overflow-hidden rounded-2xl bg-[#245c55] shadow-sm sm:min-h-72">
      {event.banner_url ? (
        <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105" style={{ backgroundImage: `url("${event.banner_url}")` }} />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-[#245c55] via-[#173d39] to-[#d6533d]" />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#102d2a]/95 via-[#102d2a]/45 to-transparent" />
      <div className="relative flex min-h-56 flex-col justify-end p-5 text-white sm:min-h-72 sm:p-7">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ffd0c5]">KURO pick · {event.category?.replaceAll("_", " ") || "Upcoming"}</p>
        <h3 className="mt-2 max-w-2xl text-xl font-black leading-tight sm:text-3xl">
          {event.slug ? <Link className="hover:underline" href={`/e/${event.slug}`}>{event.title}</Link> : event.title}
        </h3>
        <p className="mt-2 text-xs text-white/85 sm:text-sm">{dateLabel} <span aria-hidden="true">·</span> {location}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canRegister ? (
            <Link className="inline-flex items-center gap-2 rounded-xl bg-[#ed6148] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#d74d37]" href={`/e/${event.slug}/register`}>
              Register now <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <span className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-bold text-white">Registration unavailable</span>
          )}
          <form action={addFavorite}>
            <input name="event_id" type="hidden" value={event.id} />
            <button className="rounded-xl border border-white/35 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20" type="submit">Save event</button>
          </form>
        </div>
      </div>
    </article>
  );
}

function categoryIcon(category) {
  const icons = {
    academic: "🎓",
    technology: "💻",
    sports: "⚽",
    entertainment: "🎵",
    conference: "🎤",
    workshop: "🛠️",
    seminar: "📚",
    competition: "🏆",
    community: "🤝",
    other: "✦",
  };
  return icons[category.toLowerCase()] || "✦";
}
