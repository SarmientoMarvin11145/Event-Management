"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { addFavorite } from "@/app/(user)/actions";
import EventSeatMap from "@/components/public/event-seat-map";
import { isEventRegistrationAvailable } from "@/lib/event-registration";

export default function PublicEventDetails({ slug }) {
  const [event, setEvent] = useState(null);
  const [status, setStatus] = useState("loading");
  const [seatMapState, setSeatMapState] = useState({ eventId: null, data: null, status: "idle" });
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      const { data, error } = await supabase
        .from("events")
        .select("id, slug, title, short_description, description, category, banner_url, start_date, end_date, venue_name, city, currency, venue_id, registration_opens_at, registration_deadline, organizations(name, logo_url)")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      if (!active) {
        return;
      }

      if (error) {
        setStatus("unavailable");
        return;
      }

      if (!data) {
        setStatus("missing");
        return;
      }
      const { data: summaries, error: summaryError } = await supabase.rpc("get_event_ticket_summary", {
        p_event_ids: [data.id],
      });
      if (!active) return;
      if (summaryError) {
        console.error("Unable to load public ticket availability.", summaryError);
        setStatus("unavailable");
        return;
      }
      const summary = summaries?.[0];
      setEvent({
        ...data,
        starting_price: summary?.starting_price ?? null,
        available_quantity: summary ? summary.available_quantity : 0,
      });
      setStatus("ready");
    }

    loadEvent();

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!event?.venue_id) return;

    let active = true;
    supabase.rpc("get_event_seat_map", { p_event_id: event.id }).then(({ data, error }) => {
      if (!active) return;
      setSeatMapState({
        eventId: event.id,
        data: data || null,
        status: error || !data ? "unavailable" : "ready",
      });
    }).catch((error) => {
      if (!active) return;
      console.error("Unable to load event seat availability.", error);
      setSeatMapState({ eventId: event.id, data: null, status: "unavailable" });
    });

    return () => {
      active = false;
    };
  }, [event]);

  if (status === "loading") {
    return <main className="min-h-[70vh] px-5 py-20 text-center text-sm text-[#61736e]" role="status">Loading event...</main>;
  }

  if (status !== "ready" || !event) {
    return (
      <main className="min-h-[70vh] px-5 py-20 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">KURO events</p>
        <h1 className="mt-3 text-3xl font-bold text-[#173d39]">{status === "missing" ? "Event not found" : "Event details unavailable"}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#61736e]">
          This event may have ended, been unpublished, or is not available yet.
        </p>
        <Link className="mt-6 inline-flex rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white" href="/events">Browse events</Link>
      </main>
    );
  }

  const organization = Array.isArray(event.organizations)
    ? event.organizations[0]
    : event.organizations;
  const dateLabel = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(event.start_date));
  const seatMapStatus = event.venue_id
    ? seatMapState.eventId === event.id ? seatMapState.status : "loading"
    : "idle";
  const seatMap = seatMapState.eventId === event.id ? seatMapState.data : null;
  const registrationAvailable = isEventRegistrationAvailable(event);
  const ticketsAvailable = event.starting_price !== null && event.available_quantity !== 0;
  const formattedPrice = event.starting_price === null
    ? null
    : new Intl.NumberFormat("en-PH", { style: "currency", currency: event.currency || "PHP" }).format(event.starting_price);
  const mobileDateLabel = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(event.start_date));
  const locationLabel = [event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be announced";

  async function shareEvent() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text: event.short_description || event.title, url });
        setShareStatus("");
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareStatus("Event link copied");
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error("Unable to share event.", error);
      setShareStatus("Unable to share this event.");
    }
  }

  return (
    <main className="kuro-page min-h-[70vh] bg-[#f7f8f4] pb-24 text-[#173d39] lg:pb-0">
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#e2e8e1] bg-white px-4 lg:hidden">
        <Link aria-label="Back to events" className="flex size-10 items-center justify-center rounded-full text-2xl text-[#173d39] hover:bg-[#f4f6f1]" href="/events">
          <span aria-hidden="true">&#8592;</span>
        </Link>
        <h1 className="text-sm font-bold text-[#173d39]">Event details</h1>
        <div className="flex items-center gap-1">
          <form action={addFavorite}>
            <input name="event_id" type="hidden" value={event.id} />
            <button aria-label="Save event" className="flex size-10 items-center justify-center rounded-full text-xl text-[#173d39] hover:bg-[#f4f6f1]" type="submit">&#9825;</button>
          </form>
          <button aria-label="Share event" className="flex size-10 items-center justify-center rounded-full text-xl text-[#173d39] hover:bg-[#f4f6f1]" onClick={shareEvent} type="button">&#8599;</button>
        </div>
      </div>
      {shareStatus && <p aria-live="polite" className="sr-only" role="status">{shareStatus}</p>}
      <section className="relative isolate hidden overflow-hidden bg-[#153a35] lg:block">
        {event.banner_url && (
          <div aria-label={`${event.title} event banner`} className="absolute inset-0 -z-20 bg-cover bg-center" role="img" style={{ backgroundImage: `url("${event.banner_url}")` }} />
        )}
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#10201e]/95 via-[#10201e]/85 to-[#10201e]/65 sm:to-[#10201e]/45" />
        <div className="mx-auto max-w-7xl px-4 py-6 text-white sm:px-8 sm:py-14">
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-white/75 hover:text-white" href="/events">
            <span aria-hidden="true">&#8592;</span> Explore events
          </Link>
          <div className="mt-6 max-w-4xl sm:mt-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#ffcf72] backdrop-blur sm:text-xs">
              <span className="size-1.5 rounded-full bg-[#ffcf72]" /> {organization?.name || "KURO organizer"}
            </p>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:mt-5 sm:text-5xl lg:text-6xl">{event.title}</h1>
            {event.short_description && <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 sm:mt-4 sm:text-lg sm:leading-7">{event.short_description}</p>}
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-white/85 sm:mt-6 sm:gap-3 sm:text-sm">
              <span className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 backdrop-blur sm:px-3">&#9719; {dateLabel}</span>
              <span className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 backdrop-blur sm:px-3">&#9906; {[event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be announced"}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl items-start gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="min-w-0">
          <section aria-label={`${event.title} event banner`} className="relative mb-5 h-52 overflow-hidden rounded-2xl bg-gradient-to-br from-[#173d39] via-[#245c55] to-[#ed6148] shadow-sm sm:h-72 lg:hidden" role="img" style={event.banner_url ? { backgroundImage: `url("${event.banner_url}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>
            {!event.banner_url && <span className="absolute inset-0 bg-gradient-to-t from-[#102d2a]/60 to-transparent" />}
          </section>
          <section className="mb-6 lg:hidden">
            {event.category && <p className="inline-flex rounded-full bg-[#eeeaff] px-3 py-1.5 text-xs font-bold capitalize text-[#5140b8]">{event.category.replaceAll("_", " ")}</p>}
            <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight text-[#17201f]">{event.title}</h2>
            <div className="mt-4 space-y-4">
              <p className="flex items-start gap-3 text-sm font-semibold text-[#293432]">
                <span aria-hidden="true" className="text-lg leading-5 text-[#526864]">&#9719;</span>
                <span>{mobileDateLabel}{event.end_date && ` – ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.end_date))}`}</span>
              </p>
              <p className="flex items-start gap-3 text-sm font-semibold text-[#293432]">
                <span aria-hidden="true" className="text-lg leading-5 text-[#526864]">&#9906;</span>
                <span>{locationLabel}</span>
              </p>
              <p className="flex items-start gap-3 text-sm font-bold text-[#17201f]">
                <span aria-hidden="true" className="text-lg leading-5 text-[#526864]">&#9830;</span>
                <span>{formattedPrice ? `${formattedPrice}${Number(event.starting_price) === 0 ? "" : " onwards"}` : "Tickets unavailable"}</span>
              </p>
            </div>
          </section>
          <section className="kuro-panel rounded-2xl border border-[#dce4dc] bg-white p-5 shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">The experience</p>
            <h2 className="mt-2 text-xl font-bold text-[#173d39]">About</h2>
            {event.description ? (
              <>
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-[#526864] lg:hidden">{event.description}</p>
                <details className="mt-2 lg:hidden">
                  <summary className="cursor-pointer text-sm font-bold text-[#5140b8]">Read more</summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#526864]">{event.description}</p>
                </details>
                <div className="mt-3 hidden whitespace-pre-wrap text-sm leading-7 text-[#526864] lg:block">{event.description}</div>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[#526864]">The organizer has not added an event description yet.</p>
            )}
          </section>

          <section className="mt-5 hidden gap-3 sm:grid-cols-2 lg:grid">
            <div className="kuro-panel rounded-2xl border border-[#dce4dc] bg-white p-5">
              <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-[#edf2e9] text-lg text-[#245c55]">&#9719;</span>
              <h2 className="mt-4 text-sm font-bold text-[#173d39]">Date and time</h2>
              <p className="mt-1 text-sm leading-6 text-[#61736e]">{dateLabel}</p>
            </div>
            <div className="kuro-panel rounded-2xl border border-[#dce4dc] bg-white p-5">
              <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-[#fbe9e3] text-lg text-[#d6533d]">&#9906;</span>
              <h2 className="mt-4 text-sm font-bold text-[#173d39]">Where it happens</h2>
              <p className="mt-1 text-sm leading-6 text-[#61736e]">{[event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be announced"}</p>
            </div>
          </section>

          {event.venue_id && (
            <section className="kuro-panel mt-5 rounded-2xl border border-[#dce4dc] bg-white p-5 sm:p-8">
              <h2 className="text-xl font-bold text-[#173d39]">Choose your seat</h2>
              <p className="mt-1 text-sm text-[#61736e]">Select a seat to include it with your ticket registration.</p>
              <EventSeatMap event={event} seatMap={seatMap} status={seatMapStatus} />
            </section>
          )}
        </article>

        <aside className="kuro-panel hidden rounded-2xl border border-[#dce4dc] bg-white p-5 shadow-xl shadow-[#173d39]/10 sm:p-6 lg:sticky lg:top-24 lg:block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#d6533d]">Tickets</p>
              {formattedPrice ? (
                <p className="mt-2 text-3xl font-black tracking-tight text-[#173d39]">
                  {Number(event.starting_price) === 0 ? "Free" : formattedPrice}
                  {Number(event.starting_price) !== 0 && <span className="ml-1 text-sm font-medium text-[#61736e]">and up</span>}
                </p>
              ) : (
                <p className="mt-2 text-xl font-bold text-[#173d39]">Tickets unavailable</p>
              )}
            </div>
            <span className="rounded-full bg-[#edf2e9] px-3 py-1.5 text-xs font-bold text-[#245c55]">Secure registration</span>
          </div>
          <div className="mt-5 space-y-3 border-y border-[#edf0eb] py-5 text-sm">
            <p className="flex items-start gap-3 text-[#526864]"><span aria-hidden="true" className="mt-0.5 text-[#245c55]">&#9719;</span><span>{dateLabel}</span></p>
            <p className="flex items-start gap-3 text-[#526864]"><span aria-hidden="true" className="mt-0.5 text-[#245c55]">&#9906;</span><span>{locationLabel}</span></p>
            <p className="flex items-start gap-3 text-[#526864]"><span aria-hidden="true" className="mt-0.5 text-[#245c55]">&#10003;</span><span>{event.available_quantity == null ? "Tickets available" : `${Number(event.available_quantity).toLocaleString()} tickets remaining`}</span></p>
          </div>
          {registrationAvailable && ticketsAvailable ? (
            <Link className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ed6148] px-5 py-4 text-sm font-bold text-white shadow-lg shadow-[#ed6148]/20 transition hover:-translate-y-0.5 hover:bg-[#d74d37]" href={`/e/${event.slug}/register`}>
              {Number(event.starting_price) === 0 ? "Reserve your free ticket" : "Choose tickets"} <span aria-hidden="true">&#8594;</span>
            </Link>
          ) : (
            <p className="mt-5 rounded-xl bg-[#f3f5f1] px-4 py-3 text-center text-sm font-semibold text-[#61736e]">
              {!registrationAvailable ? "Registration is not currently open." : "Tickets are currently unavailable."}
            </p>
          )}
          <p className="mt-3 text-center text-xs leading-5 text-[#7a8b84]">Your registration and ticket details will be available in your KURO account.</p>
          <form action={addFavorite} className="mt-4">
            <input name="event_id" type="hidden" value={event.id} />
            <button className="w-full rounded-xl border border-[#cbd8d1] px-4 py-3 text-sm font-bold text-[#245c55] transition hover:border-[#245c55] hover:bg-[#f4f6f1]" type="submit">♡ <span className="ml-1">Save event</span></button>
          </form>
        </aside>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e2e8e1] bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(23,61,57,0.10)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#71817b]">Tickets from</p>
            <p className="truncate text-sm font-black text-[#173d39]">{formattedPrice || "Unavailable"}</p>
          </div>
          {registrationAvailable && ticketsAvailable ? (
            <Link className="shrink-0 rounded-xl bg-[#ed6148] px-5 py-3 text-sm font-bold text-white" href={`/e/${event.slug}/register`}>
              Book tickets
            </Link>
          ) : (
            <span className="shrink-0 rounded-xl bg-[#f3f5f1] px-4 py-3 text-xs font-semibold text-[#61736e]">Unavailable</span>
          )}
        </div>
      </div>
    </main>
  );
}