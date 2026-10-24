import { eventFromRelation, getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { EmptyState, EventCard, Panel, PortalHeading } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "My events | KURO" };

export default async function MyEventsPage() {
  await requireFeatureEnabled("my-events");
  const { supabase, user } = await getAttendeeSession();
  const [{ data: registrations, error }, { data: favorites, error: favoritesError }] = await Promise.all([
    supabase.from("registrations").select("id, status, events(id, title, start_date, end_date, venue_name, city, banner_url, status, organizations(name, logo_url))").eq("attendee_id", user.id).order("created_at", { ascending: false }),
    supabase.from("favorites").select("id, events(id, title, start_date, venue_name, city, banner_url, status, organizations(name, logo_url))").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  throwOnSupabaseError(error);
  throwOnSupabaseError(favoritesError);

  const attending = (registrations || []).filter((row) => row.status === "confirmed" && new Date(eventFromRelation(row.events)?.start_date || 0) >= new Date());
  const waitlisted = (registrations || []).filter((row) => row.status === "waitlisted");
  const invited = (registrations || []).filter((row) => row.status === "invited");
  const saved = favorites || [];

  return (
    <div className="space-y-8">
      <PortalHeading title="My events" description="A combined view of events you’re attending, waiting for, invited to, or have saved." />
      <EventGroup title="Attending" events={attending} empty="Confirmed upcoming registrations will appear here." />
      <EventGroup title="Invited" events={invited} empty="Event invitations will appear here when an organizer invites you." />
      <EventGroup title="Waitlisted" events={waitlisted} empty="Events where you are waitlisted will appear here." />
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-[#173d39]">Interested</h2>
          <p className="mt-1 text-sm text-[#61736e]">Events you saved for later.</p>
        </div>
        {saved.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{saved.map((item) => <EventCard event={item.events} favorite key={item.id} />)}</div> : <EmptyState title="Nothing saved yet" description="Save public events to keep them in your personal list." href="/events" />}
      </section>
    </div>
  );
}

function EventGroup({ title, events, empty }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-[#173d39]">{title}</h2>
      {events.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((item) => <EventCard event={item.events} key={item.id} registration={item} />)}
        </div>
      ) : (
        <Panel><p className="text-sm text-[#61736e]">{empty}</p></Panel>
      )}
    </section>
  );
}
