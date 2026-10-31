import Link from "next/link";
import OrganizationPicker from "@/components/admin/organization-picker";
import WorkspacePage from "@/components/workspace-page";
import { getOrganizationAdminContext } from "@/lib/admin-data";
import { requireFeatureEnabled } from "@/lib/features";

const registrationStatuses = ["pending", "confirmed", "cancelled", "waitlisted", "invited"];
const paymentStatuses = ["paid", "pending", "failed", "expired", "cancelled", "refunded", "free", "unpaid"];
const PAGE_SIZE = 25;

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function money(amount, currency) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "PHP",
  }).format(Number(amount || 0));
}

function isMissingRegistrationFunction(error, functionName) {
  return error?.code === "PGRST202" && error.message?.includes(functionName);
}

function DatabaseSetupMessage() {
  return (
    <WorkspacePage description="The registration database functions are not available in the connected Supabase project yet." title="Event Registrations">
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
        <p className="text-xs font-bold uppercase tracking-wide">Database setup required</p>
        <h2 className="mt-2 text-lg font-semibold">Apply the registration management migration</h2>
        <p className="mt-2 text-sm leading-6">
          In the Supabase SQL Editor, run <code>supabase/migrations/20261031003000_registration_management_and_checkin.sql</code>
          {" "}after the event ticket and admin refund migrations. Then refresh the API schema cache:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-amber-200 bg-white p-3 text-sm">NOTIFY pgrst, &apos;reload schema&apos;;</pre>
        <p className="mt-3 text-sm">Reload this page after the migration completes.</p>
      </section>
    </WorkspacePage>
  );
}

