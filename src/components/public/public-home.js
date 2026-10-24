"use client";

import Link from "next/link";
import { useEffect } from "react";
import FeaturedEvents from "@/components/public/featured-events";
import { translate, useLocale } from "@/lib/locale";

const sectors = [
  { icon: "🎓", name: "Schools", detail: "Student events, graduations, campus organizations", id: "schools" },
  { icon: "🍽️", name: "Restaurants", detail: "Reservations, launches, tastings, loyalty nights", id: "restaurants" },
  { icon: "🏛️", name: "Barangay & LGU", detail: "Assemblies, health drives, fiestas, local programs", id: "lgu" },
  { icon: "💻", name: "Webinars", detail: "Hybrid seminars, attendance, certificates", id: "webinars" },
  { icon: "🎪", name: "Expos", detail: "Booths, sponsors, exhibitors, lead capture", id: "expos" },
  { icon: "💍", name: "Private events", detail: "Weddings, birthdays, reunions, celebrations", id: "private-events" },
];

const features = [
  ["📋", "Event creation", "Set the details, audience, and schedule in one organized workspace."],
  ["🎟️", "Tickets & registration", "Plan for free, paid, tiered, or group registration flows."],
  ["✅", "Attendance", "Bring QR, manual, and future check-in methods into one view."],
  ["🪑", "Seating plans", "Plan a room layout and give guests a clearer way to choose seats."],
  ["🏢", "Booth management", "Organize exhibitor spaces, sponsor details, and floor activity."],
  ["🤖", "AI-assisted planning", "Explore assisted copy, attendee support, and event insights."],
  ["📊", "Live reporting", "Understand registrations, attendance, and event outcomes."],
  ["📱", "Works across devices", "Keep event details useful on desktop, phone, tablet, and kiosk."],
  ["🔒", "Privacy-minded", "Build with clear access boundaries and careful attendee data handling."],
];

const sectorDetails = [
  {
    id: "for-schools",
    label: "01 / EDUCATION",
    title: "A calmer way to run campus events.",
    description: "From student organizations to graduations, keep registrations, schedules, and attendance in one place.",
    points: ["Campus-wide event listings", "Student and guest registration", "Attendance summaries", "Graduation and recognition formats"],
    image: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=1200&q=85",
    alt: "Graduates celebrating together outdoors",
  },
  {
    id: "for-restaurants",
    label: "02 / HOSPITALITY",
    title: "Turn a good table into a full room.",
    description: "Give guests one clear place to find tastings, pop-ups, launch nights, and special menus.",
    points: ["Event and dining details", "Guest lists and capacity planning", "Promotion-ready event pages", "After-event attendance review"],
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=85",
    alt: "A restaurant table prepared for a shared meal",
  },
  {
    id: "for-lgu",
    label: "03 / PUBLIC SERVICE",
    title: "Make community programs easier to join.",
    description: "Publish clear details for local assemblies, health drives, and neighborhood celebrations.",
    points: ["Free resident registration", "Program and venue details", "Attendance summaries", "Mobile-friendly event pages"],
    image: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1200&q=85",
    alt: "A community gathering with neighbors talking together",
  },
  {
    id: "for-webinars",
    label: "04 / LEARNING",
    title: "Bring every session into focus.",
    description: "Give online and hybrid audiences a reliable home for schedules, access details, and follow-up.",
    points: ["Session schedules", "Online access information", "Attendance tracking", "Certificate workflows on the roadmap"],
    image: "https://images.unsplash.com/photo-1591115765373-5207764f72e7?auto=format&fit=crop&w=1200&q=85",
    alt: "A speaker presenting to an audience at a seminar",
  },
  {
    id: "for-expos",
    label: "05 / EXHIBITIONS",
    title: "Give exhibitors a better floor plan.",
    description: "Bring event details, exhibitor information, and sponsor opportunities together before doors open.",
    points: ["Exhibitor directory", "Booth planning tools on the roadmap", "Sponsor information", "Guest registration flow"],
    image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=85",
    alt: "An expo hall with exhibition booths and visitors",
  },
  {
    id: "for-private-events",
    label: "06 / CELEBRATIONS",
    title: "Make the details feel like part of the celebration.",
    description: "Bring guest information, schedules, and venue details together for the people closest to you.",
    points: ["Private event pages", "Guest information", "Schedule and venue details", "A clear event-day plan"],
    image: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=85",
    alt: "A wedding reception set for an evening celebration",
  },
];

