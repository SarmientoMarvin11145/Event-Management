import Link from "next/link";
import OrganizationPicker from "@/components/admin/organization-picker";
import RegistrationActions from "@/components/admin/registration-actions";
import WorkspacePage from "@/components/workspace-page";
import { getOrganizationAdminContext } from "@/lib/admin-data";
import { requireFeatureEnabled } from "@/lib/features";

function value(value, fallback = "Not provided") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function formatAmount(amount, currency) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "PHP",
  }).format(Number(amount || 0));
}

export default async function AdminRegistrationDetailPage({ params, searchParams }) {
  await requireFeatureEnabled("admin-registration-management");
  const [{ registrationId }, query] = await Promise.all([params, searchParams]);
  const context = await getOrganizationAdminContext(query?.organization_id || null);
  if (!context.organization) return <WorkspacePage title="Registration details" />;

  const { data, error } = await context.supabase.rpc("admin_get_registration_management_detail", {
    p_registration_id: registrationId,
  });
  if (error) {
    if (error.message.includes("not found or access was denied")) {
      return <WorkspacePage title="Registration not found"><Link className="font-semibold underline" href="/admin/registrations">Back to registrations</Link></WorkspacePage>;
    }
    throw new Error(`Unable to load registration details: ${error.message}`, { cause: error });
  }
  const registration = data.registration;
  const event = data.event;
  const payment = data.payment;
  const tickets = data.tickets || [];
  const history = data.history || [];
  const canRefund = payment?.status === "paid"
    && payment.refund_status !== "succeeded"
    && !tickets.some((ticket) => ticket.status === "checked_in");
  const canCancel = registration.status !== "cancelled"
    && !tickets.some((ticket) => ticket.status === "checked_in");
  const totalAmount = payment ? Number(payment.amount) / 100 : Number(registration.unit_price) * Number(registration.quantity);

  return (
    <WorkspacePage description={`${event.title} · ${context.organization.name}`} title="Registration details">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <OrganizationPicker organizations={context.organizations} pathname={`/admin/registrations/${registrationId}`} selectedOrganizationId={context.organization.id} />
        <Link className="text-sm font-semibold text-slate-700 underline" href={`/admin/registrations?organization_id=${context.organization.id}`}>Back to registrations</Link>
      </div>
      {event.banner_url && <div aria-label={`${event.title} event cover`} className="mb-6 h-48 rounded-xl bg-cover bg-center" role="img" style={{ backgroundImage: `url("${event.banner_url}")` }} />}
      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Attendee</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Name</dt><dd className="mt-1 font-medium">{value(registration.attendee_name)}</dd></div>
            <div><dt className="text-slate-500">Email</dt><dd className="mt-1 font-medium">{value(registration.attendee_email)}</dd></div>
            <div><dt className="text-slate-500">Phone</dt><dd className="mt-1 font-medium">{value(registration.attendee_phone)}</dd></div>
            <div><dt className="text-slate-500">Address</dt><dd className="mt-1 font-medium">{value(registration.attendee_address)}</dd></div>
          </dl>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Event and ticket</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Event</dt><dd className="mt-1 font-medium">{event.title}</dd></div>
            <div><dt className="text-slate-500">Date and time</dt><dd className="mt-1 font-medium">{new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeStyle: "short", timeZone: context.organization.timezone }).format(new Date(event.start_date))}</dd></div>
            <div><dt className="text-slate-500">Venue</dt><dd className="mt-1 font-medium">{[event.venue_name, event.city].filter(Boolean).join(", ") || "To be announced"}</dd></div>
            <div><dt className="text-slate-500">Selected plan</dt><dd className="mt-1 font-medium">{data.plan.name}</dd></div>
            <div><dt className="text-slate-500">Quantity</dt><dd className="mt-1 font-medium">{registration.quantity}</dd></div>
            <div><dt className="text-slate-500">Total</dt><dd className="mt-1 font-medium">{formatAmount(totalAmount, payment?.currency || event.currency)}</dd></div>
            <div><dt className="text-slate-500">Registration reference</dt><dd className="mt-1 font-mono font-medium">{registration.reference}</dd></div>
            <div><dt className="text-slate-500">Registration status</dt><dd className="mt-1 font-medium capitalize">{registration.status.replaceAll("_", " ")}</dd></div>
          </dl>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Payment and PayMongo</h2>
          {payment ? (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Payment status</dt><dd className="mt-1 font-medium capitalize">{payment.status}</dd></div>
              <div><dt className="text-slate-500">Payment method</dt><dd className="mt-1 font-medium">{value(payment.payment_method, "PayMongo")}</dd></div>
              <div><dt className="text-slate-500">Payment reference</dt><dd className="mt-1 break-all font-mono font-medium">{value(payment.reference_number)}</dd></div>
              <div><dt className="text-slate-500">Transaction ID</dt><dd className="mt-1 break-all font-mono font-medium">{value(payment.payment_id)}</dd></div>
              <div><dt className="text-slate-500">Refund status</dt><dd className="mt-1 font-medium capitalize">{payment.refund_status}</dd></div>
              <div><dt className="text-slate-500">Refund amount</dt><dd className="mt-1 font-medium">{payment.refund_status === "none" ? "—" : formatAmount(payment.amount / 100, payment.currency)}</dd></div>
              {payment.refund_reason && <div className="sm:col-span-2"><dt className="text-slate-500">Refund reason</dt><dd className="mt-1 font-medium">{payment.refund_reason}</dd></div>}
              {payment.refund_requested_at && <div><dt className="text-slate-500">Refund requested</dt><dd className="mt-1 font-medium">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: context.organization.timezone }).format(new Date(payment.refund_requested_at))}</dd></div>}
            </dl>
          ) : <p className="mt-3 text-sm text-slate-600">No PayMongo transaction is associated with this registration.</p>}
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Issued tickets</h2>
          {tickets.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {tickets.map((ticket) => <li className="flex items-center justify-between gap-3 py-3 text-sm" key={ticket.ticket_number}><span className="font-mono font-semibold">{ticket.ticket_number}</span><span className="capitalize text-slate-600">{ticket.status.replaceAll("_", " ")}{ticket.seat_number ? ` · Seat ${ticket.seat_number}` : ""}</span></li>)}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-600">No tickets have been issued for this registration.</p>}
        </article>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Registration history</h2>
        {history.length ? (
          <ol className="mt-4 space-y-3">
            {history.map((item, index) => <li className="border-l-2 border-slate-200 pl-4 text-sm" key={`${item.created_at}-${index}`}>
              <p className="font-medium capitalize">{item.from_status ? `${item.from_status} → ` : ""}{item.to_status.replaceAll("_", " ")}</p>
              {item.reason && <p className="mt-1 text-slate-600">{item.reason}</p>}
              <p className="mt-1 text-xs text-slate-500">{item.actor_name || "System"} · {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: context.organization.timezone }).format(new Date(item.created_at))}</p>
            </li>)}
          </ol>
        ) : <p className="mt-3 text-sm text-slate-600">No status changes have been recorded.</p>}
      </section>

      <div className="mt-5">
        <RegistrationActions
          canRefund={canRefund}
          canCancel={canCancel}
          payment={payment}
          registration={{ ...registration, unit_price: data.plan.price }}
        />
      </div>
    </WorkspacePage>
  );
}
