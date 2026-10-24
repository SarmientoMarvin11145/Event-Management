import Link from "next/link";
import { saveSettings } from "@/app/(user)/actions";
import { getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { Panel, PortalHeading, StatusMessage } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Settings | KURO" };

const notificationOptions = [
  ["event_reminders", "Event reminders"],
  ["registration_confirmations", "Registration confirmations"],
  ["certificate_issued", "Certificate issued"],
  ["organization_events", "New events from followed organizations"],
  ["platform_updates", "Platform updates"],
  ["promotions", "Promotions and offers"],
];

export default async function SettingsPage({ searchParams }) {
  await requireFeatureEnabled("user-settings");
  const params = await searchParams;
  const { supabase, user } = await getAttendeeSession();
  const { data, error } = await supabase.from("attendee_settings").select("*").eq("user_id", user.id).maybeSingle();
  throwOnSupabaseError(error);
  const notifications = data?.notification_preferences || {};
  const privacy = data?.privacy_preferences || {};
  const appearance = data?.appearance_preferences || {};

  return (
    <div className="space-y-6">
      <PortalHeading title="Settings" description="Control the attendee experience and how your account information is shared." />
      {params?.saved && <StatusMessage tone="success">Your settings have been saved.</StatusMessage>}
      <form action={saveSettings} className="space-y-5">
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Notifications</h2>
          <p className="mt-1 text-sm text-[#61736e]">These preferences are saved to your account. In-app registration and certificate alerts use their toggles; email, SMS, push, scheduled reminders, and promotional delivery are not connected.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {notificationOptions.map(([name, label]) => (
              <label className="flex items-center gap-3 rounded-md border border-[#e3e9e2] p-3 text-sm text-[#526864]" key={name}>
                <input defaultChecked={notifications[name] ?? name !== "promotions"} name={name} type="checkbox" />
                {label}
              </label>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Privacy</h2>
          <div className="mt-4 grid gap-3">
            <label className="max-w-sm text-sm font-semibold text-[#526864]">Profile visibility
              <select className="kuro-input mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 font-normal" defaultValue={privacy.profile_visibility || "private"} name="profile_visibility">
                <option value="private">Private</option><option value="public">Public</option>
              </select>
            </label>
            <Checkbox name="show_in_attendee_lists" checked={privacy.show_in_attendee_lists} label="Show my name in event attendee lists" />
            <Checkbox name="share_contact_with_organizers" checked={privacy.share_contact_with_organizers} label="Allow organizers to view my contact information" />
          </div>
          <p className="mt-3 text-xs leading-5 text-[#7a8b84]">These preferences are stored now; public profiles and organizer contact-sharing surfaces are not active yet.</p>
        </Panel>
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Appearance & language</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[#526864]">Theme
              <select className="kuro-input mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 font-normal" defaultValue={appearance.theme || "system"} name="theme">
                <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-[#526864]">Language
              <select className="kuro-input mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 font-normal" defaultValue={appearance.language || "en"} name="language">
                <option value="en">English</option><option value="fil">Filipino</option><option value="ceb">Cebuano</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-[#7a8b84]">Timezone: Asia/Manila. Dates use the browser’s locale.</p>
        </Panel>
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Security & account</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="rounded-md border border-[#cbd8d1] px-4 py-2.5 text-sm font-semibold text-[#245c55]" href="/forgot-password">Reset password</Link>
            <a className="rounded-md border border-[#cbd8d1] px-4 py-2.5 text-sm font-semibold text-[#245c55]" href="/history/export">Export event history</a>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#7a8b84]">Two-factor authentication, active-session management, login history, connected accounts, and account deletion are not available in this preview.</p>
        </Panel>
        <div className="flex justify-end">
          <button className="rounded-md bg-[#173d39] px-5 py-3 text-sm font-bold text-white hover:bg-[#245c55]" type="submit">Save settings</button>
        </div>
      </form>
    </div>
  );
}

function Checkbox({ name, checked, label }) {
  return (
    <label className="flex items-center gap-3 text-sm text-[#526864]">
      <input defaultChecked={Boolean(checked)} name={name} type="checkbox" />
      {label}
    </label>
  );
}
