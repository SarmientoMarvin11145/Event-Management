"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { translate, useLocale } from "@/lib/locale";
import { addFavorite, registerForEvent } from "@/app/(user)/actions";

const filters = [
  { id: "all", label: "All upcoming" },
  { id: "week", label: "This week" },
];

export default function FeaturedEvents({ directory = false, initialQuery = "" }) {
  const locale = useLocale();
  const text = (value) => translate(locale, value);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("loading");
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState(initialQuery);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) setUser(session?.user ?? null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadEvents() {
      const { data, error } = await supabase
        .from("events")
        .select(
          "id, title, slug, description, banner_url, start_date, venue_name, city, ticket_price, currency, venue_id, registration_opens_at, registration_deadline, organizations(name, logo_url)",
        )
        .eq("status", "published")
        .gte("start_date", new Date().toISOString())
        .order("start_date", { ascending: true })
        .limit(directory ? 24 : 6);

      if (!active) {
        return;
      }

      if (error) {
        setStatus("unavailable");
        return;
      }

      setEvents(data || []);
      setStatus(data?.length ? "ready" : "empty");
    }

    loadEvents();

    return () => {
      active = false;
    };
  }, [directory]);

  const visibleEvents = events.filter((event) => {
    const organization = Array.isArray(event.organizations)
      ? event.organizations[0]
      : event.organizations;
    const searchText = `${event.title} ${event.city || ""} ${event.venue_name || ""} ${organization?.name || ""}`.toLowerCase();

    if (!searchText.includes(search.trim().toLowerCase())) {
      return false;
    }
    if (activeFilter === "week") {
      const eventDate = new Date(event.start_date);
      const now = new Date();
      const endOfWeek = new Date(now);
      endOfWeek.setDate(now.getDate() + 7);
      return eventDate <= endOfWeek;
    }
    return true;
  });

  return (
    <section className="kuro-soft bg-[#f4f6f1] px-5 py-16 sm:px-8 sm:py-20" data-scroll-reveal="up" id="events">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text(directory ? "Public listings" : "On KURO")}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#173d39] sm:text-4xl">
              {text(directory ? "Browse events" : "Featured events")}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#586d69]">
              {text(directory ? "Find public events published by organizations using KURO." : "Public events published by organizations using KURO.")}
            </p>
          </div>
          {directory ? (
            <form action="/events" className="flex w-full max-w-sm" role="search">
              <label className="sr-only" htmlFor="directory-search">{text("Search events")}</label>
              <input className="min-w-0 flex-1 rounded-l-md border border-[#cbd8d1] bg-white px-3 py-2.5 text-sm" defaultValue={initialQuery} id="directory-search" name="q" placeholder={text("Search by event, city, venue")} type="search" />
              <button className="rounded-r-md bg-[#173d39] px-4 text-sm font-bold text-white" type="submit">{text("Search")}</button>
            </form>
          ) : (
            <Link className="text-sm font-bold text-[#245c55] hover:text-[#d6533d]" href="/events">
              {text("View all events")} <span aria-hidden="true">&#8594;</span>
            </Link>
          )}
        </div>

        <div aria-label="Filter featured events" className="mt-7 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.id}
              className={`rounded-md border px-4 py-2 text-sm font-semibold transition ${
                activeFilter === filter.id
                  ? "border-[#173d39] bg-[#173d39] text-white"
                  : "border-[#cbd8d1] text-[#526864] hover:border-[#245c55]"
              }`}
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              type="button"
            >
              {text(filter.label)}
            </button>
          ))}
        </div>
        {!directory && <p className="mt-3 text-xs text-[#7a8b84]">{text("Published events appear here from the public KURO event feed.")}</p>}

        {status === "loading" ? (
          <p className="mt-8 border-t border-[#dce5dd] py-8 text-sm text-[#61736e]" role="status">
            {text("Finding upcoming events...")}
          </p>
        ) : status === "unavailable" ? (
          <p className="mt-8 border-t border-[#dce5dd] py-8 text-sm text-[#61736e]" role="status">
            {text("Public event listings will appear here once the KURO event feed is configured.")}
          </p>
        ) : status === "empty" ? (
          <div className="mt-8 border-t border-[#dce5dd] py-10">
            <h3 className="text-lg font-bold text-[#173d39]">{text("The next great event starts here.")}</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#61736e]">
              {text("No public events are listed yet. This feed will show real listings when event publishing is available.")}
            </p>
            {loading ? (
              <Link className="mt-5 inline-flex rounded-md border border-[#cbd8d1] px-4 py-2.5 text-sm font-bold text-[#526864] pointer-events-none opacity-50" href="/register">{text("Create a KURO account")}</Link>
            ) : user ? null : (
              <Link
                className="mt-5 inline-flex rounded-md bg-[#e96247] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#cf5038]"
                href="/register"
              >
                {text("Create a KURO account")}
              </Link>
            )}
          </div>
        ) : visibleEvents.length ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-scroll-stagger>
            {visibleEvents.map((event) => (
              <EventCard event={event} key={event.id} />
            ))}
          </div>
        ) : (
          <p className="mt-8 border-t border-[#dce5dd] py-8 text-sm text-[#61736e]">
            {text("No events match this filter yet.")}
          </p>
        )}
      </div>
    </section>
  );
}

