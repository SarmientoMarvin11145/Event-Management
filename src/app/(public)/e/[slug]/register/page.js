import { connection } from "next/server";
import { notFound } from "next/navigation";
import EventRegistrationWizard from "@/components/events/event-registration-wizard";
import { getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";

export const metadata = { title: "Event registration | KURO" };
export const instant = false;

export default async function EventRegistrationPage({ params, searchParams }) {
  await connection();
  const [{ slug }, query, { supabase, user }] = await Promise.all([params, searchParams, getAttendeeSession()]);
  const [
    { data: event, error: eventError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    supabase
      .from("events")
      .select("id, slug, title, short_description, start_date, venue_name, city, currency, status, venue_id, registration_opens_at, registration_deadline")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle(),
    supabase.from("profiles").select("full_name, phone, street_address").eq("id", user.id).maybeSingle(),
  ]);
  throwOnSupabaseError(eventError);
  throwOnSupabaseError(profileError);
  if (!event) notFound();

  const { data: plans, error: plansError } = await supabase.rpc("get_event_ticket_plans", { p_event_id: event.id });
  throwOnSupabaseError(plansError);
  let seatMap = null;
  if (event.venue_id) {
    const { data, error } = await supabase.rpc("get_event_seat_map", { p_event_id: event.id });
    throwOnSupabaseError(error);
    seatMap = data;
  }
  const preselectedSeat = Array.isArray(query?.seat) ? query.seat[0] : query?.seat || "";
  const paymentState = Array.isArray(query?.payment) ? query.payment[0] : query?.payment;
  const paymentReference = Array.isArray(query?.reference) ? query.reference[0] : query?.reference;
  return <EventRegistrationWizard email={user.email || ""} event={event} paymentReference={paymentReference} paymentState={paymentState} plans={plans || []} preselectedSeat={preselectedSeat} profile={profile} seatMap={seatMap} />;
}
