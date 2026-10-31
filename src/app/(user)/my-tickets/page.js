import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { cancelRegistration } from "@/app/(user)/actions";
import { eventFromRelation, formatEventDate, getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { EmptyState, Panel, PortalHeading } from "@/components/user/portal-ui";
import PrintTicketButton from "@/components/user/print-ticket-button";

export const instant = false;
export const metadata = { title: "My tickets | KURO" };

const tabs = [
  ["upcoming", "Upcoming"],
  ["past", "Past"],
  ["cancelled", "Cancelled"],
  ["waitlisted", "Waitlisted"],
];

export default async function MyTicketsPage({ searchParams }) {
  await requireFeatureEnabled("my-tickets");
  const params = await searchParams;
  const selected = Array.isArray(params?.tab) ? params.tab[0] : params?.tab || "upcoming";
  const paymentState = Array.isArray(params?.payment) ? params.payment[0] : params?.payment;
  const activeTab = tabs.some(([id]) => id === selected) ? selected : "upcoming";
  const { supabase, user } = await getAttendeeSession();
  const { data, error } = await supabase
    .from("registrations")
    .select("id, status, ticket_type, registration_code, seat_number, booth_number, created_at, ticket_plan_id, quantity, ticket_unit_price, registration_tickets(ticket_number, qr_token, seat_number, status), events(id, title, start_date, end_date, venue_name, city, banner_url, status, ticket_price, currency, organizations(name, logo_url))")
    .eq("attendee_id", user.id)
    .order("created_at", { ascending: false });
  throwOnSupabaseError(error);
  const registrationIds = (data || []).map((ticket) => ticket.id);
  const { data: payments, error: paymentError } = registrationIds.length
    ? await supabase
      .from("payment_transactions")
      .select("registration_id, status, amount, currency, quantity, refund_status")
      .eq("user_id", user.id)
      .eq("payment_type", "event_ticket")
      .in("registration_id", registrationIds)
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  throwOnSupabaseError(paymentError);
  const paymentsByRegistration = new Map();
  for (const payment of payments || []) {
    if (!paymentsByRegistration.has(payment.registration_id)) {
      paymentsByRegistration.set(payment.registration_id, payment);
    }
  }

  const now = new Date();
  const tickets = data || [];
  const filtered = tickets.filter((ticket) => {
    const event = eventFromRelation(ticket.events);
    if (activeTab === "cancelled") return ticket.status === "cancelled";
    if (activeTab === "waitlisted") return ticket.status === "waitlisted";
    if (activeTab === "past") return event && new Date(event.end_date || event.start_date) < now && ticket.status !== "cancelled";
    return event && new Date(event.end_date || event.start_date) >= now && ["confirmed", "pending", "invited"].includes(ticket.status);
  });

  return (
    <div className="space-y-6">
      <PortalHeading title="My tickets" description="Your event registrations and ticket details." />
      {paymentState === "processing" && (
        <p className="rounded-md border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950" role="status">
          PayMongo returned you from checkout. Your ticket appears here once the signed payment confirmation is received.
        </p>
      )}
      {params?.email === "failed" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="status">
          Your registration is saved, but we could not send its confirmation email. Your ticket details are available below.
        </p>
      )}
      {params?.registered === "1" && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950" role="status">Your registration was received. Check its status below for approval and ticket details.</p>
      )}
      <nav aria-label="Ticket categories" className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <Link aria-current={activeTab === id ? "page" : undefined} className={`rounded-md border px-4 py-2 text-sm font-semibold ${activeTab === id ? "border-[#173d39] bg-[#173d39] text-white" : "border-[#cbd8d1] bg-white text-[#526864] hover:border-[#245c55]"}`} href={`/my-tickets?tab=${id}`} key={id}>{label}</Link>
        ))}
      </nav>
      {filtered.length ? (
        <div className="space-y-4">
          {filtered.map((ticket) => {
            const event = eventFromRelation(ticket.events);
            const payment = paymentsByRegistration.get(ticket.id);
            const registrationPrice = Number(ticket.ticket_unit_price ?? event?.ticket_price ?? 0);
            const paymentAmount = payment
              ? Number(payment.amount) / 100
              : registrationPrice * Number(ticket.quantity || 1);
            const eventEnd = new Date(event?.end_date || event?.start_date || 0);
            const hasUsableTicket = ticket.status === "confirmed"
              && payment?.status !== "refunded"
              && payment?.refund_status !== "succeeded"
              && event?.status !== "cancelled"
              && eventEnd >= now;
            const canCancel = ["confirmed", "pending", "waitlisted", "invited"].includes(ticket.status)
              && event
              && registrationPrice === 0
              && new Date(event.start_date) > now;
            return (
              <Panel className="!p-0" key={ticket.id}>
                <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:p-6">
                  <div>
                    {event?.banner_url && <div aria-label={`${event.title} event cover`} className="mb-4 h-40 w-full rounded-md bg-cover bg-center" role="img" style={{ backgroundImage: `url("${event.banner_url}")` }} />}
                    <p className="text-xs font-bold uppercase tracking-wide text-[#d6533d]">{ticket.ticket_type}</p>
                    <h2 className="mt-2 text-xl font-bold text-[#173d39]">{event?.title || "Event details unavailable"}</h2>
                    <p className="mt-2 text-sm text-[#61736e]">{event ? formatEventDate(event.start_date) : "Date unavailable"}</p>
                    <p className="mt-1 text-sm text-[#61736e]">{[event?.venue_name, event?.city].filter(Boolean).join(", ") || "Venue to be announced"}</p>
                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      {ticket.status !== "pending" && <p><span className="font-semibold text-[#526864]">Registration ID:</span> {ticket.registration_code}</p>}
                      <p><span className="font-semibold text-[#526864]">Status:</span> <span className="capitalize">{ticket.status.replaceAll("_", " ")}</span></p>
                      <p><span className="font-semibold text-[#526864]">Quantity:</span> {ticket.quantity || 1}</p>
                      <p><span className="font-semibold text-[#526864]">Payment:</span> <span className="capitalize">{payment?.status || (paymentAmount === 0 ? "free" : "not recorded")}</span></p>
                      <p><span className="font-semibold text-[#526864]">Amount:</span> {new Intl.NumberFormat("en-PH", { style: "currency", currency: payment?.currency || event?.currency || "PHP" }).format(paymentAmount)}</p>
                      {ticket.seat_number && <p><span className="font-semibold text-[#526864]">Seat:</span> {ticket.seat_number}</p>}
                      {ticket.booth_number && <p><span className="font-semibold text-[#526864]">Booth:</span> {ticket.booth_number}</p>}
                    </div>
                    {ticket.status === "pending" ? (
                      <p className="mt-4 rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                        {payment?.status === "paid"
                          ? "Your payment is verified, and the organizer must approve your registration before tickets are issued."
                          : paymentAmount === 0
                            ? "Your registration is awaiting organizer approval. Tickets will appear here once it is approved."
                            : payment?.status === "pending"
                              ? "Payment is still being verified. This is not a confirmed ticket; do not use it for event entry."
                              : `Payment ${payment?.status || "has not been verified"}. This is not a confirmed ticket; do not use it for event entry.`}
                      </p>
                    ) : null}
                    {payment?.refund_status === "pending" && (
                      <p className="mt-4 rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900">Your refund is being processed by PayMongo. The ticket remains valid until the refund is completed.</p>
                    )}
                    {payment?.status === "refunded" && (
                      <p className="mt-4 rounded-md bg-slate-100 p-3 text-xs leading-5 text-slate-700">This registration was refunded and cancelled. Its QR ticket is no longer valid.</p>
                    )}
                    {ticket.status === "confirmed" && ticket.registration_tickets?.length ? (
                      <div className="mt-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-[#173d39]">Your digital tickets</h3>
                          {ticket.registration_tickets.some((item) => item.status === "confirmed") && hasUsableTicket && <PrintTicketButton />}
                        </div>
                        <div className="flex flex-wrap gap-3">
                        {ticket.registration_tickets.map((registrationTicket) => (
                          <div className="grid justify-items-center gap-1 rounded-md border border-[#dce4dc] p-3" key={registrationTicket.ticket_number}>
                            {registrationTicket.status === "confirmed" && hasUsableTicket
                              ? <QRCodeSVG aria-label={`QR ticket ${registrationTicket.ticket_number}`} value={registrationTicket.qr_token} size={132} />
                              : <span className="flex size-[132px] items-center justify-center rounded bg-slate-100 px-4 text-center text-xs font-semibold capitalize text-slate-600">{registrationTicket.status === "confirmed" && event?.status === "cancelled" ? "Event cancelled" : registrationTicket.status === "confirmed" && eventEnd < now ? "Event ended" : registrationTicket.status.replaceAll("_", " ")}</span>}
                            <span className="text-xs font-bold">{registrationTicket.ticket_number}</span>
                            {registrationTicket.seat_number && <span className="text-xs text-[#61736e]">Seat {registrationTicket.seat_number}</span>}
                          </div>
                        ))}
                        </div>
                      </div>
                    ) : null}
                    {payment && ["failed", "expired", "cancelled"].includes(payment.status) && (
                      <p className="mt-4 rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                        Payment {payment.status}. The pending ticket reservation was released.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:items-stretch">
                    {event?.venue_name && (
                      <a className="rounded-md border border-[#cbd8d1] px-4 py-2.5 text-center text-sm font-semibold text-[#245c55] hover:bg-[#f4f6f1]" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.venue_name, event.city].filter(Boolean).join(", "))}`} rel="noreferrer" target="_blank">Get directions</a>
                    )}
                    {canCancel && (
                      <form action={cancelRegistration}>
                        <input name="registration_id" type="hidden" value={ticket.id} />
                        <button className="w-full rounded-md border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50" type="submit">Cancel registration</button>
                      </form>
                    )}
                    {ticket.status === "confirmed" && event && registrationPrice > 0 && (
                      <p className="rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                        Paid ticket cancellation and refunds are not available online. Contact the event organizer for assistance.
                      </p>
                    )}
                    <Link className="rounded-md border border-[#cbd8d1] px-4 py-2.5 text-center text-sm font-semibold text-[#245c55] hover:bg-[#f4f6f1]" href="/browse-events">Browse events</Link>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <EmptyState title={activeTab === "upcoming" ? "No upcoming tickets" : `No ${activeTab} tickets`} description={activeTab === "upcoming" ? "When you register for an event, your ticket details will appear here." : "Tickets that match this category will appear here."} />
      )}
      <p className="text-xs leading-5 text-[#7a8b84]">Registration and payment confirmation emails are sent when enabled in your notification settings. Apple/Google Wallet, ticket transfers, and upgrades are not integrated in this preview.</p>
    </div>
  );
}
