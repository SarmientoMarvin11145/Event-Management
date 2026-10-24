import Image from "next/image";
import Link from "next/link";
import SignOutButton from "@/components/sign-out-button";

const groups = [
  {
    label: "Workspace",
    links: [
      ["Overview", "/superadmin/dashboard", "▦"],
      ["Applications", "/superadmin/applications", "▤"],
      ["Organizations", "/superadmin/organizations", "▥"],
      ["Users", "/superadmin/users", "♙"],
      ["Events", "/superadmin/events", "▣"],
    ],
  },
  {
    label: "Business",
    links: [
      ["Revenue", "/superadmin/revenue", "＄"],
      ["Analytics", "/superadmin/analytics", "⌁"],
    ],
  },
  {
    label: "Platform",
    links: [
      ["Notifications", "/superadmin/notifications", "♢"],
      ["Emails", "/superadmin/emails", "✉"],
      ["Content", "/superadmin/content", "▧"],
      ["Feature flags", "/superadmin/features", "⚑"],
      ["System", "/superadmin/system", "⌘"],
      ["Audit logs", "/superadmin/logs", "≡"],
      ["Security", "/superadmin/security", "⬡"],
      ["Integrations", "/superadmin/integrations", "⛓"],
      ["Support", "/superadmin/support", "?"],
    ],
  },
  {
    label: "Personal",
    links: [
      ["Tasks", "/superadmin/tasks", "✓"],
      ["Settings", "/superadmin/settings", "⚙"],
      ["My profile", "/superadmin/profile", "◉"],
    ],
  },
];

export default function SuperadminShell({ children }) {
  return (
    <div className="min-h-screen bg-[#f3f5f7] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <Link className="flex shrink-0 items-center gap-2 font-black tracking-[0.12em]" href="/superadmin">
            <span className="flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white p-0.5">
              <Image alt="" aria-hidden="true" className="size-full object-contain" height={36} priority src="/kuro logo-edited.png" unoptimized width={36} />
            </span>
            <span className="hidden sm:inline">KURO</span>
            <span className="hidden rounded-full bg-[#173d39] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white lg:inline-flex">Platform</span>
          </Link>
          <form action="/superadmin/search" className="ml-2 hidden min-w-32 max-w-xl flex-1 sm:flex" role="search">
            <label className="sr-only" htmlFor="superadmin-global-search">Search platform</label>
            <input className="min-w-0 flex-1 rounded-l-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#245c55] focus:ring-2 focus:ring-[#245c55]/15" id="superadmin-global-search" name="q" placeholder="Search organizations, users, events..." type="search" />
            <button className="rounded-r-md bg-[#173d39] px-4 text-sm font-semibold text-white hover:bg-[#245c55]" type="submit">Search</button>
          </form>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link aria-label="Notifications and broadcasts" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/superadmin/notifications">Alerts</Link>
            <Link aria-label="Support requests" className="hidden rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 md:inline-flex" href="/superadmin/support">Support</Link>
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Superadmin ▾</summary>
              <div className="absolute right-0 z-40 mt-2 grid min-w-48 gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-xl">
                <Link className="rounded px-3 py-2 text-sm hover:bg-slate-50" href="/superadmin/profile">My profile</Link>
                <Link className="rounded px-3 py-2 text-sm hover:bg-slate-50" href="/superadmin/settings">Platform settings</Link>
                <div className="px-3 py-2"><SignOutButton /></div>
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1600px] gap-0 md:grid-cols-[245px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-r border-slate-800 bg-[#142d2a] px-3 py-5 text-white md:block">
          <nav aria-label="Superadmin navigation" className="space-y-6">
            {groups.map((group) => (
              <div key={group.label}>
                <h2 className="px-3 text-[10px] font-bold uppercase tracking-[0.17em] text-white/45">{group.label}</h2>
                <ul className="mt-2 space-y-1">
                  {group.links.map(([label, href, icon]) => (
                    <li key={href}>
                      <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white" href={href}>
                        <span aria-hidden="true" className="w-5 text-center text-base text-[#ffcf72]">{icon}</span>{label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-8">
          <nav aria-label="Superadmin mobile navigation" className="mb-6 flex gap-2 overflow-x-auto pb-2 md:hidden">
            {groups.flatMap((group) => group.links).map(([label, href]) => (
              <Link className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700" href={href} key={href}>{label}</Link>
            ))}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
