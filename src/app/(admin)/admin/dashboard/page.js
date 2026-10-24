import Link from "next/link";
import OrganizationPicker from "@/components/admin/organization-picker";
import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";
import { getOrganizationAdminContext } from "@/lib/admin-data";

export const instant = false;

function count(value) {
  return Number(value || 0).toLocaleString();
}

function dateLabel(value, timezone) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(new Date(value));
}

export default async function AdminDashboardPage({ searchParams }) {
  await requireFeatureEnabled("admin-overview");
  const params = await searchParams;
  const context = await getOrganizationAdminContext(params?.organization_id || null);

  if (!context.organization) {
    return (
      <WorkspacePage description="Your organization's events and attendance, from live data." title="Overview">
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8">
          <h2 className="text-lg font-semibold text-slate-900">No organization data connected</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            This admin section is not connected to live organization data yet. No sample metrics or records are shown.
            Ask an organization owner to add you as an administrator.
          </p>
        </section>
      </WorkspacePage>
    );
  }

  if (!context.canManageOrganization) {
    return (
      <WorkspacePage description={`Organization overview for ${context.organization.name}.`} title="Overview">
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Organization-wide metrics and activity are available to organization administrators. Use Events to view your assigned event access.
        </section>
      </WorkspacePage>
    );
  }

  const { data: overview, error } = await context.supabase.rpc("get_organization_admin_overview", {
    p_organization_id: context.organization.id,
  });
  if (error) throw new Error(`Unable to load organization overview: ${error.message}`, { cause: error });
  const stats = [
    ["Events", overview.eventCount],
    ["Upcoming", overview.upcomingCount],
    ["Registrations", overview.registrationCount],
    ["Attendees", overview.attendeeCount],
    ["Checked in", overview.checkedInCount],
    ["Active staff", overview.staffCount],
  ];
  const chart = overview.chart || [];
  const chartMax = Math.max(1, ...chart.map((item) => Number(item.registrations || 0)));

  return (
    <WorkspacePage description={`Live activity and event performance for ${context.organization.name}.`} title="Overview">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <OrganizationPicker organizations={context.organizations} pathname="/admin/dashboard" selectedOrganizationId={context.organization.id} />
        {context.canManageOrganization && (
          <Link className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700" href="/admin/events/new">
            Create event
          </Link>
        )}
      </div>

      <section aria-label="Organization metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(([label, value]) => (
          <article className="rounded-xl border border-slate-200 bg-white p-5" key={label}>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{count(value)}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Registrations by event month</h2>
          <p className="mt-1 text-sm text-slate-500">Real registrations and check-ins for the past six months.</p>
          {chart.length ? (
            <>
              <div aria-label="Monthly registrations and check-ins" className="mt-6 grid h-48 grid-cols-6 items-end gap-3" role="img">
                {chart.map((item) => {
                  const registrations = Number(item.registrations || 0);
                  const attended = Number(item.attended || 0);
                  return (
                    <div className="flex h-full flex-col items-center justify-end gap-2" key={`${item.month}-${item.registrations}`}>
                      <div className="flex h-full w-full items-end justify-center gap-1">
                        <span className="w-3 rounded-t bg-slate-800" style={{ height: `${registrations ? Math.max(2, registrations / chartMax * 100) : 0}%` }} />
                        <span className="w-3 rounded-t bg-emerald-600" style={{ height: `${attended ? Math.max(2, attended / chartMax * 100) : 0}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{item.month}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-5 text-xs text-slate-600">
                <span><i className="mr-2 inline-block size-2 rounded-full bg-slate-800" />Registrations</span>
                <span><i className="mr-2 inline-block size-2 rounded-full bg-emerald-600" />Check-ins</span>
              </div>
              <div className="sr-only">
                {chart.map((item) => <p key={`sr-${item.month}`}>{item.month}: {count(item.registrations)} registrations, {count(item.attended)} check-ins</p>)}
              </div>
            </>
          ) : <p className="mt-5 text-sm text-slate-500">No registration data is available yet.</p>}
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Event status</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            {[["Draft", overview.draftCount], ["Published", overview.publishedCount], ["Ongoing", overview.ongoingCount], ["Completed", overview.completedCount], ["Cancelled", overview.cancelledCount], ["Attendance rate", `${overview.attendanceRate || 0}%`]].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-900">{typeof value === "string" ? value : count(value)}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">Upcoming events</h2>
            <Link className="text-sm font-semibold text-slate-700 hover:underline" href="/admin/events">All events</Link>
          </div>
          {overview.events?.length ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {overview.events.map((event) => (
                <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={event.id}>
                  <div>
                    <Link className="font-medium text-slate-900 hover:underline" href={`/admin/events/${event.id}?organization_id=${context.organization.id}`}>{event.title}</Link>
                    <p className="mt-1 text-sm text-slate-500">{dateLabel(event.start_date, context.organization.timezone)}{event.venue_name ? ` · ${event.venue_name}` : ""}</p>
                  </div>
                  <span className="text-sm text-slate-600">{count(event.registration_count)} registered</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-slate-500">No upcoming events are connected to this organization.</p>}
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
          {overview.activity?.length ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {overview.activity.map((item) => (
                <li className="py-3" key={item.id}>
                  <p className="text-sm font-medium text-slate-800">{item.action.replaceAll(".", " ")}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.actor_name || "Organization activity"} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: context.organization.timezone }).format(new Date(item.created_at))}
                  </p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-slate-500">No activity has been recorded yet.</p>}
        </article>
      </section>
    </WorkspacePage>
  );
}
