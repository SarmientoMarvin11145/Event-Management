import Link from "next/link";
import { markNotificationRead } from "@/app/(user)/actions";
import { getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { EmptyState, Panel, PortalHeading } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Notifications | KURO" };

export default async function NotificationsPage() {
  await requireFeatureEnabled("notifications");
  const { supabase, user } = await getAttendeeSession();
  const { data, error } = await supabase.from("notifications").select("id, type, title, message, link, is_read, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  throwOnSupabaseError(error);
  const notifications = data || [];

  return (
    <div className="space-y-6">
      <PortalHeading title="Notifications" description="Event reminders, registration updates, certificates, and announcements for your account." />
      {notifications.length ? (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Panel className="!p-4 sm:!p-5" key={notification.id}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-[#173d39]">{notification.title}</h2>
                    {!notification.is_read && <span className="rounded-full bg-[#ed6148] px-2 py-0.5 text-[10px] font-bold uppercase text-white">New</span>}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[#61736e]">{notification.message}</p>
                  <p className="mt-2 text-xs text-[#7a8b84]">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.created_at))}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {notification.link && <Link className="rounded-md border border-[#cbd8d1] px-3 py-2 text-xs font-bold text-[#245c55]" href={notification.link}>Open</Link>}
                  {!notification.is_read && (
                    <form action={markNotificationRead}>
                      <input name="notification_id" type="hidden" value={notification.id} />
                      <button className="rounded-md bg-[#173d39] px-3 py-2 text-xs font-bold text-white" type="submit">Mark read</button>
                    </form>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState title="You’re all caught up" description="New notifications will appear here when they are sent to your account." href="/dashboard" action="Back to dashboard" />
      )}
    </div>
  );
}
