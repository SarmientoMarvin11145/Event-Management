import Link from "next/link";
import Image from "next/image";
import SignOutButton from "@/components/sign-out-button";
import ThemeSync from "@/components/user/theme-sync";
import NotificationMenu from "@/components/user/notification-menu";

const mobileLinks = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/my-tickets", label: "Tickets", icon: "▣" },
  { href: "/browse-events", label: "Discover", icon: "⌕" },
  { href: "/favorites", label: "Saved", icon: "♡" },
  { href: "/profile", label: "Profile", icon: "◉" },
];

export default function WorkspaceShell({ title, links, children, initialTheme = "system", initialLocale = "en", notifications = [], profileName, profileAvatarUrl, profileRole, setupNotice, userWorkspace = false }) {
  const adminWorkspaceLink = links.find(({ href }) => href === "/admin/dashboard" || href === "/superadmin/dashboard");

  return (
    <div className={userWorkspace ? "kuro-page min-h-screen bg-[#f6f7f2] text-[#193532]" : "kuro-page min-h-screen bg-slate-50"}>
      <ThemeSync locale={userWorkspace ? initialLocale : undefined} theme={initialTheme} />
      <header className={userWorkspace ? "kuro-nav sticky top-0 z-20 border-b border-[#dce4dc] bg-white" : "kuro-nav sticky top-0 z-20 border-b border-slate-200 bg-white"}>
        <div className={userWorkspace ? "mx-auto flex max-w-7xl flex-row items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8" : "mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8"}>
          <Link className={userWorkspace ? "shrink-0 text-lg font-bold tracking-tight text-[#173d39]" : "text-lg font-bold tracking-tight text-slate-950"} href="/">
            <span className="inline-flex items-center gap-2">
              <span className={userWorkspace ? "flex size-8 items-center justify-center rounded-md border border-[#dce4dc] bg-white p-0.5" : "flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white p-0.5"}>
                <Image alt="" aria-hidden="true" className="size-full object-contain" height={32} priority src="/kuro logo-edited.png" unoptimized width={32} />
              </span>
              KURO
            </span>
            {!userWorkspace && <span className="ml-2 text-sm font-medium text-slate-500">{title}</span>}
          </Link>
          <div className={userWorkspace ? "flex min-w-0 items-center justify-end gap-2 sm:gap-3" : "flex items-center gap-3"}>
            {userWorkspace && (
              <>
                {adminWorkspaceLink && (
                  <Link aria-label="Admin workspace" className="kuro-nav-control hidden shrink-0 items-center justify-center rounded-md bg-[#173d39] text-white transition hover:bg-[#245c55] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6148] md:inline-flex md:h-auto md:w-auto md:whitespace-nowrap md:px-3 md:py-2 md:text-sm md:font-semibold" href={adminWorkspaceLink.href} title="Admin workspace">
                    <svg aria-hidden="true" className="size-5 md:hidden" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10 21v-4h4v4" />
                    </svg>
                    <span className="hidden md:inline">Admin workspace</span>
                  </Link>
                )}
                <form action="/browse-events" className="hidden w-56 md:flex" role="search">
                  <label className="sr-only" htmlFor="workspace-search">Search events</label>
                  <input className="kuro-input min-w-0 flex-1 rounded-l-md border border-[#cbd8d1] bg-white px-3 py-2 text-sm" id="workspace-search" name="q" placeholder="Search events..." type="search" />
                  <button className="rounded-r-md bg-[#173d39] px-3 text-xs font-bold text-white" type="submit">Search</button>
                </form>
                <NotificationMenu compact={userWorkspace} notifications={notifications} />
                <Link aria-label="Messages" className="kuro-nav-control hidden rounded-md border border-[#dce4dc] px-3 py-2 text-sm font-semibold text-[#245c55] hover:bg-[#f4f6f1] sm:inline-flex" href="/messages">Inbox</Link>
                <details className="relative hidden sm:block">
                  <summary className="kuro-nav-control cursor-pointer list-none rounded-md border border-[#dce4dc] px-3 py-2 text-sm font-semibold text-[#245c55] hover:bg-[#f4f6f1]">Account ▾</summary>
                  <div className="kuro-panel absolute right-0 z-30 mt-2 grid min-w-48 gap-1 rounded-md border border-[#dce4dc] bg-white p-2 shadow-xl">
                    {[["/profile", "My profile"], ["/my-tickets", "My tickets"], ["/certificates", "Certificates"], ["/settings", "Settings"]].map(([href, label]) => <Link className="kuro-menu-link rounded px-3 py-2 text-sm text-[#526864] hover:bg-[#f4f6f1]" href={href} key={href}>{label}</Link>)}
                  </div>
                </details>
              </>
            )}
            {!userWorkspace && (
              <>
                <NotificationMenu notifications={notifications} />
                <Link className="kuro-nav-control flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-slate-700 hover:bg-slate-50" href="/profile">
                  <span
                    aria-label={profileName || "Profile"}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e8eee7] bg-cover bg-center text-sm font-bold text-[#245c55]"
                    role="img"
                    style={profileAvatarUrl ? { backgroundImage: `url("${profileAvatarUrl}")` } : undefined}
                  >
                    {!profileAvatarUrl && (profileName?.trim()?.[0]?.toUpperCase() || "A")}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-36 truncate text-sm font-semibold">{profileName || "My profile"}</span>
                    <span className="block text-xs capitalize text-slate-500">{profileRole || "Administrator"}</span>
                  </span>
                </Link>
                <details className="relative">
                  <summary className="kuro-nav-control cursor-pointer list-none rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    {profileName || "Account"} ▾
                  </summary>
                  <div className="absolute right-0 z-30 mt-2 grid min-w-52 gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="border-b border-slate-100 px-3 py-2">
                      <p className="truncate text-sm font-bold text-slate-900">{profileName || "Administrator"}</p>
                      <p className="mt-0.5 text-xs capitalize text-slate-500">{profileRole || "admin"}</p>
                    </div>
                    <Link className="rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/profile">My profile</Link>
                    <Link className="rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/dashboard">My workspace</Link>
                  </div>
                </details>
              </>
            )}
            {userWorkspace ? (
              <div className="hidden items-center gap-3 md:flex">
                {profileName && (
                  <Link aria-label="My profile" className="flex shrink-0 items-center gap-2 rounded-md border border-[#dce4dc] px-1.5 py-1.5 text-[#245c55] hover:bg-[#f4f6f1] sm:px-2" href="/profile">
                  <span
                    aria-label={profileName}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e8eee7] bg-cover bg-center text-xs font-bold"
                    role="img"
                    style={profileAvatarUrl ? { backgroundImage: `url("${profileAvatarUrl}")` } : undefined}
                  >
                    {!profileAvatarUrl && (profileName.trim()[0]?.toUpperCase() || "U")}
                  </span>
                    <span className="max-w-32 truncate text-sm font-semibold">{profileName}</span>
                  </Link>
                )}
                <SignOutButton className="shrink-0 whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm" />
              </div>
            ) : (
              <SignOutButton />
            )}
          </div>
        </div>
      </header>
      {setupNotice && (
        <div className="mx-auto mt-5 max-w-7xl px-5 sm:px-8">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="alert">
            {setupNotice}
          </p>
        </div>
      )}
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
        <nav aria-label="Mobile navigation" className="kuro-nav fixed inset-x-0 bottom-0 z-[100] isolate grid grid-cols-5 border-t border-[#dce4dc] bg-white px-1 pb-[env(safe-area-inset-bottom)] pt-2 [transform:translateZ(0)] md:hidden">
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