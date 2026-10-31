import Link from "next/link";
import { notFound } from "next/navigation";
import EventForm from "@/components/admin/event-form";
import EventStatusForm from "@/components/admin/event-status-form";
import EventTicketPlanManager from "@/components/admin/event-ticket-plan-manager";
import OrganizationPicker from "@/components/admin/organization-picker";
import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";
import { getOrganizationAdminContext } from "@/lib/admin-data";

export default async function AdminEventDetailsPage({ params, searchParams }) {
  await requireFeatureEnabled("admin-events");
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const context = await getOrganizationAdminContext(query?.organization_id || null);
  if (!context.organization) notFound();
  const { data: event, error } = await context.supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load event details: ${error.message}`, { cause: error });
  if (!event) notFound();

  const [
    { data: canManageEvent, error: permissionError },
    { data: venues, error: venuesError },
    { data: meetingUrl, error: meetingError },
    { data: ticketPlans, error: ticketPlansError },
  ] = await Promise.all([
    context.supabase.rpc("can_manage_event", { p_event_id: event.id }),
    context.supabase.from("venues").select("id, name").eq("organization_id", event.organization_id).order("name"),
    context.supabase.rpc("admin_get_event_private_details", { p_event_id: event.id }),
    context.supabase.rpc("get_event_ticket_plans", { p_event_id: event.id }),
  ]);
  if (permissionError) throw new Error(`Unable to verify event permissions: ${permissionError.message}`, { cause: permissionError });
  if (venuesError) throw new Error(`Unable to load organization venues: ${venuesError.message}`, { cause: venuesError });
  if (meetingError) throw new Error(`Unable to load the private event link: ${meetingError.message}`, { cause: meetingError });
  if (ticketPlansError) throw new Error(`Unable to load event ticket plans: ${ticketPlansError.message}`, { cause: ticketPlansError });

  const { data: summary, error: attendeesError } = canManageEvent
    ? await context.supabase.rpc("admin_get_event_summary", { p_event_id: event.id })
    : { data: [], error: null };
  if (attendeesError) throw new Error(`Unable to load event registrations: ${attendeesError.message}`, { cause: attendeesError });
  const timezone = event.timezone || context.organization.timezone;

  return (
    <WorkspacePage description={`${context.organization.name} · ${event.status}`} title={event.title}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <OrganizationPicker organizations={context.organizations} pathname={`/admin/events/${event.id}`} selectedOrganizationId={context.organization.id} />
        <Link className="text-sm font-semibold text-slate-700 underline" href={`/admin/events?organization_id=${context.organization.id}`}>Back to events</Link>
      </div>
      {canManageEvent && <section className="mb-6 grid gap-3 sm:grid-cols-3">
        {[["Registrations", summary.registrations], ["Checked in", summary.checkedIn], ["Capacity", event.capacity || "Unlimited"]].map(([label, value]) => (
          <div className="rounded-xl border border-slate-200 bg-white p-4" key={label}>
            <p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{typeof value === "string" ? value : Number(value || 0).toLocaleString()}</p>
          </div>
        ))}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-3">
          <p className="text-sm font-semibold text-slate-900">Event date and venue</p>
          <p className="mt-1 text-sm text-slate-600">
            {new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(new Date(event.start_date))}
            {event.venue_name ? ` · ${event.venue_name}` : ""}
          </p>
          <Link className="mt-2 inline-block text-sm font-semibold text-slate-700 underline" href={`/e/${event.slug}`}>View public event</Link>
        </div>
      </section>}
      {canManageEvent ? (
        <>
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Event status</h2>
            <div className="mt-3">
              <EventStatusForm eventId={event.id} label="Update status" organizationId={context.organization.id} status={event.status} />
            </div>
          </div>
          <EventTicketPlanManager event={event} organizationId={context.organization.id} plans={ticketPlans || []} />
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Edit event details</h2>
          <EventForm event={event} onlineMeetingUrl={meetingUrl || ""} organization={context.organization} venues={venues || []} />
        </>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">You have view-only access to this event.</p>
      )}
    </WorkspacePage>
  );
}
