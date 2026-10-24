import Link from "next/link";
import { markNotificationRead } from "@/app/(user)/actions";

export default function NotificationMenu({ notifications = [] }) {
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <details className="relative">
      <summary aria-label="Notifications" className="kuro-nav-control cursor-pointer list-none rounded-md border border-[#dce4dc] px-3 py-2 text-sm font-semibold text-[#245c55] hover:bg-[#f4f6f1]">
        Alerts{unreadCount > 0 && <span className="ml-1 rounded-full bg-[#ed6148] px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>}
      </summary>
      <div className="kuro-panel absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-md border border-[#dce4dc] bg-white p-3 shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[#e8eee7] pb-2">
          <p className="text-sm font-bold text-[#173d39]">Notifications</p>
          <Link className="text-xs font-bold text-[#245c55]" href="/notifications">View all</Link>
        </div>
        {notifications.length ? (
          <ul className="max-h-80 divide-y divide-[#e8eee7] overflow-auto">
            {notifications.map((notification) => (
              <li className="py-3" key={notification.id}>
                {notification.link ? (
                  <Link className="text-sm font-semibold text-[#173d39] hover:underline" href={notification.link}>{notification.title}</Link>
                ) : (
                  <p className="text-sm font-semibold text-[#173d39]">{notification.title}</p>
                )}
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#61736e]">{notification.message}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-[#7a8b84]">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(notification.created_at))}</span>
                  {!notification.is_read && (
                    <form action={markNotificationRead}>
                      <input name="notification_id" type="hidden" value={notification.id} />
                      <button className="text-xs font-bold text-[#245c55] underline" type="submit">Mark read</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-5 text-sm text-[#61736e]">You’re all caught up.</p>
        )}
      </div>
    </details>
  );
}