function EventCard({ event }) {
  const router = useRouter();
  const locale = useLocale();
  const text = (value) => translate(locale, value);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const organization = Array.isArray(event.organizations)
    ? event.organizations[0]
    : event.organizations;
  const eventDate = new Date(event.start_date);
  const dateLocales = { en: "en-PH", fil: "fil-PH", ceb: "ceb-PH" };
  const dateLabel = new Intl.DateTimeFormat(dateLocales[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(eventDate);
  const ticketPrice = Number(event.ticket_price || 0);

  async function startCheckout() {
    setCheckoutPending(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "event_ticket", eventId: event.id }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not start checkout.");
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Could not start checkout.");
      setCheckoutPending(false);
    }
  }

  return (
    <article className="kuro-panel overflow-hidden rounded-md border border-[#dce4dc] bg-white" data-scroll-reveal="up">
      <Link className="group block" href={`/e/${event.slug}`}>
        {event.banner_url ? (
          <div
            aria-label={`${event.title} event banner`}
            className="aspect-16/10 bg-cover bg-center transition group-hover:brightness-95"
            role="img"
            style={{ backgroundImage: `url("${event.banner_url}")` }}
          />
        ) : (
          <div className="flex aspect-16/10 items-end bg-[#dbe9df] p-5">
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-[#245c55]">
              {organization?.name || text("KURO event")}
            </span>
          </div>
        )}
        <div className="p-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#d6533d]">
            {organization?.logo_url ? (
              <span aria-label={`${organization.name} logo`} className="size-7 rounded-full bg-cover bg-center" role="img" style={{ backgroundImage: `url("${organization.logo_url}")` }} />
            ) : (
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-[#edf2e9] font-bold text-[#245c55]">{organization?.name?.slice(0, 1) || "K"}</span>
            )}
            <span>{organization?.name || text("KURO organizer")}</span>
          </div>
          <h3 className="mt-2 text-xl font-bold text-[#173d39] group-hover:text-[#245c55]">
            {event.title}
          </h3>
          <p className="mt-3 text-sm text-[#61736e]">{dateLabel}</p>
          <p className="mt-1 text-sm text-[#61736e]">
            {[event.venue_name, event.city].filter(Boolean).join(", ") || text("Venue to be announced")}
          </p>
          <div className="mt-5 flex items-center justify-end border-t border-[#edf0eb] pt-4">
            <span className="text-sm font-bold text-[#245c55]">{text("View event")} &#8594;</span>
          </div>
        </div>
      </Link>
      <div className="flex flex-wrap gap-2 px-5 pb-5">
        {event.venue_id && (
          <Link className="rounded-md bg-[#ed6148] px-3 py-2 text-xs font-bold text-white hover:bg-[#d74d37]" href={`/e/${event.slug}`}>
            {ticketPrice > 0 ? text("View seating and ticket options") : text("Choose a seat")}
          </Link>
        )}
        {eventDate > new Date() && ticketPrice > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#173d39]">
              {new Intl.NumberFormat(dateLocales[locale], {
                style: "currency",
                currency: event.currency || "PHP",
              }).format(ticketPrice)}
            </span>
            {event.currency === "PHP" ? (
              <button
                className="rounded-md bg-[#ed6148] px-3 py-2 text-xs font-bold text-white hover:bg-[#d74d37] disabled:cursor-wait disabled:opacity-60"
                disabled={checkoutPending}
                onClick={startCheckout}
                type="button"
              >
                {checkoutPending ? text("Opening secure checkout...") : text("Buy ticket")}
              </button>
            ) : (
              <span className="text-xs text-amber-800">{text("Online checkout is available for PHP events only.")}</span>
            )}
            {checkoutError && <p className="basis-full text-xs text-rose-700" role="alert">{checkoutError}</p>}
          </div>
        )}
        {!event.venue_id && eventDate > new Date() && ticketPrice === 0 && (
          <form action={registerForEvent}>
            <input name="event_id" type="hidden" value={event.id} />
            <button className="rounded-md bg-[#ed6148] px-3 py-2 text-xs font-bold text-white hover:bg-[#d74d37]" type="submit">{text("Register")}</button>
          </form>
        )}
        <form action={addFavorite}>
          <input name="event_id" type="hidden" value={event.id} />
          <button className="rounded-md border border-[#cbd8d1] px-3 py-2 text-xs font-bold text-[#245c55] hover:bg-[#f4f6f1]" type="submit">{text("Save event")}</button>
        </form>
      </div>
    </article>
  );
}