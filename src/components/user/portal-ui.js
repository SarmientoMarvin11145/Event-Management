import Link from "next/link";
import { addFavorite, removeFavorite } from "@/app/(user)/actions";
import {
  eventFromRelation,
  formatEventDate,
  organizationFromRelation,
} from "@/lib/attendee-data";
import { isEventRegistrationAvailable } from "@/lib/event-registration";

export function PortalHeading({ eyebrow = "Your KURO account", title, description, action }) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#d6533d] sm:text-xs">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-black tracking-tight text-[#173d39] sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#61736e]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "", id }) {
  return <section className={`kuro-panel rounded-2xl border border-[#dce4dc] bg-white p-4 shadow-sm sm:p-6 ${className}`} id={id}>{children}</section>;
}

export function EmptyState({ title, description, href = "/browse-events", action = "Browse events" }) {
  return (
    <div className="kuro-panel rounded-2xl border border-dashed border-[#cbd8d1] bg-white px-6 py-10 text-center shadow-sm">
      <p aria-hidden="true" className="text-3xl">✦</p>
      <h2 className="mt-3 text-lg font-bold text-[#173d39]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#61736e]">{description}</p>
      <Link className="mt-5 inline-flex rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#245c55]" href={href}>
        {action}
      </Link>
    </div>
  );
}

export function EventCard({ event: eventValue, registration, favorite = false }) {
  const event = eventFromRelation(eventValue);
  if (!event) return null;
  const organization = organizationFromRelation(event.organizations);
  const now = new Date().getTime();
  const startTime = new Date(event.start_date).getTime();
  const endTime = new Date(event.end_date || startTime + 60 * 60 * 1000).getTime();
  const registrationAvailable = isEventRegistrationAvailable(event, now);
  const isActive = Number.isFinite(endTime) && endTime >= now;

  return (
    <article className="kuro-panel group flex overflow-hidden rounded-2xl border border-[#dce4dc] bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:block">
      {event.banner_url ? (
      <div className="h-auto min-h-36 w-28 shrink-0 bg-cover bg-center sm:h-40 sm:w-auto" role="img" aria-label={`${event.title} event banner`} style={{ backgroundImage: `url("${event.banner_url}")` }} />
      ) : (
      <div className="flex min-h-36 w-28 shrink-0 items-end bg-gradient-to-br from-[#dbe9df] via-[#edf2e9] to-[#f8d9cf] p-3 sm:h-40 sm:w-auto sm:p-4">
        <span className="hidden text-xs font-bold uppercase tracking-wider text-[#526864] sm:block">{organization?.name || "KURO event"}</span>
        </div>
      )}
    <div className="min-w-0 flex-1 p-3 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[#d6533d]">{organization?.name || "KURO event"}</p>
      <h2 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-[#173d39] sm:mt-2 sm:text-lg">
          {event.slug ? <Link href={`/e/${event.slug}`}>{event.title}</Link> : event.title}
        </h2>
      <p className="mt-2 text-xs text-[#61736e] sm:text-sm">{formatEventDate(event.start_date)}</p>
      <p className="mt-1 line-clamp-1 text-xs text-[#61736e] sm:text-sm">{[event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be announced"}</p>
      <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
          {registration ? (
            <span className="rounded-md bg-[#edf4eb] px-3 py-2 text-xs font-bold text-[#245c55]">
              {registration.status.replaceAll("_", " ")}
            </span>
          ) : event.status === "published" && registrationAvailable && isActive && event.slug ? (
            <Link className="rounded-md bg-[#ed6148] px-3 py-2 text-xs font-bold text-white hover:bg-[#d74d37]" href={`/e/${event.slug}/register`}>Register now</Link>
          ) : (
            <span className="rounded-md bg-[#f3f5f1] px-3 py-2 text-xs font-semibold text-[#61736e]">Registration unavailable</span>
          )}
          {favorite ? (
            <form action={removeFavorite}>
              <input name="event_id" type="hidden" value={event.id} />
              <button className="rounded-md border border-[#cbd8d1] px-3 py-2 text-xs font-semibold text-[#526864] hover:border-[#245c55]" type="submit">Remove saved</button>
            </form>
          ) : (
            <form action={addFavorite}>
              <input name="event_id" type="hidden" value={event.id} />
              <button className="rounded-md border border-[#cbd8d1] px-3 py-2 text-xs font-semibold text-[#526864] hover:border-[#245c55]" type="submit">Save event</button>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}

export function StatCard({ label, value, detail }) {
  return (
    <div className="kuro-panel relative overflow-hidden rounded-2xl border border-[#dce4dc] bg-white p-4 shadow-sm sm:p-5">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#245c55] to-[#ed6148]" />
      <p className="text-xs font-semibold text-[#61736e] sm:text-sm">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-[#173d39] sm:text-4xl">{value}</p>
      {detail && <p className="mt-1 text-[11px] text-[#7a8b84] sm:text-xs">{detail}</p>}
    </div>
  );
}

export function StatusMessage({ children, tone = "info" }) {
  const style = tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : "border-amber-200 bg-amber-50 text-amber-950";
  return <p aria-live="polite" className={`rounded-md border px-4 py-3 text-sm ${style}`} role="status">{children}</p>;
}
