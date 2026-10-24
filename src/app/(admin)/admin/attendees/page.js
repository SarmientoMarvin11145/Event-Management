import Link from "next/link";
import OrganizationPicker from "@/components/admin/organization-picker";
import WorkspacePage from "@/components/workspace-page";
import { recordAdminAttendance, updateAdminRegistration } from "@/app/(admin)/admin/actions";
import { requireFeatureEnabled } from "@/lib/features";
import { getOrganizationAdminContext } from "@/lib/admin-data";

const registrationStatuses = ["confirmed", "pending", "cancelled", "waitlisted", "invited"];

export default async function AdminAttendeesPage({ searchParams }) {
  await requireFeatureEnabled("admin-attendees");
  const params = await searchParams;
  const context = await getOrganizationAdminContext(params?.organization_id || null);
  if (!context.organization) {
    return <WorkspacePage description="View and manage real event registrations." title="Attendees" />;
  }
  const [
    { data: events, error: eventsError },
    { data: assignments, error: assignmentsError },
  ] = await Promise.all([
    context.supabase.from("events").select("id, title, start_date").eq("organization_id", context.organization.id).order("start_date", { ascending: false }).limit(250),
    context.membership?.membership_id
      ? context.supabase.from("organization_member_events").select("event_id").eq("membership_id", context.membership.membership_id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventsError) throw new Error(`Unable to load organization events: ${eventsError.message}`, { cause: eventsError });
  if (assignmentsError) throw new Error(`Unable to load staff event assignments: ${assignmentsError.message}`, { cause: assignmentsError });

  const eventAssignments = new Set((assignments || []).map(({ event_id }) => event_id));
  const canViewAttendees = context.canManageOrganization
    || (["event_manager", "check_in_staff"].includes(context.membership?.role) && eventAssignments.size > 0);
  if (!canViewAttendees) {
    return (
      <WorkspacePage description={`Registrations across ${context.organization.name}.`} title="Attendees">
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Attendee records are available to organization administrators and staff assigned to an event.
        </section>
      </WorkspacePage>
    );
  }

  const selectedEventId = String(params?.event_id || "");
  const selectedStatus = registrationStatuses.includes(params?.status) ? params.status : "";
  const search = String(params?.q || "").trim();
  const { data: attendeeRows, error: attendeesError } = await context.supabase.rpc("admin_list_organization_attendees", {
    p_organization_id: context.organization.id,
    p_search: search || null,
    p_event_id: selectedEventId || null,
    p_status: selectedStatus || null,
    p_limit: 1000,
    p_offset: 0,
  });
  if (attendeesError) throw new Error(`Unable to load event attendees: ${attendeesError.message}`, { cause: attendeesError });
  const attendeeList = attendeeRows || [];
  return (
    <WorkspacePage description={`Registrations across ${context.organization.name}. Contact details are shown only with attendee consent.`} title="Attendees">
      <div className="mb-5">
        <OrganizationPicker organizations={context.organizations} pathname="/admin/attendees" selectedOrganizationId={context.organization.id} />
      </div>
      <form action="/admin/attendees" className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
        <input name="organization_id" type="hidden" value={context.organization.id} />
        <label className="grid gap-1 text-xs font-semibold text-slate-600 sm:col-span-2">
          Search attendee, consented email, or registration code
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" defaultValue={search} maxLength={100} name="q" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Event
          <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal" defaultValue={selectedEventId} name="event_id">
            <option value="">All events</option>
            {(events || []).map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Registration status
          <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal" defaultValue={selectedStatus} name="status">
            <option value="">All statuses</option>
            {registrationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" type="submit">Apply</button>
          <a className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`/admin/reports/export?organization_id=${context.organization.id}&kind=attendees${selectedEventId ? `&event_id=${selectedEventId}` : ""}${selectedStatus ? `&status=${selectedStatus}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`}>Export CSV</a>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {attendeeList.length ? (
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Attendee</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Registered</th><th className="px-4 py-3">Seat</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Check-in</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendeeList.map((attendee) => {
                const canManage = context.canManageOrganization || (
                  context.membership?.role === "event_manager" && eventAssignments.has(attendee.event_id)
                );
                const canCheckIn = canManage || (
                  context.membership?.role === "check_in_staff" && eventAssignments.has(attendee.event_id)
                );
                return (
                  <tr key={attendee.registration_id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{attendee.attendee_name}</p>
                      {attendee.attendee_email && <p className="mt-1 text-xs text-slate-500">{attendee.attendee_email}</p>}
                      {attendee.registration_code && <p className="mt-1 text-xs text-slate-500">Code: {attendee.registration_code}</p>}
                    </td>
                    <td className="px-4 py-4">
                      <Link className="font-medium text-slate-800 hover:underline" href={`/admin/events/${attendee.event_id}?organization_id=${context.organization.id}`}>{attendee.event_title}</Link>
                      <p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: context.organization.timezone }).format(new Date(attendee.event_start))}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: context.organization.timezone }).format(new Date(attendee.registered_at))}</td>
                    <td className="px-4 py-4 text-slate-600">{attendee.seat_number || "—"}</td>
                    <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{attendee.registration_status}</span></td>
                    <td className="px-4 py-4">
                      {attendee.checked_in_at
                        ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: context.organization.timezone }).format(new Date(attendee.checked_in_at))
                        : "Not checked in"}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {canManage && attendee.registration_status !== "cancelled" && (
                          <form action={updateAdminRegistration} className="flex items-center gap-1">
                            <input name="registration_id" type="hidden" value={attendee.registration_id} />
                            <label className="sr-only" htmlFor={`registration-status-${attendee.registration_id}`}>Update registration for {attendee.attendee_name}</label>
                            <select className="rounded border border-slate-300 px-2 py-1 text-xs" defaultValue={attendee.registration_status} id={`registration-status-${attendee.registration_id}`} name="status">
                              {["confirmed", "waitlisted", "cancelled"].map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                            <button className="text-xs font-semibold underline" type="submit">Save</button>
                          </form>
                        )}
                        {canCheckIn && attendee.registration_status === "confirmed" && !attendee.checked_in_at && (
                          <form action={recordAdminAttendance}>
                            <input name="registration_id" type="hidden" value={attendee.registration_id} />
                            <button className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50" type="submit">Check in</button>
                          </form>
                        )}
                        {!canManage && !canCheckIn && <span className="text-xs text-slate-500">View only</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="px-5 py-10 text-center text-sm text-slate-500">No registrations match this organization and filter.</p>}
      </div>
      {attendeeList.length >= 1000 && <p className="mt-3 text-xs text-amber-800">The list is capped at 1,000 records. Narrow the filters to view or export a smaller set.</p>}
      <p className="mt-3 text-xs text-slate-500">Attendee email is hidden unless the attendee allows organizers to contact them. Registration capacity is limited to 1,000 visible rows per query.</p>
    </WorkspacePage>
  );
}
