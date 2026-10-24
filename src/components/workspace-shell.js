import Link from "next/link";
import Image from "next/image";
import SignOutButton from "@/components/sign-out-button";
import ThemeSync from "@/components/user/theme-sync";
import NotificationMenu from "@/components/user/notification-menu";

const mobileLinks = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/my-tickets", label: "Tickets", icon: "▣" },
  { href: "/events", label: "Discover", icon: "⌕" },
  { href: "/notifications", label: "Alerts", icon: "♢" },
  { href: "/profile", label: "Profile", icon: "◉" },
];

export default function WorkspaceShell({ title, links, children, initialTheme = "system", initialLocale = "en", notifications = [], userWorkspace = false }) {
  return (
    <div className={userWorkspace ? "kuro-page min-h-screen bg-[#f6f7f2] text-[#193532]" : "kuro-page min-h-screen bg-slate-50"}>
      <ThemeSync locale={userWorkspace ? initialLocale : undefined} theme={initialTheme} />
      <header className={userWorkspace ? "kuro-nav sticky top-0 z-20 border-b border-[#dce4dc] bg-white" : "kuro-nav sticky top-0 z-20 border-b border-slate-200 bg-white"}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link className={userWorkspace ? "text-lg font-bold tracking-tight text-[#173d39]" : "text-lg font-bold tracking-tight text-slate-950"} href="/">
            <span className="inline-flex items-center gap-2">
              <span className={userWorkspace ? "flex size-8 items-center justify-center rounded-md border border-[#dce4dc] bg-white p-0.5" : "flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white p-0.5"}>
                <Image alt="" aria-hidden="true" className="size-full object-contain" height={32} priority src="/kuro logo-edited.png" unoptimized width={32} />
              </span>
              KURO
            </span>
            {!userWorkspace && <span className="ml-2 text-sm font-medium text-slate-500">{title}</span>}
          </Link>
          <div className="flex items-center gap-3">
            {userWorkspace && (
              <>
                <form action="/events" className="hidden w-56 md:flex" role="search">
                  <label className="sr-only" htmlFor="workspace-search">Search events</label>
                  <input className="kuro-input min-w-0 flex-1 rounded-l-md border border-[#cbd8d1] bg-white px-3 py-2 text-sm" id="workspace-search" name="q" placeholder="Search events..." type="search" />
                  <button className="rounded-r-md bg-[#173d39] px-3 text-xs font-bold text-white" type="submit">Search</button>
                </form>
                <NotificationMenu notifications={notifications} />
                <Link aria-label="Messages" className="kuro-nav-control hidden rounded-md border border-[#dce4dc] px-3 py-2 text-sm font-semibold text-[#245c55] hover:bg-[#f4f6f1] sm:inline-flex" href="/messages">Inbox</Link>
                <details className="relative hidden sm:block">
                  <summary className="kuro-nav-control cursor-pointer list-none rounded-md border border-[#dce4dc] px-3 py-2 text-sm font-semibold text-[#245c55] hover:bg-[#f4f6f1]">Account ▾</summary>
                  <div className="kuro-panel absolute right-0 z-30 mt-2 grid min-w-48 gap-1 rounded-md border border-[#dce4dc] bg-white p-2 shadow-xl">
                    {[["/profile", "My profile"], ["/my-tickets", "My tickets"], ["/certificates", "Certificates"], ["/settings", "Settings"]].map(([href, label]) => <Link className="kuro-menu-link rounded px-3 py-2 text-sm text-[#526864] hover:bg-[#f4f6f1]" href={href} key={href}>{label}</Link>)}
                  </div>
                </details>
              </>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className={userWorkspace ? "mx-auto grid max-w-7xl gap-8 px-5 py-6 pb-24 sm:px-8 sm:py-8 sm:pb-28 md:grid-cols-[220px_minmax(0,1fr)]" : "mx-auto grid max-w-7xl gap-8 px-6 py-8 md:grid-cols-[220px_minmax(0,1fr)]"}>
        <nav aria-label={`${title} navigation`} className={userWorkspace ? "hidden gap-1 md:flex md:flex-col" : "flex gap-2 overflow-x-auto md:flex-col"}>
          {links.map(({ href, label }) => (
            <Link
              className={userWorkspace ? "whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-medium text-[#526864] hover:bg-white hover:text-[#d6533d]" : "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:text-[#d6533d]"}
              href={href}
              key={href}
            >
              {label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
      {userWorkspace && (
        <nav aria-label="Mobile navigation" className="kuro-nav fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[#dce4dc] bg-white px-1 py-2 md:hidden">
          {mobileLinks.map(({ href, icon, label }) => (
            <Link className="flex flex-col items-center gap-1 rounded-md px-1 py-1 text-[10px] font-semibold text-[#526864] hover:text-[#d6533d]" href={href} key={href}>
              <span aria-hidden="true" className="text-lg leading-none">{icon}</span>{label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}