import { getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { EmptyState, EventCard, PortalHeading } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Saved events | KURO" };

export default async function FavoritesPage() {
  await requireFeatureEnabled("favorites");
  const { supabase, user } = await getAttendeeSession();
  const { data, error } = await supabase.from("favorites").select("id, created_at, events(id, title, slug, venue_id, start_date, venue_name, city, banner_url, status, ticket_price, currency, registration_opens_at, registration_deadline, organizations(name, logo_url))").eq("user_id", user.id).order("created_at", { ascending: false });
  throwOnSupabaseError(error);
  const favorites = (data || []).filter((favorite) => favorite.events);

  return (
    <div className="space-y-6">
      <PortalHeading title="Saved events" description="Events you bookmarked for later. Remove an event or register when registration is available." />
      {favorites.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {favorites.map((favorite) => <EventCard event={favorite.events} favorite key={favorite.id} />)}
        </div>
      ) : (
        <EmptyState title="No saved events" description="Browse public events and save the ones you may want to attend." />
      )}
    </div>
  );
}
