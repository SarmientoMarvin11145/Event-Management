import Link from "next/link";
import OrganizationPicker from "@/components/admin/organization-picker";
import WorkspacePage from "@/components/workspace-page";
import { changeAdminEventStatus } from "@/app/(admin)/admin/actions";
import { requireFeatureEnabled } from "@/lib/features";
import { getOrganizationAdminContext } from "@/lib/admin-data";

const statuses = ["draft", "published", "cancelled"];

export const instant = false;

export default async function AdminEventsPage({ searchParams }) {
  await requireFeatureEnabled("admin-events");
  const params = await searchParams;
  const context = await getOrganizationAdminContext(params?.organization_id || null);
  if (!context.organization) {
    return <WorkspacePage description="Create and manage organization events." title="Manage events" />;
  }

  let query = context.supabase
    .from("events")
    .select("id, title, slug, start_date, end_date, status, venue_name, ticket_price, currency, capacity")
    .eq("organization_id", context.organization.id);
  if (statuses.includes(params?.status)) query = query.eq("status", params.status);
  const search = String(params?.q || "").trim();
  if (search.length > 100) throw new Error("Event search must be 100 characters or fewer.");
  if (search) query = query.ilike("title", `%${search.replace(/[%_,]/g, " ")}%`);
  const { data: eventRows, error } = await query.order("start_date", { ascending: false }).limit(250);
  if (error) throw new Error(`Unable to load organization events: ${error.message}`, { cause: error });

  let allowedEventIds = null;
  if (!context.canManageOrganization && context.membership?.role === "event_manager") {
    const { data: assignments, error: assignmentError } = await context.supabase
      .from("organization_member_events")
      .select("event_id")
      .eq("membership_id", context.membership.membership_id);
    if (assignmentError) throw new Error(`Unable to load event assignments: ${assignmentError.message}`, { cause: assignmentError });
    allowedEventIds = new Set((assignments || []).map(({ event_id }) => event_id));
  }
  const events = (eventRows || []).filter((event) => !allowedEventIds || allowedEventIds.has(event.id));

  return (
    <WorkspacePage description={`Manage the events connected to ${context.organization.name}.`} title="Manage events">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <OrganizationPicker organizations={context.organizations} pathname="/admin/events" selectedOrganizationId={context.organization.id} />
        {context.canManageOrganization && (
          <Link className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700" href={`/admin/events/new?organization_id=${context.organization.id}`}>
            Create event
          </Link>
        )}
      </div>
      <form action="/admin/events" className="mb-5 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input name="organization_id" type="hidden" value={context.organization.id} />
        <label className="sr-only" htmlFor="admin-event-search">Search event titles</label>
        <input className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" defaultValue={search} id="admin-event-search" name="q" placeholder="Search event titles" />
        <label className="sr-only" htmlFor="admin-event-status">Filter by event status</label>
        <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" defaultValue={params?.status || ""} id="admin-event-status" name="status">
          <option value="">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
        </select>
        <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">Filter</button>
      </form>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {events.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Venue</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Manage</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((event) => {
                  const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: context.organization.timezone }).format(new Date(event.start_date));
                  const canManage = context.canManageOrganization || context.membership?.role === "event_manager";
                  return (
                    <tr key={event.id}>
                      <td className="px-4 py-4">
                        <Link className="font-semibold text-slate-900 hover:underline" href={`/admin/events/${event.id}`}>{event.title}</Link>
                        <p className="mt-1 text-xs text-slate-500">/{event.slug}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{date}</td>
                      <td className="px-4 py-4 text-slate-600">{event.venue_name || "Not specified"}</td>
                      <td className="px-4 py-4 text-slate-600">{Number(event.ticket_price) > 0 ? `${event.currency} ${Number(event.ticket_price).toFixed(2)}` : "Free"}</td>
                      <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{event.status}</span></td>
                      <td className="px-4 py-4">
                        {canManage ? (
                          <form action={changeAdminEventStatus} className="flex flex-wrap items-center gap-2">
                            <input name="event_id" type="hidden" value={event.id} />
                            <label className="sr-only" htmlFor={`status-${event.id}`}>Change status for {event.title}</label>
                            <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" defaultValue={event.status} id={`status-${event.id}`} name="status">
                              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                            <button className="text-xs font-semibold text-slate-700 underline" type="submit">Update</button>
                          </form>
                        ) : <span className="text-xs text-slate-500">View only</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            {eventRows?.length ? "No events match these filters or assignments." : "No events are connected to this organization yet."}
          </p>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">Showing up to 250 events. Paid tickets use PayMongo test checkout.</p>
    </WorkspacePage>
  );
}
