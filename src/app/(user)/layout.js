import { Suspense } from "react";
import Link from "next/link";
import WorkspaceShell from "@/components/workspace-shell";
import { requireAuthenticatedUser } from "@/lib/authorization";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { throwOnSupabaseError } from "@/lib/attendee-data";
import { filterLinksByFlags, getFeatureFlagMap } from "@/lib/features";
import { Panel, StatusMessage } from "@/components/user/portal-ui";

export const instant = false;

const links = [
  { href: "/dashboard", label: "Home" },
  { href: "/my-tickets", label: "My tickets" },
  { href: "/my-events", label: "My events" },
  { href: "/history", label: "History" },
  { href: "/certificates", label: "Certificates" },
  { href: "/favorites", label: "Favorites" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help & support" },
  { href: "/messages", label: "Messages" },
  { href: "/apply-organizer", label: "Apply as organizer" },
];

const linkFlags = {
  "/dashboard": "user-dashboard",
  "/my-tickets": "my-tickets",
  "/my-events": "my-events",
  "/history": "event-history",
  "/certificates": "certificates",
  "/favorites": "favorites",
  "/profile": "user-profile",
  "/settings": "user-settings",
  "/help": "support",
  "/messages": "messaging",
  "/apply-organizer": "organizer-applications",
};

export default function UserLayout({ children }) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50" />}>
      <AuthenticatedUserLayout>{children}</AuthenticatedUserLayout>
    </Suspense>
  );
}

async function AuthenticatedUserLayout({ children }) {
  const user = await requireAuthenticatedUser(["user", "admin", "superadmin"]);
  const supabase = await createSupabaseServerClient();
  const [{ data: settings, error: settingsError }, { data: notifications, error: notificationsError }] = await Promise.all([
    supabase.from("attendee_settings").select("appearance_preferences").eq("user_id", user.id).maybeSingle(),
    supabase.from("notifications").select("id, title, message, link, is_read, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
  ]);
  const portalSchemaMissing =
    isMissingTableFromSchemaCache(settingsError, "attendee_settings") ||
    isMissingTableFromSchemaCache(notificationsError, "notifications");
  if (portalSchemaMissing) {
    return (
      <WorkspaceShell links={links} title="My workspace" userWorkspace>
        <Panel>
          <StatusMessage>
            The attendee workspace database migration has not been applied yet.
          </StatusMessage>
          <h1 className="mt-5 text-2xl font-bold text-[#173d39]">Finish setting up your attendee workspace</h1>
          <p className="mt-2 text-sm leading-6 text-[#61736e]">
            Apply <code className="rounded bg-[#f4f6f1] px-1.5 py-0.5">supabase/migrations/20261016110000_create_attendee_portal.sql</code> after the other project migrations. Then refresh the Supabase API schema cache and reload this page.
          </p>
          <Link className="mt-5 inline-flex rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white" href="/events">Browse public events</Link>
        </Panel>
      </WorkspaceShell>
    );
  }

  function isMissingTableFromSchemaCache(error, tableName) {
    return (
      error?.code === "PGRST205" ||
      (typeof error?.message === "string" &&
        error.message.toLowerCase().includes(`public.${tableName}`) &&
        error.message.toLowerCase().includes("schema cache"))
    );
  }
  throwOnSupabaseError(settingsError);
  throwOnSupabaseError(notificationsError);
  const theme = settings?.appearance_preferences?.theme || "system";
  const locale = settings?.appearance_preferences?.language || "en";
  const flagMap = await getFeatureFlagMap();
  const visibleLinks = filterLinksByFlags(links, flagMap, linkFlags);

  return (
    <WorkspaceShell initialLocale={locale} initialTheme={theme} links={visibleLinks} notifications={notifications || []} title="My workspace" userWorkspace>
      {children}
    </WorkspaceShell>
  );
}