export default async function AdminRegistrationsPage({ searchParams }) {
  await requireFeatureEnabled("admin-registration-management");
  const params = await searchParams;
  const context = await getOrganizationAdminContext(params?.organization_id || null);
  if (!context.organization) {
    return <WorkspacePage description="Review event registrations, payments, and refunds." title="Event Registrations" />;
  }
  if (!context.canManageOrganization && context.membership?.role !== "event_manager") {
    return (
      <WorkspacePage description={`Registration management for ${context.organization.name}.`} title="Event Registrations">
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Registration management is available to organization administrators and event managers assigned to an event.
        </section>
      </WorkspacePage>
    );
  }
  if (!context.canManageOrganization) {
    const { data: assignments, error: assignmentError } = await context.supabase
      .from("organization_member_events")
      .select("event_id")
      .eq("membership_id", context.membership.membership_id);
    if (assignmentError) throw new Error(`Unable to load registration event assignments: ${assignmentError.message}`, { cause: assignmentError });
    if (!assignments?.length) {
      return (
        <WorkspacePage description={`Registration management for ${context.organization.name}.`} title="Event Registrations">
          <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Registration management is available only for events assigned to you.
          </section>
        </WorkspacePage>
      );
    }
  }

  const search = String(params?.q || "").trim();
  if (search.length > 100) throw new Error("Registration search must be 100 characters or fewer.");
  const eventId = String(params?.event_id || "");
  const registrationStatus = registrationStatuses.includes(params?.status) ? params.status : "";
  const paymentStatus = paymentStatuses.includes(params?.payment_status) ? params.payment_status : "";
  const page = boundedNumber(params?.page, 1, 1, 100000);
  const offset = (page - 1) * PAGE_SIZE;

  const [
    { data: summaryRows, error: summaryError },
    { data: eventRows, error: eventsError },
  ] = await Promise.all([
    context.supabase.rpc("admin_registration_dashboard_summary", {
      p_organization_id: context.organization.id,
    }),
    context.supabase.from("events")
      .select("id, title")
      .eq("organization_id", context.organization.id)
      .order("start_date", { ascending: false })
      .limit(250),
  ]);
  if (isMissingRegistrationFunction(summaryError, "admin_registration_dashboard_summary")) {
    return <DatabaseSetupMessage />;
  }
  if (summaryError) throw new Error(`Unable to load registration summary: ${summaryError.message}`, { cause: summaryError });
  if (eventsError) throw new Error(`Unable to load registration events: ${eventsError.message}`, { cause: eventsError });

  const { data: rows, error: registrationsError } = await context.supabase.rpc("admin_list_event_registrations", {
    p_organization_id: context.organization.id,
    p_search: search,
    p_event_id: eventId || null,
    p_registration_status: registrationStatus || null,
    p_payment_status: paymentStatus || null,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
  if (isMissingRegistrationFunction(registrationsError, "admin_list_event_registrations")) {
    return <DatabaseSetupMessage />;
  }
  if (registrationsError) throw new Error(`Unable to load event registrations: ${registrationsError.message}`, { cause: registrationsError });

  const summary = summaryRows?.[0] || {};
  const registrations = rows || [];
  const totalCount = Number(registrations[0]?.total_count || 0);
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const query = new URLSearchParams();
  query.set("organization_id", context.organization.id);
  if (search) query.set("q", search);
  if (eventId) query.set("event_id", eventId);
  if (registrationStatus) query.set("status", registrationStatus);
  if (paymentStatus) query.set("payment_status", paymentStatus);

  return (
    <WorkspacePage description={`Live registrations and PayMongo payment status for ${context.organization.name}.`} title="Event Registrations">
      <div className="mb-5">
        <OrganizationPicker organizations={context.organizations} pathname="/admin/registrations" selectedOrganizationId={context.organization.id} />
      </div>
      <section aria-label="Registration summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Total Registrations", summary.total_registrations],
          ["Pending Registrations", summary.pending_registrations],
          ["Confirmed Registrations", summary.confirmed_registrations],
          ["Cancelled Registrations", summary.cancelled_registrations],
          ["Refund Requests", summary.refund_requests],
        ].map(([label, count]) => (
          <article className="rounded-xl border border-slate-200 bg-white p-4" key={label}>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{Number(count || 0).toLocaleString()}</p>
          </article>
        ))}
      </section>

      <form action="/admin/registrations" className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
        <input name="organization_id" type="hidden" value={context.organization.id} />
        <label className="grid gap-1 text-xs font-semibold text-slate-600 sm:col-span-2">
          Search registrations
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" defaultValue={search} maxLength={100} name="q" placeholder="Reference, attendee, email, event" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Event
          <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal" defaultValue={eventId} name="event_id">
            <option value="">All events</option>
            {(eventRows || []).map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Registration status
          <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal" defaultValue={registrationStatus} name="status">
            <option value="">All statuses</option>
            {registrationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Payment status
          <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal" defaultValue={paymentStatus} name="payment_status">
            <option value="">All payments</option>
            {paymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2 xl:col-span-5">
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" type="submit">Apply filters</button>
          <Link className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`/admin/check-in?organization_id=${context.organization.id}`}>Scan tickets</Link>
        </div>
      </form>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {registrations.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Registration Reference</th><th className="px-4 py-3">Attendee Name</th>
                  <th className="px-4 py-3">Email</th><th className="px-4 py-3">Event Name</th>
                  <th className="px-4 py-3">Selected Seat Plan</th><th className="px-4 py-3">Ticket Quantity</th>
                  <th className="px-4 py-3">Total Amount</th><th className="px-4 py-3">Payment Method</th>
                  <th className="px-4 py-3">Payment Status</th><th className="px-4 py-3">Registration Status</th>
                  <th className="px-4 py-3">Registration Date</th><th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrations.map((registration) => (
                  <tr key={registration.registration_id}>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-xs font-semibold text-slate-800">{registration.registration_reference}</td>
                    <td className="px-4 py-4 font-medium text-slate-900">{registration.attendee_name || "Attendee"}</td>
                    <td className="px-4 py-4 text-slate-600">{registration.attendee_email || "Not provided"}</td>
                    <td className="px-4 py-4 text-slate-700">{registration.event_name}</td>
                    <td className="px-4 py-4 text-slate-700">{registration.ticket_plan}</td>
                    <td className="px-4 py-4 text-slate-700">{registration.ticket_quantity}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-700">{money(registration.total_amount, registration.currency)}</td>
                    <td className="px-4 py-4 text-slate-700">{registration.payment_method}</td>
                    <td className="px-4 py-4"><span className="capitalize">{String(registration.payment_status).replaceAll("_", " ")}</span></td>
                    <td className="px-4 py-4"><span className="capitalize">{String(registration.registration_status).replaceAll("_", " ")}</span></td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: context.organization.timezone }).format(new Date(registration.registration_date))}</td>
                    <td className="px-4 py-4"><Link className="whitespace-nowrap font-semibold text-[#245c55] underline" href={`/admin/registrations/${registration.registration_id}?organization_id=${context.organization.id}`}>View Details</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-slate-500">No registrations match these filters. Registrations will appear here when attendees register for your events.</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <p>Showing {totalCount ? offset + 1 : 0}–{Math.min(offset + registrations.length, totalCount)} of {totalCount.toLocaleString()} registrations</p>
        <nav aria-label="Registration pages" className="flex gap-2">
          {page > 1 && <Link className="rounded-md border border-slate-300 px-3 py-2 font-semibold hover:bg-white" href={`/admin/registrations?${new URLSearchParams({ ...Object.fromEntries(query), page: String(page - 1) })}`}>Previous</Link>}
          <span className="px-2 py-2">Page {page} of {pageCount}</span>
          {page < pageCount && <Link className="rounded-md border border-slate-300 px-3 py-2 font-semibold hover:bg-white" href={`/admin/registrations?${new URLSearchParams({ ...Object.fromEntries(query), page: String(page + 1) })}`}>Next</Link>}
        </nav>
      </div>
      <p className="mt-3 text-xs text-slate-500">Payment totals and statuses are loaded from Supabase. PayMongo payments are independently verified before tickets are issued.</p>
    </WorkspacePage>
  );
}