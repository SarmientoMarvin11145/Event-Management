"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { setLocale, translate, useLocale } from "@/lib/locale";
import SignOutButton from "@/components/sign-out-button";

export function PublicNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const locale = useLocale();
  const text = (value) => translate(locale, value);
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
    const savedTheme = window.localStorage.getItem("kuro-theme");
    const isDark = savedTheme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    document.documentElement.lang = locale === "fil" ? "fil" : locale === "ceb" ? "ceb" : "en";
  }, [locale]);

  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("kuro-theme", nextTheme);
  }

  const navLinks = [
    { href: "/#features", label: "Features" },
    { href: "/#events", label: "Events" },
    { href: "/#about", label: "About" },
    { href: "/#contact", label: "Contact" },
  ];

  return (
    <header className="kuro-nav sticky top-0 z-40 border-b border-[#dfe7df] bg-[#fbfcf8]/95 text-[#183c38] backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link aria-label="KURO home" className="flex shrink-0 items-center gap-2.5" href="/">
          <span className="flex size-9 items-center justify-center rounded-md border border-[#dfe7df] bg-white p-0.5">
            <Image alt="" aria-hidden="true" className="size-full object-contain" height={36} priority src="/kuro logo-edited.png" unoptimized width={36} />
          </span>
          <span className="text-xl font-black tracking-[0.08em]">KURO</span>
        </Link>

        <div className="hidden items-center gap-3 xl:flex">
          {navLinks.slice(0, 2).map((link) => (
            <a className="text-sm font-semibold text-[#526864] hover:text-[#ed6148]" href={link.href} key={link.href}>
              {text(link.label)}
            </a>
          ))}
          <details className="group relative">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[#526864] hover:text-[#ed6148]">
              {text("For teams")} <span aria-hidden="true">&#9662;</span>
            </summary>
            <div className="kuro-panel absolute left-0 top-full z-50 mt-3 min-w-48 rounded-md border border-[#dfe7df] bg-white p-2 shadow-xl">
              {[
                ["Schools", "/#for-schools"],
                ["Restaurants", "/#for-restaurants"],
                ["Barangay & LGU", "/#for-lgu"],
                ["Webinars", "/#for-webinars"],
                ["Expos", "/#for-expos"],
                ["Private events", "/#for-private-events"],
                ["Apply as an organizer", "/#organizers"],
                ["About", "/#about"],
                ["Contact", "/#contact"],
              ].map(([label, href]) => (
                <a className="block rounded px-3 py-2 text-sm text-[#526864] hover:bg-[#f0f5ed] hover:text-[#183c38]" href={href} key={href}>
                  {text(label)}
                </a>
              ))}
            </div>
          </details>
        </div>

        <form action="/events" className="hidden min-w-0 flex-1 lg:flex" role="search">
          <label className="sr-only" htmlFor="site-event-search">Search public events</label>
          <input
            className="kuro-input min-w-0 w-full rounded-l-md border border-r-0 border-[#d5dfd7] bg-white px-3 py-2 text-sm text-[#183c38] outline-none placeholder:text-[#87958f] focus:border-[#38665e]"
            id="site-event-search"
            name="q"
            placeholder={text("Search events")}
            type="search"
          />
          <button className="shrink-0 rounded-r-md bg-[#183c38] px-4 text-xs font-bold text-white hover:bg-[#29574f]" type="submit">
            {text("Search")}
          </button>
        </form>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <label className="sr-only" htmlFor="site-language">Language</label>
          <select className="kuro-input min-w-24 rounded border border-transparent bg-transparent px-1 py-2 text-xs font-semibold text-[#526864]" id="site-language" onChange={(event) => setLocale(event.target.value)} value={locale}>
            <option value="en">{text("English")}</option>
            <option value="fil">{text("Filipino")}</option>
            <option value="ceb">{text("Cebuano")}</option>
          </select>
          <button
            aria-label="Toggle light and dark mode"
            className="rounded border border-[#d5dfd7] px-2.5 py-2 text-xs font-bold text-[#526864] hover:border-[#38665e]"
            onClick={toggleTheme}
            type="button"
          >
            Theme
          </button>
          {loading ? (
            <Link className="px-2 text-sm font-semibold text-[#183c38] pointer-events-none opacity-50" href="/login">{text("Log in")}</Link>
          ) : user ? (
            <>
              <span className="text-xs text-[#526864]">{user.email}</span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link className="px-2 text-sm font-semibold text-[#183c38]" href="/login">{text("Log in")}</Link>
              <Link className="rounded-md bg-[#ed6148] px-3.5 py-2.5 text-sm font-bold text-white hover:bg-[#d74d37]" href="/register">{text("Get started")}</Link>
            </>
          )}
        </div>

        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="flex size-10 items-center justify-center rounded-md border border-[#d5dfd7] text-lg font-bold text-[#183c38] lg:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          type="button"
        >
          {menuOpen ? "×" : "☰"}
        </button>
      </nav>

      {menuOpen && (
        <div className="kuro-panel border-t border-[#dfe7df] bg-[#fbfcf8] px-5 py-4 lg:hidden">
          <form action="/events" className="mb-3 flex" role="search">
            <label className="sr-only" htmlFor="mobile-event-search">Search public events</label>
            <input className="kuro-input min-w-0 flex-1 rounded-l-md border border-[#d5dfd7] bg-white px-3 py-2.5 text-sm" id="mobile-event-search" name="q" placeholder={text("Search events")} type="search" />
            <button className="shrink-0 rounded-r-md bg-[#183c38] px-3 text-xs font-bold text-white" type="submit">{text("Search")}</button>
          </form>
          <div className="grid grid-cols-2 gap-1">
            {[...navLinks, { href: "/#sectors", label: "Sectors" }, { href: "/#organizers", label: "Apply as an organizer" }].map((link) => (
              <a className="rounded px-3 py-2.5 text-sm font-semibold text-[#526864] hover:bg-[#edf2e9]" href={link.href} key={link.href} onClick={() => setMenuOpen(false)}>
                {text(link.label)}
              </a>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#dfe7df] pt-3">
            <label className="sr-only" htmlFor="mobile-site-language">Language</label>
            <select className="kuro-input min-w-28 rounded border border-[#d5dfd7] bg-white px-2 py-2 text-xs font-semibold" id="mobile-site-language" onChange={(event) => setLocale(event.target.value)} value={locale}>
              <option value="en">{text("English")}</option>
              <option value="fil">{text("Filipino")}</option>
              <option value="ceb">{text("Cebuano")}</option>
            </select>
            <button className="text-xs font-bold text-[#245c55]" onClick={toggleTheme} type="button">
              Toggle light / dark mode
            </button>
          </div>
          <div className="mt-3 flex gap-3">
            {loading ? (
              <Link className="flex-1 rounded-md border border-[#cbd8d1] px-4 py-2.5 text-center text-sm font-bold pointer-events-none opacity-50" href="/login">{text("Log in")}</Link>
            ) : user ? (
              <>
                <span className="text-xs text-[#526864]">{user.email}</span>
                <SignOutButton />
              </>
            ) : (
              <>
                <Link className="flex-1 rounded-md border border-[#cbd8d1] px-4 py-2.5 text-center text-sm font-bold" href="/login">{text("Log in")}</Link>
                <Link className="flex-1 rounded-md bg-[#ed6148] px-4 py-2.5 text-center text-sm font-bold text-white" href="/register">{text("Get started")}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  const locale = useLocale();
  const text = (value) => translate(locale, value);
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

  return (
    <footer className="kuro-footer bg-[#142d2a] px-5 pb-24 pt-14 text-white sm:px-8 sm:pb-10">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link className="inline-flex items-center gap-2.5 text-xl font-black tracking-[0.12em]" href="/">
            <span className="flex size-9 items-center justify-center rounded-md bg-white p-0.5">
              <Image alt="" aria-hidden="true" className="size-full object-contain" height={36} priority src="/kuro logo-edited.png" unoptimized width={36} />
            </span>
            KURO
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-6 text-[#b7c8c2]">
            {text("One workspace for events, people, and the moments that bring them together.")}
          </p>
          <p className="mt-5 text-xs text-[#8fa69e]">{text("Built for event teams in the Philippines.")}</p>
        </div>
        <FooterColumn locale={locale} title={text("Product")} links={[["Features", "/#features"], ["Events", "/events"], ["Pricing", "/#pricing"], ["Demo", "/#demo"]]} />
        <FooterColumn locale={locale} title={text("For teams")} links={[["Schools", "/#for-schools"], ["Restaurants", "/#for-restaurants"], ["LGUs", "/#for-lgu"], ["Webinars", "/#for-webinars"], ["Expos", "/#for-expos"], ["Apply as an organizer", "/#organizers"]]} />
        <FooterColumn locale={locale} title={text("Resources")} links={[["Guides", "/#resources"], ["FAQs", "/#faq"], ["Contact", "/#contact"], ["Status", "/#about"]]} />
        {loading ? (
          <FooterColumn locale={locale} title={text("Account")} links={[["Log in", "/login"], ["Create account", "/register"], ["Privacy Policy", "/privacy"], ["Terms & Conditions", "/terms"]]} />
        ) : user ? (
          <>
            <div className="mt-4 space-y-3">
              <span className="text-sm text-[#b7c8c2]">{user.email}</span>
              <SignOutButton />
            </div>
          </>
        ) : (
          <FooterColumn locale={locale} title={text("Account")} links={[["Log in", "/login"], ["Create account", "/register"], ["Privacy Policy", "/privacy"], ["Terms & Conditions", "/terms"]]} />
        )}
      </div>
      <div className="mx-auto mt-12 flex max-w-7xl flex-wrap justify-between gap-3 border-t border-white/15 pt-5 text-xs text-[#9cb0a9]">
        <span>© 2026 KURO. {text("All rights reserved.")}</span>
        <span>Privacy-first by design · Terms of service</span>
      </div>
      <Link className="fixed bottom-4 right-4 z-40 rounded-md bg-[#ed6148] px-4 py-3 text-sm font-bold text-white shadow-lg hover:bg-[#d74d37] sm:hidden" href="/register">
        Get started free
      </Link>
    </footer>
  );
}

function FooterColumn({ locale, title, links }) {
  return (
    <div>
      <h2 className="text-sm font-bold">{title}</h2>
      <ul className="mt-4 space-y-3">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link className="text-sm text-[#b7c8c2] hover:text-white" href={href}>{translate(locale, label)}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}