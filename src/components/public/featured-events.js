"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { translate, useLocale } from "@/lib/locale";
import { addFavorite } from "@/app/(user)/actions";
import { isEventRegistrationAvailable } from "@/lib/event-registration";

const dateFilters = [
  { id: "all", label: "Any date" },
  { id: "week", label: "This week" },
];

const priceFilters = [
  { id: "all", label: "All prices" },
  { id: "free", label: "Free" },
  { id: "paid", label: "Paid" },
];

export default function FeaturedEvents({
  directory = false,
  initialQuery = "",
  initialCategory = "",
  initialPrice = "all",
}) {
  const locale = useLocale();
  const text = (value) => translate(locale, value);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("loading");
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [priceFilter, setPriceFilter] = useState(initialPrice);
  const [sortBy, setSortBy] = useState("soonest");
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
      const now = new Date();
      const nowIso = now.toISOString();
      const latestStartWhenEndIsMissing = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("events")
        .select(
          "id, title, slug, category, description, short_description, banner_url, start_date, end_date, venue_name, city, ticket_price, currency, capacity, venue_id, registration_opens_at, registration_deadline, organizations(name, logo_url)",
        )
        .eq("status", "published")
        .or(`registration_deadline.is.null,registration_deadline.gte.${nowIso},end_date.gte.${nowIso},and(end_date.is.null,start_date.gte.${latestStartWhenEndIsMissing})`)
        .order("start_date", { ascending: true })
        .limit(directory ? 24 : 6);

      if (!active) {
        return;
      }

      if (error) {
        setStatus("unavailable");
        return;
      }

      if (!data?.length) {
        setEvents([]);
        setStatus("empty");
        return;
      }
      const { data: summaries, error: summaryError } = await supabase.rpc("get_event_ticket_summary", {
        p_event_ids: data.map((event) => event.id),
      });
      if (!active) return;
      if (summaryError) {
        console.error("Unable to load public ticket availability.", summaryError);
        setStatus("unavailable");
        return;
      }
      const summariesByEvent = new Map((summaries || []).map((summary) => [summary.event_id, summary]));
      const { data: registrationCounts, error: registrationCountError } = await supabase.rpc(
        "get_public_event_registration_counts",
        { p_event_ids: data.map((event) => event.id) },
      );
      if (!active) return;
      if (registrationCountError) {
        console.error("Unable to load public event registration counts.", registrationCountError);
      }
      const registrationCountsByEvent = new Map(
        (registrationCounts || []).map((item) => [item.event_id, Number(item.confirmed_ticket_count)]),
      );
      setEvents(data.map((event) => {
        const summary = summariesByEvent.get(event.id);
        return {
          ...event,
          starting_price: summary?.starting_price ?? null,
          available_quantity: summary ? summary.available_quantity : 0,
          confirmed_ticket_count: registrationCountsByEvent.get(event.id) || 0,
        };
      }));
      setStatus("ready");
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
    const searchText = `${event.title} ${event.short_description || ""} ${event.description || ""} ${event.category || ""} ${event.city || ""} ${event.venue_name || ""} ${organization?.name || ""}`.toLowerCase();

    if (!searchText.includes(search.trim().toLowerCase())) {
      return false;
    }
    if (selectedCategory && event.category !== selectedCategory) return false;
    if (priceFilter === "free" && Number(event.starting_price) !== 0) return false;
    if (priceFilter === "paid" && !(Number(event.starting_price) > 0)) return false;
    if (activeFilter === "week") {
      const eventDate = new Date(event.start_date);
      const now = new Date();
      const endOfWeek = new Date(now);
      endOfWeek.setDate(now.getDate() + 7);
      return eventDate <= endOfWeek;
    }
    return true;
  });
  const categories = [...new Set(events.map((event) => event.category).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
  const sortedEvents = [...visibleEvents].sort((first, second) => {
    if (sortBy === "price") {
      const firstPrice = first.starting_price ?? Number.POSITIVE_INFINITY;
      const secondPrice = second.starting_price ?? Number.POSITIVE_INFINITY;
      return firstPrice - secondPrice || new Date(first.start_date) - new Date(second.start_date);
    }
    return new Date(first.start_date) - new Date(second.start_date);
  });
  const featuredEvent = [...visibleEvents].sort((first, second) =>
    second.confirmed_ticket_count - first.confirmed_ticket_count
    || new Date(first.start_date) - new Date(second.start_date),
  )[0] || null;

  return (
    <section className={`kuro-soft min-h-[70vh] px-4 py-6 sm:px-8 sm:py-8 ${directory ? "bg-[#f7f8f4]" : "bg-[#f4f6f1]"}`} data-scroll-reveal="up" id="events">
      <div className="mx-auto max-w-7xl">
        {directory ? (
          <div className="rounded-xl border border-[#e5e9e3] bg-white px-4 py-4 shadow-sm sm:px-8 sm:py-7">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end md:gap-5">
              <div>
                <p className="hidden text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d] sm:block">{text("Discover something to do")}</p>
                <h1 className="text-2xl font-bold tracking-tight text-[#173d39] sm:mt-2 sm:text-4xl">{text("Find events you’ll love.")}</h1>
                <p className="mt-1 text-xs text-[#61736e] sm:mt-2 sm:text-sm">{text("Browse upcoming events, compare ticket prices, and book your spot.")}</p>
              </div>
              <form action="/events" className="flex w-full max-w-xl rounded-xl border border-[#d6dfd8] bg-[#f8faf7] p-1 sm:rounded-lg" role="search">
                <input name="category" type="hidden" value={selectedCategory} />
                <input name="price" type="hidden" value={priceFilter} />
                <label className="sr-only" htmlFor={`event-search-${directory ? "directory" : "featured"}`}>{text("Search events")}</label>
                <span aria-hidden="true" className="flex items-center pl-3 text-[#82918b]">&#9906;</span>
                <input className="kuro-input min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-[#173d39] outline-none placeholder:text-[#87958f]" onChange={(event) => setSearch(event.target.value)} defaultValue={initialQuery} id={`event-search-${directory ? "directory" : "featured"}`} name="q" placeholder={text("Search events, artists, venues...")} type="search" />
                <button className="rounded-lg bg-[#173d39] px-4 py-2 text-sm font-bold text-white hover:bg-[#245c55] sm:rounded-md" type="submit">{text("Search")}</button>
              </form>
            </div>
            <div aria-label="Popular event categories" className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mt-5 sm:border-t sm:border-[#edf0eb] sm:pt-4">
              <button aria-pressed={!selectedCategory} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${!selectedCategory ? "bg-[#173d39] text-white" : "border border-[#dce4dc] bg-white text-[#526864] hover:border-[#245c55]"}`} onClick={() => setSelectedCategory("")} type="button">{text("All events")}</button>
              {categories.map((category) => (
                <button aria-pressed={selectedCategory === category} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold capitalize ${selectedCategory === category ? "bg-[#173d39] text-white" : "border border-[#dce4dc] bg-white text-[#526864] hover:border-[#245c55]"}`} key={category} onClick={() => setSelectedCategory(category)} type="button">
                  {text(category.replaceAll("_", " "))}
                </button>
              ))}
            </div>
            <div aria-label="Quick filters" className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {priceFilters.map((filter) => (
                <button aria-pressed={priceFilter === filter.id} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${priceFilter === filter.id ? "border-[#ed6148] bg-[#fff3ef] text-[#c54c36]" : "border-[#dce4dc] bg-white text-[#526864]"}`} key={filter.id} onClick={() => setPriceFilter(filter.id)} type="button">
                  {text(filter.label)}
                </button>
              ))}
              {dateFilters.map((filter) => (
                <button aria-pressed={activeFilter === filter.id} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${activeFilter === filter.id ? "border-[#ed6148] bg-[#fff3ef] text-[#c54c36]" : "border-[#dce4dc] bg-white text-[#526864]"}`} key={filter.id} onClick={() => setActiveFilter(filter.id)} type="button">
                  {text(filter.label)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text("Handpicked for you")}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#173d39] sm:text-4xl">{text("Featured events")}</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#586d69]">
                {text("Find your next experience from public events and ticketed gatherings.")}
              </p>
            </div>
            <Link className="text-sm font-bold text-[#245c55] hover:text-[#d6533d]" href="/events">
              {text("Explore all events")} <span aria-hidden="true">&#8594;</span>
            </Link>
          </div>
        )}

        <div className={`mt-6 grid items-start gap-6 ${directory ? "lg:grid-cols-[220px_minmax(0,1fr)]" : ""}`}>
          {directory && featuredEvent && (
            <FeaturedEvent event={featuredEvent} />
          )}
          {directory && (
            <aside aria-label="Event filters" className="kuro-panel hidden rounded-xl border border-[#e2e8e1] bg-white p-5 shadow-sm lg:block">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#173d39]">{text("Filters")}</h2>
                {(selectedCategory || priceFilter !== "all" || activeFilter !== "all") && (
                  <button className="text-xs font-semibold text-[#d6533d] hover:underline" onClick={() => { setSelectedCategory(""); setPriceFilter("all"); setActiveFilter("all"); }} type="button">{text("Clear")}</button>
                )}
              </div>
              <fieldset className="mt-5 border-t border-[#edf0eb] pt-4">
                <legend className="text-xs font-bold uppercase tracking-wide text-[#526864]">{text("Ticket price")}</legend>
                <div className="mt-3 grid gap-2">
                  {priceFilters.map((filter) => (
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-[#526864]" key={filter.id}>
                      <input checked={priceFilter === filter.id} className="accent-[#173d39]" name="price-filter" onChange={() => setPriceFilter(filter.id)} type="radio" />
                      {text(filter.label)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="mt-5 border-t border-[#edf0eb] pt-4">
                <legend className="text-xs font-bold uppercase tracking-wide text-[#526864]">{text("When")}</legend>
                <div className="mt-3 grid gap-2">
                  {dateFilters.map((filter) => (
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-[#526864]" key={filter.id}>
                      <input checked={activeFilter === filter.id} className="accent-[#173d39]" name="date-filter" onChange={() => setActiveFilter(filter.id)} type="radio" />
                      {text(filter.label)}
                    </label>
                  ))}
                </div>
              </fieldset>
              {categories.length > 0 && (
                <fieldset className="mt-5 border-t border-[#edf0eb] pt-4">
                  <legend className="text-xs font-bold uppercase tracking-wide text-[#526864]">{text("Category")}</legend>
                  <div className="mt-3 grid gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-[#526864]">
                      <input checked={!selectedCategory} className="accent-[#173d39]" name="category-filter" onChange={() => setSelectedCategory("")} type="radio" />
                      {text("All categories")}
                    </label>
                    {categories.map((category) => (
                      <label className="flex cursor-pointer items-center gap-2 text-sm capitalize text-[#526864]" key={category}>
                        <input checked={selectedCategory === category} className="accent-[#173d39]" name="category-filter" onChange={() => setSelectedCategory(category)} type="radio" />
                        {text(category.replaceAll("_", " "))}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </aside>
          )}
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#173d39]">{text(directory ? "Upcoming events" : "Featured events")}</h2>
                <p className="mt-1 text-xs text-[#7a8b84]">{text("Handpicked experiences from local organizers")}</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-[#61736e]">
                {text("Sort by")}
                <select className="kuro-input rounded-lg border border-[#d6dfd8] bg-white px-3 py-2 text-xs font-semibold text-[#173d39]" onChange={(event) => setSortBy(event.target.value)} value={sortBy}>
                  <option value="soonest">{text("Soonest")}</option>
                  <option value="price">{text("Price: low to high")}</option>
                </select>
              </label>
            </div>
        {status === "loading" ? (
          <p className="mt-8 rounded-xl border border-[#e2e8e1] bg-white py-12 text-center text-sm text-[#61736e]" role="status">
            {text("Finding upcoming events...")}
          </p>
        ) : status === "unavailable" ? (
          <p className="mt-8 rounded-xl border border-[#e2e8e1] bg-white py-12 text-center text-sm text-[#61736e]" role="status">
            {text("Public event listings will appear here once the KURO event feed is configured.")}
          </p>
        ) : status === "empty" ? (
          <div className="mt-4 rounded-xl border border-dashed border-[#cbd8d1] bg-white px-6 py-14 text-center">
            <span aria-hidden="true" className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#edf2e9] text-2xl text-[#245c55]">&#9734;</span>
            <h3 className="mt-4 text-xl font-bold text-[#173d39]">{text("Your next great experience is coming.")}</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#61736e]">
              {text("There are no public events listed right now. Check back soon or explore events by searching for a city or venue.")}
            </p>
            {search && <Link className="mt-5 inline-flex rounded-lg border border-[#cbd8d1] px-4 py-2.5 text-sm font-bold text-[#245c55]" href="/events">{text("Clear search")}</Link>}
            {!loading && !user && !search && (
              <Link className="mt-5 inline-flex rounded-lg bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#245c55]" href="/register">{text("Create a KURO account")}</Link>
            )}
          </div>
        ) : sortedEvents.length ? (
          <>
            <p className="mb-3 text-xs text-[#61736e]">{sortedEvents.length} {text(sortedEvents.length === 1 ? "event" : "events")}</p>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3" data-scroll-stagger>
            {sortedEvents.map((event) => (
              <EventCard event={event} featured={event.id === featuredEvent?.id} key={event.id} />
            ))}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-[#dce5dd] bg-white px-6 py-12 text-center">
            <h3 className="text-lg font-bold text-[#173d39]">{text("No events match your search.")}</h3>
            <p className="mt-2 text-sm text-[#61736e]">{text("Try another event name, city, venue, or date range.")}</p>
            <Link className="mt-5 inline-flex rounded-lg border border-[#cbd8d1] px-4 py-2.5 text-sm font-bold text-[#245c55]" href="/events">{text("Clear filters")}</Link>
          </div>
        )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedEvent({ event }) {
  const locale = useLocale();
  const text = (value) => translate(locale, value);
  const eventDate = new Date(event.start_date);
  const dateLocales = { en: "en-PH", fil: "fil-PH", ceb: "ceb-PH" };
  const dateLabel = new Intl.DateTimeFormat(dateLocales[locale], {
    month: "short",
    day: "numeric",
  }).format(eventDate);
  const canRegister = isEventRegistrationAvailable(event)
    && event.starting_price !== null
    && event.available_quantity !== 0
    && Boolean(event.slug);
  const priceLabel = event.starting_price == null
    ? text("Tickets unavailable")
    : Number(event.starting_price) === 0
      ? text("Free entry")
      : `${text("From")} ${new Intl.NumberFormat(dateLocales[locale], { style: "currency", currency: event.currency || "PHP", maximumFractionDigits: 0 }).format(event.starting_price)}`;
  const isPopular = event.confirmed_ticket_count > 0;

  return (
    <article className="relative isolate overflow-hidden rounded-2xl bg-[#173d39] shadow-md lg:hidden">
      <Link aria-label={`${event.title} details`} className="absolute inset-0" href={`/e/${event.slug}`}>
        {event.banner_url ? (
          <div
            aria-label={`${event.title} event banner`}
            className="absolute inset-0 bg-cover bg-center"
            role="img"
            style={{ backgroundImage: `url("${event.banner_url}")` }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#245c55] via-[#173d39] to-[#d6533d]" />
        )}
      </Link>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#102d2a] via-[#102d2a]/45 to-transparent" />
      <div className="relative flex min-h-56 flex-col justify-end p-4 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ffd0c5]">{text(isPopular ? "Popular event" : "Featured event")}</p>
        <h2 className="mt-1 line-clamp-2 text-xl font-black leading-tight">{event.title}</h2>
        <p className="mt-2 text-xs text-white/85">
          {[dateLabel, event.city || event.venue_name || text("Location to be announced")].filter(Boolean).join(" · ")}
        </p>
        {isPopular && (
          <p className="mt-1 text-[11px] font-medium text-white/75">
            {event.confirmed_ticket_count.toLocaleString()} {text("tickets reserved")}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-bold">{priceLabel}</span>
          {canRegister ? (
            <Link className="shrink-0 rounded-lg bg-[#ed6148] px-4 py-2.5 text-xs font-bold text-white" href={`/e/${event.slug}/register`}>
              {text("Get tickets")}
            </Link>
          ) : (
            <span className="shrink-0 rounded-lg bg-white/15 px-4 py-2.5 text-xs font-bold text-white">{text("Registration unavailable")}</span>
          )}
        </div>
      </div>
    </article>
  );
}

function EventCard({ event, featured = false }) {
  const locale = useLocale();
  const text = (value) => translate(locale, value);
  const organization = Array.isArray(event.organizations)
    ? event.organizations[0]
    : event.organizations;
  const eventDate = new Date(event.start_date);
  const dateLocales = { en: "en-PH", fil: "fil-PH", ceb: "ceb-PH" };
  const dateLabel = new Intl.DateTimeFormat(dateLocales[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(eventDate);
  const registrationAvailable = isEventRegistrationAvailable(event);
  const ticketsAvailable = event.starting_price !== null && event.available_quantity !== 0;

  return (
    <article className={`kuro-panel group overflow-hidden rounded-2xl border border-[#dce4dc] bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#173d39]/10 ${featured ? "hidden lg:block" : "flex sm:block"}`} data-scroll-reveal="up">
      <Link aria-label={`${event.title} details`} className="relative block h-28 w-28 shrink-0 overflow-hidden sm:h-auto sm:w-auto" href={`/e/${event.slug}`}>
        {event.banner_url ? (
          <div
            aria-label={`${event.title} event banner`}
            className="size-full bg-cover bg-center transition duration-500 group-hover:scale-105 sm:aspect-[4/3] sm:size-auto"
            role="img"
            style={{ backgroundImage: `url("${event.banner_url}")` }}
          />
        ) : (
          <div className="flex size-full items-end bg-gradient-to-br from-[#dbe9df] via-[#edf2e9] to-[#f8d9cf] p-2 sm:aspect-[4/3] sm:size-auto sm:p-5">
            <span className="hidden text-xs font-bold uppercase tracking-[0.15em] text-[#245c55] sm:block">
              {organization?.name || text("KURO event")}
            </span>
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 rounded-md bg-white/95 px-1.5 py-1 text-center shadow-md backdrop-blur sm:left-3 sm:top-3 sm:rounded-lg sm:px-3 sm:py-2">
          <span className="block text-[8px] font-bold uppercase tracking-wider text-[#d6533d] sm:text-[10px]">{new Intl.DateTimeFormat(dateLocales[locale], { month: "short" }).format(eventDate)}</span>
          <span className="block text-sm font-black leading-4 text-[#173d39] sm:text-lg sm:leading-5">{new Intl.DateTimeFormat(dateLocales[locale], { day: "2-digit" }).format(eventDate)}</span>
        </div>
        <div className="absolute bottom-1 right-1 rounded-full bg-[#173d39]/90 px-1.5 py-1 text-[8px] font-bold text-white backdrop-blur sm:bottom-3 sm:right-3 sm:px-3 sm:py-1.5 sm:text-xs">
          {event.starting_price == null ? text("Tickets unavailable") : Number(event.starting_price) === 0 ? text("Free entry") : `${text("From")} ${new Intl.NumberFormat(dateLocales[locale], { style: "currency", currency: event.currency || "PHP", maximumFractionDigits: 0 }).format(event.starting_price)}`}
        </div>
      </Link>
      <div className="min-w-0 flex-1 p-3 sm:p-5">
          <div className="hidden min-w-0 items-center gap-2 text-xs font-semibold text-[#d6533d] sm:flex">
            {organization?.logo_url ? (
              <span aria-label={`${organization.name} logo`} className="size-7 rounded-full bg-cover bg-center" role="img" style={{ backgroundImage: `url("${organization.logo_url}")` }} />
            ) : (
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-[#edf2e9] font-bold text-[#245c55]">{organization?.name?.slice(0, 1) || "K"}</span>
            )}
            <span>{organization?.name || text("KURO organizer")}</span>
          </div>
          <Link className="line-clamp-2 block text-sm font-bold leading-5 text-[#173d39] hover:text-[#245c55] sm:mt-3 sm:min-h-14 sm:text-lg sm:leading-7" href={`/e/${event.slug}`}>
            {event.title}
          </Link>
          <p className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-[#526864] sm:mt-2 sm:gap-2 sm:text-xs"><span aria-hidden="true">&#9719;</span>{dateLabel}</p>
          <p className="mt-1 hidden items-center gap-2 text-xs text-[#61736e] sm:flex">
            <span aria-hidden="true">&#9906;</span>
            {[event.venue_name, event.city].filter(Boolean).join(", ") || text("Venue to be announced")}
          </p>
          <p className="mt-1 line-clamp-1 text-[10px] text-[#61736e] sm:hidden">
            {[event.venue_name, event.city].filter(Boolean).join(", ") || text("Venue to be announced")}
          </p>
          <p className="mt-2 hidden text-xs text-[#61736e] sm:block">
            {event.available_quantity == null ? text("Unlimited availability") : `${Number(event.available_quantity).toLocaleString()} ${text("available")}`}
          </p>
          <div className="mt-2 flex items-center gap-2 border-t border-[#edf0eb] pt-2 sm:mt-4 sm:pt-4">
            {registrationAvailable && ticketsAvailable && event.slug ? (
              <Link className="flex-1 rounded-lg bg-[#ed6148] px-2 py-2 text-center text-[10px] font-bold text-white transition hover:bg-[#d74d37] sm:px-3 sm:py-2.5 sm:text-xs" href={`/e/${event.slug}/register`}>
                {text(Number(event.starting_price) === 0 ? "Reserve free ticket" : "Get tickets")}
              </Link>
            ) : (
              <span className="flex-1 rounded-lg bg-[#f3f5f1] px-2 py-2 text-center text-[10px] font-semibold text-[#61736e] sm:px-3 sm:py-2.5 sm:text-xs">{text("Registration unavailable")}</span>
            )}
            <form action={addFavorite}>
              <input name="event_id" type="hidden" value={event.id} />
              <button aria-label={text("Save event")} className="flex size-9 items-center justify-center rounded-lg border border-[#cbd8d1] text-base text-[#526864] transition hover:border-[#ed6148] hover:text-[#d6533d] sm:size-10 sm:text-lg" title={text("Save event")} type="submit">&#9825;</button>
            </form>
          </div>
      </div>
    </article>
  );
}