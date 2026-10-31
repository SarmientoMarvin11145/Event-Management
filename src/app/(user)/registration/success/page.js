import Link from "next/link";
import { notFound } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";

export const metadata = { title: "Registration confirmed | KURO" };

export default async function RegistrationSuccessPage({ searchParams }) {
  await requireFeatureEnabled("my-tickets");
  const params = await searchParams;
  const registrationId = Array.isArray(params?.registrationId) ? params.registrationId[0] : params?.registrationId;
  if (!registrationId) notFound();
  const { supabase, user } = await getAttendeeSession();
  const { data: registration, error } = await supabase
    .from("registrations")
    .select("id, status, registration_code, ticket_type, quantity, events(title, start_date, venue_name), registration_tickets(ticket_number, qr_token, seat_number)")
    .eq("id", registrationId)
    .eq("attendee_id", user.id)
    .maybeSingle();
  throwOnSupabaseError(error);
  if (!registration) notFound();
  const { data: payment, error: paymentError } = await supabase
    .from("payment_transactions")
    .select("status")
    .eq("registration_id", registration.id)
    .eq("user_id", user.id)
    .eq("payment_type", "event_ticket")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwOnSupabaseError(paymentError);
  const pendingMessage = payment?.status === "paid"
    ? "Payment is verified. Your registration is awaiting organizer approval; tickets will appear here once it is approved."
    : payment
      ? "Payment confirmation is pending. Your tickets will appear here after the verified payment notification arrives."
      : "Your registration is awaiting organizer approval. Tickets will appear here once it is approved.";

  return (
    <main className="min-h-[70vh] bg-[#fbfcf8] px-4 py-12 text-[#173d39] sm:px-6">
      <div className="mx-auto max-w-3xl rounded-xl border border-[#dce4dc] bg-white p-6 shadow-sm sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#d6533d]">{registration.status === "confirmed" ? "Registration complete" : "Registration received"}</p>
        <h1 className="mt-2 text-3xl font-bold">{registration.status === "confirmed" ? "You're registered" : "Your registration is pending"}</h1>
        <p className="mt-3 text-sm leading-6 text-[#61736e]">Your registration reference is <strong>{registration.registration_code}</strong>{registration.status === "confirmed" ? ". Present an individual QR ticket at check-in." : "."}</p>
        <section className="mt-6 rounded-lg bg-[#f4f6f1] p-4">
          <h2 className="font-bold">{registration.events?.title || "Event"}</h2>
          <p className="mt-1 text-sm text-[#61736e]">{registration.ticket_type} · {registration.quantity} ticket{registration.quantity === 1 ? "" : "s"}</p>
        </section>
        {registration.status === "confirmed" && registration.registration_tickets?.length ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {registration.registration_tickets.map((ticket) => (
              <div className="grid justify-items-center gap-2 rounded-lg border border-[#dce4dc] p-4" key={ticket.ticket_number}>
                <QRCodeSVG aria-label={`QR ticket ${ticket.ticket_number}`} value={ticket.qr_token} size={172} />
                <p className="text-sm font-bold">{ticket.ticket_number}</p>
                {ticket.seat_number && <p className="text-xs text-[#61736e]">Seat {ticket.seat_number}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-md bg-sky-50 p-4 text-sm text-sky-950" role="status">{pendingMessage}</p>
        )}
        <Link className="mt-6 inline-flex rounded-md bg-[#173d39] px-5 py-3 text-sm font-bold text-white" href="/my-tickets">View my tickets</Link>
      </div>
    </main>
  );
}
