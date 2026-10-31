import { assignVenueToEvent } from "@/app/(admin)/admin/actions";
import SeatPlanEditor from "@/components/admin/seat-plan-editor";
import { requireFeatureEnabled } from "@/lib/features";
import { getOrganizationAdminContext } from "@/lib/admin-data";
import { hasMinimumPlan } from "@/lib/account-plan";
import Link from "next/link";
import WorkspacePage from "@/components/workspace-page";

export const metadata = { title: "Venues and seating | KURO" };

export default async function AdminVenuesPage({ searchParams }) {
  await requireFeatureEnabled("admin-venues");
  await requireFeatureEnabled("seating-plans");
  const params = await searchParams;
  const context = await getOrganizationAdminContext(params?.organization_id || null);
  if (!hasMinimumPlan(context.planTier, "pro")) {
    return (
      <WorkspacePage description="Seating plans are included with Pro and Business account plans." title="Venues">
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-950">
          <h2 className="font-semibold">Upgrade to use seating plans</h2>
          <p className="mt-1">Your Free plan can create standard events. Pro and Business unlock venue seating plans.</p>
          <Link className="mt-4 inline-flex rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white" href="/account-plan">View account plans</Link>
        </section>
      </WorkspacePage>
    );
  }
  const supabase = context.supabase;
  const now = new Date().toISOString();
  const [
    { data: venues, error: venuesError },
    { data: events, error: eventsError },
  ] = await Promise.all([
    supabase.from("venues").select("id, organization_id, name, seat_plan").order("name"),
    supabase.from("events").select("id, organization_id, title, start_date, status, venue_id").gte("start_date", now).order("start_date"),
  ]);

  if (venuesError) throw new Error(`Unable to load venue seat plans: ${venuesError.message}`, { cause: venuesError });
  if (eventsError) throw new Error(`Unable to load organization events: ${eventsError.message}`, { cause: eventsError });

  const ownedOrganizations = context.organizations || [];
  const savedVenues = venues || [];
  const upcomingEvents = events || [];

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d6533d]">Organization admin</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Venues and seating</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Build a venue seat plan and assign it to an event. Attendees can choose seats that are enabled and not already reserved.
        </p>
      </header>

      {!ownedOrganizations.length ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <h2 className="font-bold">No organization is linked to this admin account</h2>
          <p className="mt-1">
            An organization owner must be assigned to your admin profile before you can create venue plans. Contact your platform administrator to link your organization.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-slate-900">Create a venue seat plan</h2>
            <p className="mt-1 text-sm text-slate-500">Choose the row and seat counts, then select any seats that should be unavailable.</p>
            <div className="mt-5 max-w-4xl">
              <SeatPlanEditor organizationId={ownedOrganizations[0].id} organizations={ownedOrganizations} />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Saved venue plans</h2>
              <p className="mt-1 text-sm text-slate-500">Update a plan here, then assign it to one of your upcoming events.</p>
            </div>
            {savedVenues.length ? (
              <div className="space-y-5">
                {savedVenues.map((venue) => {
                  const organization = ownedOrganizations.find((item) => item.id === venue.organization_id);
                  const totalSeats = (venue.seat_plan?.rows || []).reduce((total, row) => total + (row.seats || []).length, 0);
                  const enabledSeats = (venue.seat_plan?.rows || []).reduce((total, row) => total + (row.seats || []).filter((seat) => seat.enabled).length, 0);
                  return (
                    <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" key={venue.id}>
                      <summary className="cursor-pointer list-none">
                        <span className="font-bold text-slate-900">{venue.name}</span>
                        <span className="ml-2 text-sm text-slate-500">{organization?.name} · {enabledSeats} of {totalSeats} seats available</span>
                      </summary>
                      <div className="mt-5 max-w-4xl">
                        <SeatPlanEditor organizationId={venue.organization_id} venue={venue} />
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
                No venue plans created yet.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Assign plans to events</h2>
              <p className="mt-1 text-sm text-slate-500">Events must use a venue from the same organization as their event owner.</p>
            </div>
            {upcomingEvents.length ? (
              <div className="space-y-3">
                {upcomingEvents.map((event) => {
                  const eventVenues = savedVenues.filter((venue) => venue.organization_id === event.organization_id);
                  return (
                    <form action={assignVenueToEvent} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)_auto] sm:items-end" key={event.id}>
                      <input name="event_id" type="hidden" value={event.id} />
                      <div>
                        <p className="font-semibold text-slate-900">{event.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(event.start_date))}
                          {" · "}{event.status.replaceAll("_", " ")}
                        </p>
                      </div>
                      <label className="grid gap-1 text-xs font-bold text-slate-600">
                        Venue seat plan
                        <select className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal" defaultValue={event.venue_id || ""} name="venue_id">
                          <option value="">No assigned seat plan</option>
                          {eventVenues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                        </select>
                      </label>
                      <button className="rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#245c55]" type="submit">Save assignment</button>
                    </form>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
                No upcoming events are available to assign a venue to.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