const faqs = [
  ["How do I join an event?", "Browse events and choose Register to join a published event. Your tickets appear in your workspace."],
  ["Do I need an account to register?", "Yes. Create an account so your registrations, tickets, and certificates stay in one place."],
  ["Can our barangay or LGU use KURO?", "The platform is being designed for local programs and public events. Ask your organization to review its privacy and procurement requirements before using it with resident data."],
  ["How does QR check-in work?", "QR check-in is part of the product direction. The current app does not yet issue or scan event tickets."],
  ["Is attendee data secure?", "KURO uses Supabase row-level security for the account profile data currently in the app. Event and attendee workflows are not yet available, so do not upload attendee information until those features are released."],
  ["Does KURO work offline?", "Offline event operations are on the roadmap, but the current site requires an internet connection."],
  ["What does AI do in KURO?", "AI-assisted planning and attendee support are roadmap concepts. No AI feature is active in this preview."],
];

const plans = [
  { name: "Free", price: "₱0", detail: "For trying KURO with a small event", action: "Start free" },
  { name: "Pro", price: "₱999", unit: "/ month", detail: "For independent organizers and growing teams", action: "Available soon", featured: true },
  { name: "Business", price: "₱2,999", unit: "/ month", detail: "For schools, hospitality, and multi-event teams", action: "Available soon" },
  { name: "Enterprise", price: "Custom", detail: "For universities and public-sector programs", action: "Contact options soon" },
];

