import { Suspense } from "react";
import { redirect } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";
import { requireAuthenticatedUser } from "@/lib/authorization";
import { isMissingOrganizationMembershipFunction } from "@/lib/admin-data";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { filterLinksByFlags, getFeatureFlagMap } from "@/lib/features";

export const instant = false;

const links = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/events/new", label: "Create event" },
  { href: "/admin/attendees", label: "Attendees" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/dashboard", label: "My workspace" },
];

const linkFlags = {
  "/admin/dashboard": "admin-overview",
  "/admin/events": "admin-events",
  "/admin/events/new": "admin-events",
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
  const user = await requireAuthenticatedUser(["admin", "user"]);
  const supabase = await createSupabaseServerClient();
  const [
    { data: settings, error: settingsError },
    { data: profile, error: profileError },
    { data: memberships, error: membershipsError },
    { data: notifications, error: notificationsError },
  ] = await Promise.all([
    supabase.from("attendee_settings").select("appearance_preferences").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_my_organization_memberships"),
    supabase.from("notifications").select("id, title, message, link, created_at, is_read").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
  ]);
  if (settingsError) throw new Error(`Unable to load admin appearance preferences: ${settingsError.message}`, { cause: settingsError });
  if (profileError) throw new Error(`Unable to load admin profile: ${profileError.message}`, { cause: profileError });
  if (isMissingOrganizationMembershipFunction(membershipsError)) {
    if (profile?.role !== "admin") redirect("/dashboard");
    return (
      <WorkspaceShell
        initialTheme={settings?.appearance_preferences?.theme || "system"}
        links={[{ href: "/dashboard", label: "My workspace" }]}
        profileName={profile?.full_name || user.email || "Administrator"}
        profileRole="admin"
        title="Organization admin"
      >
        <section className="max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <p className="text-xs font-bold uppercase tracking-wide">Admin setup required</p>
          <h1 className="mt-2 text-2xl font-bold">Apply the organization admin database migrations</h1>
          <p className="mt-3 text-sm leading-6">
            The live admin workspace needs the organization membership database function, which is not available in the connected Supabase project yet.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6">
            <li>Apply <code>supabase/migrations/20261024100000_add_venue_seating.sql</code> if it has not already been applied.</li>
            <li>Apply <code>supabase/migrations/20261024110000_organization_admin_workflows.sql</code>.</li>
            <li>Apply <code>supabase/migrations/20261024120000_admin_reporting_and_booking_guards.sql</code>.</li>
            <li>Refresh the Supabase API schema cache, then reload this page.</li>
          </ol>
          <p className="mt-4 text-xs leading-5">
            If these migrations are already applied, run <code>NOTIFY pgrst, &apos;reload schema&apos;;</code> in the Supabase SQL Editor to refresh PostgREST&apos;s function cache.
          </p>
        </section>
      </WorkspaceShell>
    );
  }
  if (membershipsError) throw new Error(`Unable to verify organization access: ${membershipsError.message}`, { cause: membershipsError });
  if (notificationsError) throw new Error(`Unable to load admin notifications: ${notificationsError.message}`, { cause: notificationsError });
  if (profile?.role !== "admin" && !memberships?.length) {
    redirect("/dashboard");
  }

  return (
    <WorkspaceShell
      initialTheme={settings?.appearance_preferences?.theme || "system"}
      links={filterLinksByFlags(links, await getFeatureFlagMap(), linkFlags)}
      notifications={notifications || []}
      profileName={profile?.full_name || user.email || "Administrator"}
      profileRole={memberships?.[0]?.role?.replaceAll("_", " ") || profile?.role || "admin"}
      title="Organization admin"
    >
      {children}
    </WorkspaceShell>
  );
}
