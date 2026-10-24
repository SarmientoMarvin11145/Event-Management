"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { addFavorite, registerForEvent } from "@/app/(user)/actions";

export default function PublicEventDetails({ slug }) {
  const [event, setEvent] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, description, banner_url, start_date, end_date, venue_name, city, organizations(name, logo_url)")
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

      setEvent(data);
      setStatus(data ? "ready" : "missing");
    }

    loadEvent();

    return () => {
      active = false;
    };
  }, [slug]);

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

  return (
    <main className="kuro-page min-h-[70vh] bg-[#fbfcf8] text-[#173d39]">
      {event.banner_url && (
        <div aria-label={`${event.title} event banner`} className="h-64 bg-cover bg-center sm:h-96" role="img" style={{ backgroundImage: `url("${event.banner_url}")` }} />
      )}
      <article className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{organization?.name || "KURO organizer"}</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-bold leading-tight sm:text-5xl">{event.title}</h1>
          <p className="mt-5 text-sm font-semibold text-[#526864]">{dateLabel}</p>
          <p className="mt-2 text-sm text-[#61736e]">{[event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be announced"}</p>
          <div className="mt-8 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-[#526864]">
            {event.description || "The organizer has not added an event description yet."}
          </div>
        </div>
        <aside className="kuro-panel h-fit rounded-md border border-[#dce4dc] bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#d6533d]">Event details</p>
          {new Date(event.start_date) > new Date() ? (
            <form action={registerForEvent} className="mt-4">
              <input name="event_id" type="hidden" value={event.id} />
              <button className="w-full rounded-md bg-[#ed6148] px-4 py-3 text-sm font-bold text-white hover:bg-[#d74d37]" type="submit">Register</button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-[#61736e]">Registration is not available for this event.</p>
          )}
          <form action={addFavorite} className="mt-2">
            <input name="event_id" type="hidden" value={event.id} />
            <button className="w-full rounded-md border border-[#cbd8d1] px-4 py-3 text-sm font-bold text-[#245c55] hover:bg-[#f4f6f1]" type="submit">Save event</button>
          </form>
        </aside>
      </article>
    </main>
  );
}