export default function PublicHome() {
  const locale = useLocale();
  const text = (value) => translate(locale, value);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      return;
    }

    const revealTargets = document.querySelectorAll("[data-scroll-reveal]");
    if (!revealTargets.length) {
      return;
    }

    const root = document.documentElement;
    root.classList.add("scroll-reveal-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.dataset.revealState = "visible";
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    revealTargets.forEach((target) => {
      target.dataset.revealState = "pending";
      if (target.parentElement?.hasAttribute("data-scroll-stagger")) {
        const siblings = [...target.parentElement.children].filter((element) =>
          element.hasAttribute("data-scroll-reveal"),
        );
        const order = siblings.indexOf(target);
        target.style.setProperty("--scroll-delay", `${Math.min(order, 5) * 70}ms`);
      }
      observer.observe(target);
    });

    return () => {
      observer.disconnect();
      root.classList.remove("scroll-reveal-ready");
    };
  }, []);

  return (
    <main className="kuro-page bg-[#fbfcf8] text-[#173d39]">
      <section className="relative isolate flex min-h-147.5 items-center overflow-hidden bg-[#142d2a] sm:min-h-155">
        <div
          aria-label="People gathering at a live event"
          className="absolute inset-0 -z-20 bg-cover bg-center"
          role="img"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=2000&q=90)" }}
        />
        <div className="absolute inset-0 -z-10 bg-[#10201e]/65" />
        <div className="mx-auto w-full max-w-7xl px-5 py-16 text-white sm:px-8 sm:py-24">
          <div className="max-w-3xl">
            <p className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#ffcf72]">
              <span className="size-2 rounded-full bg-[#ffcf72]" /> {text("Events, people, all in one place")}
            </p>
            <h1 className="text-4xl font-bold leading-[1.06] sm:text-6xl lg:text-7xl">
              {text("Manage events. Track attendance. Make every gathering count.")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
              {text("One platform for schools, restaurants, LGUs, webinars, expos, and every event in between.")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="rounded-md bg-[#ef654b] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d94e38]" href="/register">
                {text("Create an account")} <span aria-hidden="true" className="ml-2">&#8594;</span>
              </Link>
              <Link className="rounded-md border border-white/55 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10" href="#events">
                {text("Browse public events")}
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-7 gap-y-2 text-xs font-semibold text-white/80 sm:text-sm">
              <span>{text("One event workspace")}</span>
              <span>{text("Clear attendee flows")}</span>
              <span>{text("Built for event teams in the Philippines.")}</span>
            </div>
          </div>
        </div>
        <p className="absolute bottom-5 right-8 hidden text-xs font-medium text-white/70 lg:block">KURO product preview</p>
      </section>

      <section className="kuro-soft bg-[#edf2e9] px-5 py-12 sm:px-8 sm:py-16" data-scroll-reveal="up" id="sectors">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text("Made for your kind of event")}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{text("Who brings people together?")}</h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-md border border-[#d8e1d8] bg-[#d8e1d8] sm:grid-cols-2 lg:grid-cols-3" data-scroll-stagger>
            {sectors.map((sector) => (
              <a className="kuro-panel group bg-[#fbfcf8] p-5 transition hover:bg-white sm:p-6" data-scroll-reveal="up" href={`#for-${sector.id}`} key={sector.id}>
                <span aria-hidden="true" className="text-2xl">{sector.icon}</span>
                <h3 className="mt-5 text-lg font-bold text-[#173d39] group-hover:text-[#d6533d]">{text(sector.name)}</h3>
                <p className="mt-2 text-sm leading-6 text-[#647771]">{text(sector.detail)}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="kuro-page bg-[#fbfcf8] px-5 py-12 sm:px-8 sm:py-14" data-scroll-reveal="up" id="organizers">
        <div className="kuro-panel mx-auto flex max-w-7xl flex-col justify-between gap-6 rounded-md border border-[#dce4dc] bg-white p-6 sm:p-8 lg:flex-row lg:items-center">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text("For event teams")}</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#173d39] sm:text-3xl">{text("Are you an event organizer?")}</h2>
            <p className="mt-3 text-sm leading-6 text-[#61736e]">{text("Create a KURO account, then submit your organization for organizer access. Applications are reviewed by the KURO team; approval and organizer tools are not instant.")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Link className="rounded-md bg-[#ed6148] px-5 py-3 text-sm font-bold text-white hover:bg-[#d74d37]" href="/register">{text("Create an account to apply")}</Link>
            <Link className="rounded-md border border-[#cbd8d1] px-5 py-3 text-sm font-bold text-[#245c55] hover:bg-[#f4f6f1]" href="/login">{text("Already have an account? Log in")}</Link>
          </div>
        </div>
      </section>

      <section className="kuro-page bg-[#fbfcf8] px-5 py-16 sm:px-8 sm:py-20" data-scroll-reveal="up" id="features">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text("The event toolkit")}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{text("Less juggling. More hosting.")}</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#647771]">KURO is an early product preview. These are the capabilities the platform is being shaped around.</p>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-scroll-stagger>
            {features.map(([icon, title, description]) => (
              <article className="kuro-panel rounded-md border border-[#e0e7df] bg-white p-5 sm:p-6" data-scroll-reveal="up" key={title}>
                <span aria-hidden="true" className="text-2xl">{icon}</span>
                <h3 className="mt-5 text-lg font-bold text-[#173d39]">{text(title)}</h3>
                <p className="mt-2 text-sm leading-6 text-[#647771]">{text(description)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="kuro-band bg-[#173d39] px-5 py-16 text-white sm:px-8 sm:py-20" data-scroll-reveal="up" id="how-it-works">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ffcf72]">{text("A clearer event flow")}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{text("From first invite to final insight.")}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-scroll-stagger>
            {[
              ["01", "Create", "Set the event details, schedule, and guest experience."],
              ["02", "Invite", "Share a public page and make registration easy to find."],
              ["03", "Welcome", "Keep check-in and attendance organized on event day."],
              ["04", "Learn", "Review what happened and plan the next one with context."],
            ].map(([number, title, description], index) => (
              <div className="relative rounded-2xl border border-white/15 bg-white/[0.04] p-5 sm:p-6" data-scroll-reveal="up" key={number}>
                {index < 3 && <span aria-hidden="true" className="absolute -right-4 top-5 z-10 hidden size-8 items-center justify-center rounded-full border border-[#ffcf72]/30 bg-[#173d39] text-lg text-[#ffcf72] xl:flex">&#8594;</span>}
                <span className="inline-flex rounded-full bg-[#ffcf72]/10 px-3 py-1 text-xs font-black tracking-[0.12em] text-[#ffcf72]">STEP {number}</span>
                <h3 className="mt-5 text-xl font-bold">{text(title)}</h3>
                <p className="mt-2 text-sm leading-6 text-white/75 sm:text-base">{text(description)}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-xs text-white/55">Workflow preview. Registration, check-in, and reporting tools are being developed.</p>
        </div>
      </section>

      <FeaturedEvents />

      <section className="kuro-page bg-[#fbfcf8] px-5 py-16 sm:px-8 sm:py-20" data-scroll-reveal="up" id="about">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text("One platform, different rooms")}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{text("A better fit for the people you bring together.")}</h2>
          </div>
          <div className="mt-10 space-y-12">
            {sectorDetails.map((sector, index) => (
              <article className={`grid items-center gap-7 lg:grid-cols-2 lg:gap-14 ${index % 2 ? "" : ""}`} data-scroll-reveal={index % 2 ? "right" : "left"} id={sector.id} key={sector.id}>
                <div className={`aspect-16/10 overflow-hidden rounded-md bg-[#dce7dd] bg-cover bg-center ${index % 2 ? "lg:order-2" : ""}`} role="img" aria-label={sector.alt} style={{ backgroundImage: `url("${sector.image}")` }} />
                <div className={index % 2 ? "lg:order-1" : ""}>
                  <p className="text-xs font-bold tracking-[0.14em] text-[#d6533d]">{text(sector.label)}</p>
                  <h3 className="mt-3 max-w-xl text-2xl font-bold leading-tight sm:text-3xl">{text(sector.title)}</h3>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-[#647771]">{text(sector.description)}</p>
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                    {sector.points.map((point) => (
                      <li className="flex items-start gap-2 text-sm text-[#405c56]" key={point}>
                        <span aria-hidden="true" className="mt-0.5 font-bold text-[#df6047]">+</span>{text(point)}
                      </li>
                    ))}
                  </ul>
                  <Link className="mt-6 inline-flex text-sm font-bold text-[#245c55] hover:text-[#d6533d]" href="/register">
                    {text("Explore KURO for this team")} <span aria-hidden="true" className="ml-2">&#8594;</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="kuro-soft bg-[#edf2e9] px-5 py-16 sm:px-8 sm:py-20" data-scroll-reveal="up" id="ai">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text("On the roadmap")}</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{text("AI that helps quietly, not loudly.")}</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[#647771]">
              {text("KURO is exploring practical AI assistance for event teams. These ideas are not active product features yet.")}
            </p>
            <Link className="mt-6 inline-flex rounded-md bg-[#173d39] px-5 py-3 text-sm font-bold text-white hover:bg-[#285850]" href="/register">
              {text("Follow the KURO preview")}
            </Link>
          </div>
          <div className="kuro-panel grid gap-px overflow-hidden rounded-md border border-[#d6e0d7] bg-[#d6e0d7] sm:grid-cols-2" data-scroll-stagger>
            {[
              "Event description drafts",
              "No-show pattern insights",
              "Live captions and translation",
              "Session recommendations",
              "Certificate preparation",
              "Attendee question assistant",
            ].map((item, index) => (
              <div className="kuro-panel bg-[#fbfcf8] p-5" data-scroll-reveal="up" key={item}>
                <span className="text-xs font-bold text-[#d6533d]">CONCEPT 0{index + 1}</span>
                <h3 className="mt-3 text-sm font-bold text-[#173d39]">{item}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="kuro-page bg-[#fbfcf8] px-5 py-16 sm:px-8 sm:py-20" data-scroll-reveal="up" id="demo">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text("Product preview")}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{text("A quick look at the KURO workspace.")}</h2>
            <p className="mt-3 text-sm leading-6 text-[#647771]">{text("Illustrative interface only. Live organizer tools are still in development.")}</p>
          </div>
          <div className="kuro-panel mt-8 overflow-hidden rounded-md border border-[#dce4dc] bg-white shadow-sm" data-scroll-reveal="up">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5ebe4] px-5 py-4 sm:px-7">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#d6533d]">KURO / PREVIEW</span>
                <h3 className="mt-1 text-lg font-bold">Events overview</h3>
              </div>
              <span className="rounded border border-[#dce4dc] px-3 py-1.5 text-xs font-semibold text-[#647771]">Workspace concept</span>
            </div>
            <div className="grid lg:grid-cols-[210px_1fr]">
              <aside className="hidden border-r border-[#e5ebe4] p-5 lg:block">
                <p className="text-xs font-bold uppercase text-[#899891]">Workspace</p>
                <div className="mt-4 space-y-3 text-sm font-semibold text-[#526864]">
                    <p className="kuro-panel rounded bg-[#edf2e9] px-3 py-2 text-[#173d39]">Overview</p>
                  <p className="px-3 py-1">Events</p><p className="px-3 py-1">Attendees</p><p className="px-3 py-1">Reports</p>
                </div>
              </aside>
              <div className="p-5 sm:p-7">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[["EVENTS", "Your schedule"], ["REGISTRATION", "Guest list"], ["CHECK-IN", "Event day"]].map(([label, value]) => (
                    <div className="kuro-panel rounded border border-[#e1e8e0] p-4" key={label}>
                      <p className="text-[10px] font-bold tracking-[0.12em] text-[#d6533d]">{label}</p>
                      <p className="mt-3 text-sm font-semibold text-[#173d39]">{value}</p>
                      <p className="mt-1 text-xs text-[#7a8b84]">Preview module</p>
                    </div>
                  ))}
                </div>
                <div className="kuro-panel mt-5 rounded border border-dashed border-[#cbd8d1] bg-[#f8faf6] p-6 text-center">
                  <p className="text-sm font-bold text-[#173d39]">Your next event will live here.</p>
                  <p className="mt-1 text-xs text-[#74827e]">Create, organize, and review from one workspace.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="kuro-band bg-[#173d39] px-5 py-14 text-white sm:px-8 sm:py-16" data-scroll-reveal="up" id="social-proof">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ffcf72]">{text("Early product preview")}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">{text("Honest progress. Better events ahead.")}</h2>
          </div>
          <div className="border-l border-white/25 pl-6">
            <p className="max-w-2xl text-sm leading-7 text-white/80">
              {text("KURO is in development, so we are not publishing customer counts, ratings, testimonials, or platform totals yet. Public event listings will appear here as organizers publish them.")}
            </p>
          </div>
        </div>
      </section>

      <section className="kuro-soft bg-[#edf2e9] px-5 py-16 sm:px-8 sm:py-20" data-scroll-reveal="up" id="pricing">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text("Pricing preview")}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{text("Start small. Grow when you’re ready.")}</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-[#647771]">{text("Preview prices only. Paid plans and checkout are not active yet.")}</p>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-scroll-stagger>
            {plans.map((plan) => (
              <article className={`kuro-panel rounded-md border p-5 ${plan.featured ? "border-[#173d39] bg-[#173d39] text-white" : "border-[#d8e1d8] bg-[#fbfcf8] text-[#173d39]"}`} data-scroll-reveal="up" key={plan.name}>
                <h3 className="text-sm font-bold">{text(plan.name)}</h3>
                <p className="mt-5 text-3xl font-black">{plan.price}<span className="ml-1 text-sm font-medium">{plan.unit || ""}</span></p>
                <p className={`mt-3 min-h-12 text-sm leading-6 ${plan.featured ? "text-white/75" : "text-[#647771]"}`}>{text(plan.detail)}</p>
                {plan.name === "Free" ? (
                  <Link className="mt-6 inline-flex w-full justify-center rounded bg-[#e96247] px-4 py-2.5 text-sm font-bold text-white" href="/register">{text(plan.action)}</Link>
                ) : (
                  <span className="mt-6 inline-flex w-full justify-center rounded border border-current/20 px-4 py-2.5 text-sm font-bold opacity-70">{text(plan.action)}</span>
                )}
              </article>
            ))}
          </div>
          <a className="mt-6 inline-flex text-sm font-bold text-[#245c55] hover:text-[#d6533d]" href="#features">{text("Compare the platform preview")} <span aria-hidden="true" className="ml-2">&#8594;</span></a>
        </div>
      </section>

      <section className="kuro-page bg-[#fbfcf8] px-5 py-14 sm:px-8" aria-label={text("Event outcomes")} data-scroll-reveal="up">
        <div className="mx-auto grid max-w-7xl gap-6 border-y border-[#dfe7df] py-8 sm:grid-cols-3">
          {[
            ["Before", "Clear event pages and details"],
            ["During", "A smoother guest welcome"],
            ["After", "Useful context for next time"],
          ].map(([label, outcome]) => (
            <div key={label}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#d6533d]">{text(`${label} the event`)}</p>
              <p className="mt-2 text-lg font-bold text-[#173d39]">{text(outcome)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="kuro-page bg-[#fbfcf8] px-5 py-16 sm:px-8 sm:py-20" data-scroll-reveal="up" id="resources">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text("Field notes")}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{text("Ideas for the next event.")}</h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3" data-scroll-stagger>
            {[
              ["WEBINARS", "A practical checklist for fewer no-shows", "Build a clearer reminder and follow-up rhythm for online events."],
              ["COMMUNITY", "Planning a barangay event, step by step", "A simple way to organize the details residents need before they arrive."],
              ["EVENT TECH", "Where AI can help an event team", "A grounded look at useful automation and the decisions people should keep."],
            ].map(([tag, title, summary]) => (
              <article className="kuro-panel border-t-2 border-[#ed6148] pt-4" data-scroll-reveal="up" key={title}>
                <p className="text-[10px] font-bold tracking-[0.14em] text-[#d6533d]">{text(tag)} · {text("COMING SOON")}</p>
                <h3 className="mt-3 text-lg font-bold leading-snug">{text(title)}</h3>
                <p className="mt-2 text-sm leading-6 text-[#647771]">{text(summary)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="kuro-soft bg-[#edf2e9] px-5 py-16 sm:px-8 sm:py-20" data-scroll-reveal="up" id="faq">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">{text("Good questions")}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{text("Before you get started.")}</h2>
            <p className="mt-4 text-sm leading-6 text-[#647771]">{text("A straight answer about what is available in this preview.")}</p>
          </div>
          <div className="divide-y divide-[#d4ded5] border-y border-[#d4ded5]" data-scroll-stagger>
            {faqs.map(([question, answer]) => (
              <details className="group py-4" data-scroll-reveal="up" key={question}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-[#173d39]">
                  {text(question)}<span aria-hidden="true" className="text-lg text-[#d6533d] group-open:rotate-45">+</span>
                </summary>
                <p className="max-w-2xl pt-3 text-sm leading-6 text-[#647771]">{text(answer)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="kuro-band bg-[#173d39] px-5 py-14 text-white sm:px-8 sm:py-16" data-scroll-reveal="up" id="newsletter">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ffcf72]">{text("Product updates")}</p>
            <h2 className="mt-2 text-2xl font-bold">{text("Get KURO event notes in your inbox.")}</h2>
            <p className="mt-2 text-sm text-white/70">{text("Newsletter signup is coming soon. Create an account to follow the product preview.")}</p>
          </div>
          <Link className="shrink-0 rounded-md bg-[#ffcf72] px-5 py-3 text-sm font-bold text-[#173d39] hover:bg-[#ffdc98]" href="/register">{text("Join KURO")}</Link>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#e96247] px-5 py-16 text-white sm:px-8 sm:py-20" data-scroll-reveal="up" id="contact">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row md:items-center">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/75">{text("Your next event starts here")}</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-5xl">{text("Ready to make your best event easier to run?")}</h2>
            <p className="mt-4 text-sm text-white/85 sm:text-base">{text("Start with a free account. No credit card required.")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link className="rounded-md bg-white px-5 py-3 text-sm font-bold text-[#173d39] hover:bg-[#fff6e6]" href="/register">{text("Get started free")}</Link>
            <Link className="rounded-md border border-white/70 px-5 py-3 text-sm font-bold text-white hover:bg-white/10" href="#demo">{text("See the product preview")}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}