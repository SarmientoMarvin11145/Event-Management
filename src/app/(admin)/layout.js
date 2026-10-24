import { Suspense } from "react";
import WorkspaceShell from "@/components/workspace-shell";
import { requireAuthenticatedUser } from "@/lib/authorization";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { filterLinksByFlags, getFeatureFlagMap } from "@/lib/features";

export const instant = false;

const links = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/attendees", label: "Attendees" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
];

const linkFlags = {
  "/admin/dashboard": "admin-overview",
  "/admin/events": "admin-events",
  "/admin/attendees": "admin-attendees",
  "/admin/staff": "admin-staff",
  "/admin/venues": "admin-venues",
  "/admin/reports": "admin-reports",
  "/admin/settings": "admin-settings",
};

export default function AdminLayout({ children }) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50" />}>
      <AuthenticatedAdminLayout>{children}</AuthenticatedAdminLayout>
    </Suspense>
  );
}

async function AuthenticatedAdminLayout({ children }) {
  const user = await requireAuthenticatedUser(["admin"]);
  const supabase = await createSupabaseServerClient();
  const { data: settings, error } = await supabase
    .from("attendee_settings")
    .select("appearance_preferences")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    throw new Error(`Unable to load admin appearance preferences: ${error.message}`, {
      cause: error,
    });
  }

  return (
    <WorkspaceShell initialTheme={settings?.appearance_preferences?.theme || "system"} links={filterLinksByFlags(links, await getFeatureFlagMap(), linkFlags)} title="Organization admin">
      {children}
    </WorkspaceShell>
  );
}