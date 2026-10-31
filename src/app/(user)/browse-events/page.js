import Link from "next/link";
import { getAttendeeSession, organizationFromRelation, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { EventCard, Panel, PortalHeading } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Browse events | KURO" };

export default async function BrowseEventsPage({ searchParams }) {
  await requireFeatureEnabled("event-discovery");
  const { q } = await searchParams;
  const initialQuery = (Array.isArray(q) ? q[0] : q || "").trim();
  const { supabase } = await getAttendeeSession();
  const now = new Date();
  const nowIso = now.toISOString();
  const latestStartWhenEndIsMissing = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { data: events, error } = await supabase
    .from("events")
    .select(
      "id, title, slug, description, banner_url, start_date, end_date, venue_name, city, ticket_price, currency, venue_id, registration_opens_at, registration_deadline, organizations(name, logo_url)",
    )
    .eq("status", "published")
    .or(`registration_deadline.is.null,registration_deadline.gte.${nowIso},end_date.gte.${nowIso},and(end_date.is.null,start_date.gte.${latestStartWhenEndIsMissing})`)
    .order("start_date", { ascending: true })
    .limit(100);
  throwOnSupabaseError(error);

  const normalizedQuery = initialQuery.toLowerCase();
  const visibleEvents = (events || []).filter((event) => {
    if (!normalizedQuery) return true;
    const organization = organizationFromRelation(event.organizations);
    const searchText = `${event.title} ${event.city || ""} ${event.venue_name || ""} ${organization?.name || ""}`.toLowerCase();
    return searchText.includes(normalizedQuery);
  });

  return (
    <div className="space-y-8">
      <PortalHeading
        eyebrow="Your attendee workspace"
        title="Browse events"
        description="Find upcoming public events and manage registrations and saved events from your KURO workspace."
        action={
          <form action="/browse-events" className="flex w-full max-w-sm" role="search">
            <label className="sr-only" htmlFor="browse-events-search">Search events</label>
            <input
              className="min-w-0 flex-1 rounded-l-md border border-[#cbd8d1] bg-white px-3 py-2.5 text-sm"
              defaultValue={initialQuery}
              id="browse-events-search"
              name="q"
              placeholder="Search by event, city, or venue"
              type="search"
            />
            <button className="rounded-r-md bg-[#173d39] px-4 text-sm font-bold text-white" type="submit">Search</button>
          </form>
        }
      />
      {visibleEvents.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleEvents.map((event) => <EventCard event={event} key={event.id} />)}
        </div>
      ) : (
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">
            {initialQuery ? "No events match your search" : "No upcoming events right now"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#61736e]">
            {initialQuery
              ? "Try another event name, city, or venue."
              : "Published events will appear here when they are available."}
          </p>
          <Link className="mt-4 inline-flex text-sm font-bold text-[#245c55] hover:text-[#d6533d]" href="/dashboard">
            Return to your dashboard <span aria-hidden="true" className="ml-1">→</span>
          </Link>
        </Panel>
      )}
    </div>
  );
}
