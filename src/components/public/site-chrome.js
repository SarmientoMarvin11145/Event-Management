"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
    { href: "/events", label: "Explore events" },
    { href: "/my-tickets", label: "My tickets" },
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

        <div className="hidden items-center gap-5 xl:flex">
          {navLinks.map((link) => (
            <Link className="text-sm font-semibold text-[#526864] hover:text-[#ed6148]" href={link.href} key={link.href}>
              {text(link.label)}
            </Link>
          ))}
          <Link className="text-sm font-semibold text-[#526864] hover:text-[#ed6148]" href="/apply-organizer">
            {text("For organizers")}
          </Link>
        </div>

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
          <div className="grid grid-cols-2 gap-1">
            {[...navLinks, { href: "/apply-organizer", label: "For organizers" }].map((link) => (
            <Link className="rounded px-3 py-2.5 text-sm font-semibold text-[#526864] hover:bg-[#edf2e9]" href={link.href} key={link.href} onClick={() => setMenuOpen(false)}>
                {text(link.label)}
            </Link>
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
            {text("Discover local events, reserve tickets, and keep every event plan in one place.")}
          </p>
          <p className="mt-5 text-xs text-[#8fa69e]">{text("Find your people. Find your next event.")}</p>
        </div>
        <FooterColumn locale={locale} title={text("Discover")} links={[["Browse all events", "/events"], ["Free events", "/events?price=free"], ["Paid events", "/events?price=paid"]]} />
        <FooterColumn locale={locale} title={text("For organizers")} links={[["Apply to host events", "/apply-organizer"], ["Organizer sign in", "/login"]]} />
        <FooterColumn locale={locale} title={text("Help & information")} links={[["Help center", "/help"], ["Privacy policy", "/privacy"], ["Terms & conditions", "/terms"]]} />
        {loading ? (
          <FooterColumn locale={locale} title={text("Your account")} links={[["My tickets", "/my-tickets"], ["Saved events", "/favorites"], ["Log in", "/login"], ["Create account", "/register"]]} />
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
    </footer>
  );
}

export function PublicMobileNav() {
  return (
    <Suspense fallback={<MobileNavPlaceholder />}>
      <PublicMobileNavLinks />
    </Suspense>
  );
}

function MobileNavPlaceholder() {
  return (
    <nav aria-hidden="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e2e8e1] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(23,61,57,0.08)] backdrop-blur lg:hidden">
      <div className="mx-auto grid min-h-16 max-w-lg grid-cols-5" />
    </nav>
  );
}

function PublicMobileNavLinks() {
  const pathname = usePathname();
  const currentPath = pathname || "/";
  const locale = useLocale();
  const text = (value) => translate(locale, value);
  const links = [
    { href: "/", label: "Home", icon: "M3 10.8 12 3l9 7.8v9.1a1.1 1.1 0 0 1-1.1 1.1h-5.2v-6.2h-5.4V21H4.1A1.1 1.1 0 0 1 3 19.9z", active: currentPath === "/" },
    { href: "/events", label: "Explore", icon: "M10.5 18a7.5 7.5 0 1 1 5.3-2.2L21 21m-10.5-6a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9", active: currentPath.startsWith("/events") || currentPath.startsWith("/e/") },
    { href: "/my-tickets", label: "Tickets", icon: "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v3a2 2 0 0 0 0 4v3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5v-3a2 2 0 0 0 0-4zM12 7v1m0 3v1m0 3v1", active: currentPath.startsWith("/my-tickets") },
    { href: "/favorites", label: "Saved", icon: "M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.8 4.8 0 0 1 12 6.3a4.8 4.8 0 0 1 8.8 2.5Z", active: currentPath.startsWith("/favorites") },
    { href: "/profile", label: "Profile", icon: "M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", active: currentPath.startsWith("/profile") || currentPath === "/login" || currentPath === "/register" },
  ];

  return (
    <nav aria-label={text("Shop navigation")} className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e2e8e1] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(23,61,57,0.08)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {links.map((link) => (
          <li key={link.href}>
            <Link aria-current={link.active ? "page" : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold ${link.active ? "text-[#d6533d]" : "text-[#71817b]"}`} href={link.href}>
              <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d={link.icon} />
              </svg>
              <span>{text(link.label)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
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