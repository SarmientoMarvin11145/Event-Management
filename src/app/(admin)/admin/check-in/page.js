import WorkspacePage from "@/components/workspace-page";
import OrganizationPicker from "@/components/admin/organization-picker";
import TicketCheckIn from "@/components/admin/ticket-check-in";
import { getOrganizationAdminContext } from "@/lib/admin-data";
import { requireFeatureEnabled } from "@/lib/features";

export default async function AdminCheckInPage({ searchParams }) {
  await requireFeatureEnabled("admin-registration-management");
  const params = await searchParams;
  const context = await getOrganizationAdminContext(params?.organization_id || null);
  if (!context.organization) {
    return <WorkspacePage description="Validate confirmed event tickets at the door." title="Ticket check-in" />;
  }
  const { data: eventRows, error } = await context.supabase.from("events")
    .select("id, title, start_date")
    .eq("organization_id", context.organization.id)
    .order("start_date", { ascending: false })
    .limit(250);
  if (error) throw new Error(`Unable to load check-in events: ${error.message}`, { cause: error });

  let allowedEventIds = null;
  if (context.membership?.role === "event_manager" || context.membership?.role === "check_in_staff") {
    const { data: assignments, error: assignmentError } = await context.supabase
      .from("organization_member_events")
      .select("event_id")
      .eq("membership_id", context.membership.membership_id);
    if (assignmentError) throw new Error(`Unable to load check-in event assignments: ${assignmentError.message}`, { cause: assignmentError });
    allowedEventIds = new Set((assignments || []).map(({ event_id }) => event_id));
  }
  const events = (eventRows || []).filter((event) => !allowedEventIds || allowedEventIds.has(event.id));
  const selected = events.some((event) => event.id === params?.event_id) ? params.event_id : "";

  return (
    <WorkspacePage description={`Scan or manually verify one-time tickets for ${context.organization.name}.`} title="Ticket check-in">
      <div className="mb-5">
        <OrganizationPicker organizations={context.organizations} pathname="/admin/check-in" selectedOrganizationId={context.organization.id} />
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <p className="mb-5 max-w-2xl text-sm leading-6 text-slate-600">Each valid ticket can be checked in once. Cancelled, refunded, already checked-in, and other-event tickets are rejected by the database.</p>
        <TicketCheckIn events={events} selectedEventId={selected} />
      </section>
    </WorkspacePage>
  );
}
