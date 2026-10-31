import Link from "next/link";
import OrganizationPicker from "@/components/admin/organization-picker";
import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";
import { getOrganizationAdminContext } from "@/lib/admin-data";
import { hasMinimumPlan } from "@/lib/account-plan";

export default async function AdminReportsPage({ searchParams }) {
  await requireFeatureEnabled("admin-reports");
  const params = await searchParams;
  const context = await getOrganizationAdminContext(params?.organization_id || null);
  if (!hasMinimumPlan(context.planTier, "business")) {
    return (
      <WorkspacePage description="Advanced reports are included with the Business account plan." title="Reports">
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-950">
          <h2 className="font-semibold">Upgrade to Business for advanced reports</h2>
          <p className="mt-1">Detailed registration and attendance reports are available with the Business plan.</p>
          <Link className="mt-4 inline-flex rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white" href="/account-plan">View account plans</Link>
        </section>
      </WorkspacePage>
    );
  }
  if (!context.organization) {
    return <WorkspacePage description="Review real attendance and event reports." title="Reports" />;
  }
  if (!context.canManageOrganization) {
    return (
      <WorkspacePage description="Review attendance and event reports." title="Reports">
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
          Organization reports are available to organization administrators only.
        </section>
      </WorkspacePage>
    );
  }
  const { data: reports, error } = await context.supabase.rpc("admin_get_organization_reports", {
    p_organization_id: context.organization.id,
  });
  if (error) throw new Error(`Unable to load organization reports: ${error.message}`, { cause: error });
  const events = reports.events || [];
  const csvHref = `/admin/reports/export?organization_id=${context.organization.id}&kind=reports`;

  return (
    <WorkspacePage description={`Registration and attendance records for ${context.organization.name}. No revenue is estimated for unpaid or unconnected checkouts.`} title="Reports">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <OrganizationPicker organizations={context.organizations} pathname="/admin/reports" selectedOrganizationId={context.organization.id} />
        <a className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={csvHref}>Download CSV</a>
      </div>
      <section aria-label="Registration and attendance totals" className="grid gap-3 sm:grid-cols-2">
        {[["Registrations", reports.registrationCount], ["Checked in", reports.attendedCount]].map(([label, value]) => (
          <article className="rounded-xl border border-slate-200 bg-white p-5" key={label}>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{Number(value || 0).toLocaleString()}</p>
          </article>
        ))}
      </section>
      <section className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {events.length ? (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Registrations</th><th className="px-4 py-3">Confirmed</th><th className="px-4 py-3">Checked in</th><th className="px-4 py-3">Capacity</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-4"><Link className="font-semibold text-slate-900 hover:underline" href={`/admin/events/${event.id}?organization_id=${context.organization.id}`}>{event.title}</Link></td>
                  <td className="px-4 py-4 text-slate-600">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: context.organization.timezone }).format(new Date(event.start_date))}</td>
                  <td className="px-4 py-4 capitalize text-slate-600">{event.status}</td>
                  <td className="px-4 py-4 text-slate-600">{Number(event.registrations || 0).toLocaleString()}</td>
                  <td className="px-4 py-4 text-slate-600">{Number(event.confirmed || 0).toLocaleString()}</td>
                  <td className="px-4 py-4 text-slate-600">{Number(event.attended || 0).toLocaleString()}</td>
                  <td className="px-4 py-4 text-slate-600">{event.capacity || "Unlimited"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="px-5 py-10 text-center text-sm text-slate-500">No event records are connected to this organization yet.</p>}
      </section>
      <p className="mt-3 text-xs text-slate-500">Reports include live registration and attendance counts. Revenue, PDF reports, and emailed reports are not available because payment and document delivery are not configured.</p>
    </WorkspacePage>
  );
}
