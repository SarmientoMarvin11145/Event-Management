import Link from "next/link";
import { addFavorite, registerForEvent, removeFavorite } from "@/app/(user)/actions";
import {
  eventFromRelation,
  formatEventDate,
  organizationFromRelation,
} from "@/lib/attendee-data";

export function PortalHeading({ eyebrow = "Your KURO account", title, description, action }) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#173d39]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#61736e]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "" }) {
  return <section className={`kuro-panel rounded-md border border-[#dce4dc] bg-white p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function EmptyState({ title, description, href = "/events", action = "Browse events" }) {
  return (
    <div className="kuro-panel rounded-md border border-dashed border-[#cbd8d1] bg-white px-6 py-10 text-center">
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
  const registrationOpensAt = event.registration_opens_at
    ? new Date(event.registration_opens_at).getTime()
    : null;
  const registrationDeadline = event.registration_deadline
    ? new Date(event.registration_deadline).getTime()
    : null;
  const registrationWindowOpen = (registrationOpensAt === null || registrationOpensAt <= now)
    && (registrationDeadline === null || registrationDeadline >= now);
  const isUpcoming = Number.isFinite(startTime) && startTime > now;
  const isActive = Number.isFinite(endTime) && endTime >= now;
  const isPaid = Number(event.ticket_price || 0) > 0;
  const canRegister = event.status === "published"
    && isUpcoming
    && isActive
    && registrationWindowOpen
    && !isPaid
    && !event.venue_id;

  return (
    <article className="kuro-panel overflow-hidden rounded-md border border-[#dce4dc] bg-white">
      {event.banner_url ? (
        <div className="h-36 bg-cover bg-center" role="img" aria-label={`${event.title} event banner`} style={{ backgroundImage: `url("${event.banner_url}")` }} />
      ) : (
        <div className="flex h-36 items-end bg-[#e8eee7] p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[#526864]">{organization?.name || "KURO event"}</span>
        </div>
      )}
      <div className="p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[#d6533d]">{organization?.name || "KURO event"}</p>
        <h2 className="mt-2 text-lg font-bold leading-snug text-[#173d39]">
          {event.slug ? <Link href={`/e/${event.slug}`}>{event.title}</Link> : event.title}
        </h2>
        <p className="mt-2 text-sm text-[#61736e]">{formatEventDate(event.start_date)}</p>
        <p className="mt-1 text-sm text-[#61736e]">{[event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be announced"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {registration ? (
            <span className="rounded-md bg-[#edf4eb] px-3 py-2 text-xs font-bold text-[#245c55]">
              {registration.status.replaceAll("_", " ")}
            </span>
          ) : event.status === "published" && isUpcoming && isActive && registrationWindowOpen && event.venue_id && event.slug ? (
            <Link className="rounded-md bg-[#ed6148] px-3 py-2 text-xs font-bold text-white hover:bg-[#d74d37]" href={`/e/${event.slug}`}>Choose a seat</Link>
          ) : event.status === "published" && isUpcoming && isActive && registrationWindowOpen && isPaid && event.slug ? (
            <Link className="rounded-md bg-[#ed6148] px-3 py-2 text-xs font-bold text-white hover:bg-[#d74d37]" href={`/e/${event.slug}`}>{event.currency === "PHP" ? "Buy ticket" : "View event"}</Link>
          ) : canRegister ? (
            <form action={registerForEvent}>
              <input name="event_id" type="hidden" value={event.id} />
              <button className="rounded-md bg-[#ed6148] px-3 py-2 text-xs font-bold text-white hover:bg-[#d74d37]" type="submit">Register</button>
            </form>
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
    <div className="kuro-panel rounded-md border border-[#dce4dc] bg-white p-5">
      <p className="text-sm font-semibold text-[#61736e]">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-[#173d39]">{value}</p>
      {detail && <p className="mt-1 text-xs text-[#7a8b84]">{detail}</p>}
    </div>
  );
}

export function StatusMessage({ children, tone = "info" }) {
  const style = tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : "border-amber-200 bg-amber-50 text-amber-950";
  return <p aria-live="polite" className={`rounded-md border px-4 py-3 text-sm ${style}`} role="status">{children}</p>;
}
