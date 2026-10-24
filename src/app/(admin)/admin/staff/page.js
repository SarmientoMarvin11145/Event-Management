import OrganizationPicker from "@/components/admin/organization-picker";
import WorkspacePage from "@/components/workspace-page";
import { assignStaffToEvent, manageOrganizationMember } from "@/app/(admin)/admin/actions";
import { requireFeatureEnabled } from "@/lib/features";
import { getOrganizationAdminContext } from "@/lib/admin-data";

const staffRoles = [
  ["organization_admin", "Organization administrator"],
  ["event_manager", "Event manager"],
  ["check_in_staff", "Check-in staff"],
  ["viewer", "Viewer"],
];

export default async function AdminStaffPage({ searchParams }) {
  await requireFeatureEnabled("admin-staff");
  const params = await searchParams;
  const context = await getOrganizationAdminContext(params?.organization_id || null);
  if (!context.organization) {
    return <WorkspacePage description="Manage real organization staff and event assignments." title="Staff" />;
  }
  if (!context.canManageOrganization) {
    return (
      <WorkspacePage description="Manage organization staff and event access." title="Staff">
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Staff management is available to organization administrators only.</section>
      </WorkspacePage>
    );
  }
  const [
    { data: members, error: membersError },
    { data: events, error: eventsError },
    { data: assignments, error: assignmentsError },
  ] = await Promise.all([
    context.supabase.rpc("admin_list_organization_members", { p_organization_id: context.organization.id }),
    context.supabase.from("events").select("id, title, start_date").eq("organization_id", context.organization.id).order("start_date", { ascending: false }).limit(100),
    context.supabase.from("organization_member_events").select("membership_id, event_id"),
  ]);
  if (membersError) throw new Error(`Unable to load organization staff: ${membersError.message}`, { cause: membersError });
  if (eventsError) throw new Error(`Unable to load organization events: ${eventsError.message}`, { cause: eventsError });
  if (assignmentsError) throw new Error(`Unable to load staff assignments: ${assignmentsError.message}`, { cause: assignmentsError });
  const assignmentsSet = new Set((assignments || []).map(({ membership_id, event_id }) => `${membership_id}:${event_id}`));

  return (
    <WorkspacePage description={`Manage staff access for ${context.organization.name}.`} title="Staff">
      <div className="mb-5">
        <OrganizationPicker organizations={context.organizations} pathname="/admin/staff" selectedOrganizationId={context.organization.id} />
      </div>
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Add an existing KURO account</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">The selected account is added immediately. Email invitations are not configured, so this form does not send an email.</p>
        <form action={manageOrganizationMember} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(200px,0.8fr)_auto] sm:items-end">
          <input name="organization_id" type="hidden" value={context.organization.id} />
          <input name="action" type="hidden" value="invite" />
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Account email
            <input className="rounded-md border border-slate-300 px-3 py-2.5 text-sm font-normal" autoComplete="email" maxLength={254} name="email" required type="email" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Organization role
            <select className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal" name="role">
              {staffRoles.map(([role, label]) => <option key={role} value={role}>{label}</option>)}
            </select>
          </label>
          <button className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700" type="submit">Add staff</button>
        </form>
      </section>
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Organization staff</h2>
          <p className="mt-1 text-sm text-slate-500">Event managers and check-in staff need an event assignment to access attendee workflows.</p>
        </div>
        {members?.length ? members.map((member) => (
          <article className="rounded-xl border border-slate-200 bg-white p-5" key={member.membership_id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">{member.full_name}</h3>
                <p className="mt-1 text-sm text-slate-600">{member.email}</p>
                <p className="mt-1 text-xs capitalize text-slate-500">{member.status} · {Number(member.event_assignments)} event assignments</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={manageOrganizationMember} className="flex items-center gap-2">
                  <input name="organization_id" type="hidden" value={context.organization.id} />
                  <input name="member_id" type="hidden" value={member.membership_id} />
                  <input name="action" type="hidden" value="update" />
                  <label className="sr-only" htmlFor={`role-${member.membership_id}`}>Role for {member.full_name}</label>
                  <select className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm" defaultValue={member.role} id={`role-${member.membership_id}`} name="role">
                    {staffRoles.map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                  </select>
                  <button className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50" type="submit">Save role</button>
                </form>
                {member.status === "active" && (
                  <form action={manageOrganizationMember}>
                    <input name="organization_id" type="hidden" value={context.organization.id} />
                    <input name="member_id" type="hidden" value={member.membership_id} />
                    <input name="action" type="hidden" value="remove" />
                    <input name="role" type="hidden" value={member.role} />
                    <button className="rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50" type="submit">Suspend access</button>
                  </form>
                )}
              </div>
            </div>
            {["event_manager", "check_in_staff"].includes(member.role) && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h4 className="text-sm font-semibold text-slate-800">Event assignments</h4>
                {events?.length ? (
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {events.map((event) => {
                      const assigned = assignmentsSet.has(`${member.membership_id}:${event.id}`);
                      return (
                        <li className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2" key={event.id}>
                          <span className="min-w-0 truncate text-sm text-slate-700">{event.title}</span>
                          <form action={assignStaffToEvent}>
                            <input name="organization_id" type="hidden" value={context.organization.id} />
                            <input name="membership_id" type="hidden" value={member.membership_id} />
                            <input name="event_id" type="hidden" value={event.id} />
                            <input name="assigned" type="hidden" value={String(!assigned)} />
                            <button className="whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white" type="submit">{assigned ? "Unassign" : "Assign"}</button>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="mt-2 text-sm text-slate-500">Create an event before assigning staff.</p>}
              </div>
            )}
          </article>
        )) : <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">No staff are connected to this organization yet.</p>}
      </section>
    </WorkspacePage>
  );
}
