import Link from "next/link";
import { cancelRegistration } from "@/app/(user)/actions";
import { eventFromRelation, formatEventDate, getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { EmptyState, Panel, PortalHeading } from "@/components/user/portal-ui";

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
  const activeTab = tabs.some(([id]) => id === selected) ? selected : "upcoming";
  const { supabase, user } = await getAttendeeSession();
  const { data, error } = await supabase
    .from("registrations")
    .select("id, status, ticket_type, registration_code, seat_number, booth_number, created_at, events(id, title, start_date, end_date, venue_name, city, banner_url, status, organizations(name, logo_url))")
    .eq("attendee_id", user.id)
    .order("created_at", { ascending: false });
  throwOnSupabaseError(error);

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
      <nav aria-label="Ticket categories" className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <Link aria-current={activeTab === id ? "page" : undefined} className={`rounded-md border px-4 py-2 text-sm font-semibold ${activeTab === id ? "border-[#173d39] bg-[#173d39] text-white" : "border-[#cbd8d1] bg-white text-[#526864] hover:border-[#245c55]"}`} href={`/my-tickets?tab=${id}`} key={id}>{label}</Link>
        ))}
      </nav>
      {filtered.length ? (
        <div className="space-y-4">
          {filtered.map((ticket) => {
            const event = eventFromRelation(ticket.events);
            const canCancel = ["confirmed", "pending", "waitlisted", "invited"].includes(ticket.status)
              && event && new Date(event.start_date) > now;
            return (
              <Panel className="!p-0" key={ticket.id}>
                <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:p-6">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#d6533d]">{ticket.ticket_type}</p>
                    <h2 className="mt-2 text-xl font-bold text-[#173d39]">{event?.title || "Event details unavailable"}</h2>
                    <p className="mt-2 text-sm text-[#61736e]">{event ? formatEventDate(event.start_date) : "Date unavailable"}</p>
                    <p className="mt-1 text-sm text-[#61736e]">{[event?.venue_name, event?.city].filter(Boolean).join(", ") || "Venue to be announced"}</p>
                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      <p><span className="font-semibold text-[#526864]">Registration ID:</span> {ticket.registration_code}</p>
                      <p><span className="font-semibold text-[#526864]">Status:</span> <span className="capitalize">{ticket.status.replaceAll("_", " ")}</span></p>
                      {ticket.seat_number && <p><span className="font-semibold text-[#526864]">Seat:</span> {ticket.seat_number}</p>}
                      {ticket.booth_number && <p><span className="font-semibold text-[#526864]">Booth:</span> {ticket.booth_number}</p>}
                    </div>
                    <p className="mt-4 rounded-md bg-[#f4f6f1] p-3 text-xs leading-5 text-[#61736e]">
                      Keep this registration ID for reference. Scannable QR tickets, wallet passes, and PDF downloads require the organizer check-in and ticket-issuance workflows, which are not active yet.
                    </p>
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
                    <Link className="rounded-md border border-[#cbd8d1] px-4 py-2.5 text-center text-sm font-semibold text-[#245c55] hover:bg-[#f4f6f1]" href="/events">Browse events</Link>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <EmptyState title={activeTab === "upcoming" ? "No upcoming tickets" : `No ${activeTab} tickets`} description={activeTab === "upcoming" ? "When you register for an event, your ticket details will appear here." : "Tickets that match this category will appear here."} />
      )}
      <p className="text-xs leading-5 text-[#7a8b84]">Ticket emails, Apple/Google Wallet, ticket transfers, and upgrades are not integrated in this preview.</p>
    </div>
  );
}
