import Link from "next/link";
import { submitEventReview } from "@/app/(user)/actions";
import { eventFromRelation, formatEventDate, getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { EmptyState, Panel, PortalHeading, StatusMessage } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Event history | KURO" };

export default async function HistoryPage({ searchParams }) {
  await requireFeatureEnabled("event-history");
  const params = await searchParams;
  const { supabase, user } = await getAttendeeSession();
  const [{ data: registrations, error }, { data: reviews, error: reviewsError }] = await Promise.all([
    supabase.from("registrations").select("id, status, events(id, title, start_date, end_date, banner_url, organizations(name)), attendance_logs(check_in_time, check_out_time)").eq("attendee_id", user.id).order("created_at", { ascending: false }),
    supabase.from("event_reviews").select("event_id, rating").eq("user_id", user.id),
  ]);
  throwOnSupabaseError(error);
  throwOnSupabaseError(reviewsError);
  const reviewMap = new Map((reviews || []).map((review) => [review.event_id, review]));
  const now = new Date();
  const history = (registrations || []).filter((row) => {
    const event = eventFromRelation(row.events);
    return event && new Date(event.end_date || event.start_date) < now;
  });

  return (
    <div className="space-y-6">
      <PortalHeading title="Event history" description="Past registrations, check-in records, and event feedback." action={<a className="rounded-md border border-[#cbd8d1] bg-white px-4 py-2.5 text-sm font-bold text-[#245c55]" href="/history/export">Download CSV</a>} />
      {params?.reviewed && <StatusMessage tone="success">Your event review has been saved.</StatusMessage>}
      {history.length ? (
        <div className="space-y-4">
          {history.map((registration) => {
            const event = eventFromRelation(registration.events);
            const attendance = Array.isArray(registration.attendance_logs) ? registration.attendance_logs[0] : registration.attendance_logs;
            const review = reviewMap.get(event.id);
            const status = attendance ? "Attended" : registration.status === "cancelled" ? "Cancelled" : "No attendance recorded";
            return (
              <Panel key={registration.id}>
                <div className="flex flex-col justify-between gap-4 sm:flex-row">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#d6533d]">{status}</p>
                    <h2 className="mt-1 text-lg font-bold text-[#173d39]">{event.title}</h2>
                    <p className="mt-1 text-sm text-[#61736e]">{formatEventDate(event.start_date)}</p>
                    {attendance && <p className="mt-2 text-xs leading-5 text-[#61736e]">Check-in: {formatEventDate(attendance.check_in_time)}{attendance.check_out_time ? ` · Check-out: ${formatEventDate(attendance.check_out_time)}` : ""}</p>}
                  </div>
                  {review ? (
                    <p className="text-sm font-semibold text-[#526864]">Your rating: {review.rating}/5</p>
                  ) : attendance ? (
                    <form action={submitEventReview} className="grid gap-2 sm:w-64">
                      <input name="event_id" type="hidden" value={event.id} />
                      <label className="text-sm font-semibold text-[#526864]" htmlFor={`rating-${registration.id}`}>Rate your event</label>
                      <select className="kuro-input rounded-md border border-[#cbd8d1] bg-white px-3 py-2 text-sm" id={`rating-${registration.id}`} name="rating">
                        <option value="5">5 - Excellent</option><option value="4">4 - Good</option><option value="3">3 - Average</option><option value="2">2 - Poor</option><option value="1">1 - Very poor</option>
                      </select>
                      <label className="sr-only" htmlFor={`comment-${registration.id}`}>Optional feedback</label>
                      <textarea className="kuro-input rounded-md border border-[#cbd8d1] bg-white px-3 py-2 text-sm" id={`comment-${registration.id}`} maxLength={2000} name="comment" placeholder="Optional feedback" rows={2} />
                      <button className="rounded-md bg-[#173d39] px-3 py-2 text-sm font-bold text-white" type="submit">Submit rating</button>
                    </form>
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No event history yet" description="Past events, attendance details, and feedback opportunities will appear here." href="/events" />
      )}
      <p className="text-xs leading-5 text-[#7a8b84]">Attendance is recorded only after an organizer check-in. Request an official attendance report from the event organizer if you need one.</p>
    </div>
  );
}
