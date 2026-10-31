import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase-env";

export const FEATURE_DEFINITIONS = [
  { key: "event-discovery", label: "Event discovery", description: "Public event browsing and search.", scope: "shared", defaultEnabled: true },
  { key: "event-registration", label: "Event registration", description: "Users can register for published events.", scope: "shared", defaultEnabled: true },
  { key: "notifications", label: "Notifications and alerts", description: "In-app notifications and broadcasts.", scope: "shared", defaultEnabled: true },
  { key: "messaging", label: "Messages and inbox", description: "User messages page and inbox link.", scope: "shared", defaultEnabled: true },
  { key: "support", label: "Help and support", description: "Support requests and help pages.", scope: "shared", defaultEnabled: true },
  { key: "certificates", label: "Certificates", description: "Certificates, CPD totals, and verification.", scope: "shared", defaultEnabled: true },
  { key: "reviews", label: "Event reviews", description: "Ratings and feedback on history.", scope: "shared", defaultEnabled: true },
  { key: "admin-overview", label: "Admin overview", description: "Organization admin overview dashboard.", scope: "admin", defaultEnabled: true },
  { key: "admin-events", label: "Admin event management", description: "Create and manage organization events.", scope: "admin", defaultEnabled: true },
  { key: "admin-attendees", label: "Admin attendees", description: "View and manage event attendees.", scope: "admin", defaultEnabled: true },
  { key: "admin-registration-management", label: "Registration management", description: "Manage event registrations, ticket refunds, and event check-in.", scope: "admin", defaultEnabled: true },
  { key: "admin-staff", label: "Admin staff", description: "Manage organization staff access.", scope: "admin", defaultEnabled: true },
  { key: "admin-venues", label: "Admin venues", description: "Manage venues used by events.", scope: "admin", defaultEnabled: true },
  { key: "admin-reports", label: "Admin reports", description: "Attendance and event reports.", scope: "admin", defaultEnabled: true },
  { key: "admin-settings", label: "Admin settings", description: "Organization preferences.", scope: "admin", defaultEnabled: true },
  { key: "user-dashboard", label: "User dashboard", description: "Attendee home dashboard.", scope: "user", defaultEnabled: true },
  { key: "my-tickets", label: "My tickets", description: "Ticket lists and cancellation.", scope: "user", defaultEnabled: true },
  { key: "my-events", label: "My events", description: "Attending, invited, waitlisted, interested.", scope: "user", defaultEnabled: true },
  { key: "event-history", label: "Event history", description: "Past registrations and CSV export.", scope: "user", defaultEnabled: true },
  { key: "favorites", label: "Saved events", description: "Bookmarking and saved lists.", scope: "user", defaultEnabled: true },
  { key: "organizer-applications", label: "Organizer applications", description: "Apply-as-organizer flow.", scope: "user", defaultEnabled: true },
  { key: "user-profile", label: "User profile", description: "Editable attendee profile.", scope: "user", defaultEnabled: true },
  { key: "user-settings", label: "User settings", description: "Notification and account settings.", scope: "user", defaultEnabled: true },
  { key: "ai-chatbot", label: "AI attendee support", description: "Floating KURO Assistant chatbot on all pages.", scope: "shared", defaultEnabled: true },
  { key: "seating-plans", label: "Seating plans", description: "Venue seat plans and event seat reservations.", scope: "admin", defaultEnabled: true },
  { key: "booth-management", label: "Booth management", description: "Exhibitor and booth workflows.", scope: "admin", defaultEnabled: false },
  { key: "facial-check-in", label: "Facial check-in", description: "Requires privacy review.", scope: "admin", defaultEnabled: false },
  { key: "payment-gateway", label: "Paid checkout", description: "PayMongo test-mode checkout for event tickets.", scope: "shared", defaultEnabled: true },
  { key: "offline-mode", label: "Offline mode", description: "Offline event operations.", scope: "shared", defaultEnabled: false },
  { key: "advanced-analytics", label: "Advanced analytics", description: "Organization analytics.", scope: "admin", defaultEnabled: false },
];
export const FEATURE_KEY_SET = new Set(FEATURE_DEFINITIONS.map((flag) => flag.key));

export function getFeatureDefinition(key) {
  return FEATURE_DEFINITIONS.find((flag) => flag.key === key) || null;
}

async function createServerSupabase() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseKey } = getSupabaseEnv();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          return;
        }
      },
    },
  });
}

export async function getFeatureFlagMap() {
  await connection();
  const supabase = await createServerSupabase();
  const result = await supabase.from("feature_flags").select("flag_key, enabled");
  const map = {};
  for (const flag of FEATURE_DEFINITIONS) map[flag.key] = flag.defaultEnabled;
  if (!result.error) {
    for (const row of result.data || []) {
      if (FEATURE_KEY_SET.has(row.flag_key)) map[row.flag_key] = Boolean(row.enabled);
    }
  }
  return map;
}

export async function isFeatureEnabled(key) {
  if (!FEATURE_KEY_SET.has(key)) return false;
  const map = await getFeatureFlagMap();
  return Boolean(map[key]);
}

export async function requireFeatureEnabled(key) {
  const enabled = await isFeatureEnabled(key);
  if (!enabled) notFound();
  return true;
}

export function filterLinksByFlags(links, flagMap, linkFlagMap) {
  const mapping = linkFlagMap || {};
  return links.filter((link) => {
    const flagKey = mapping[link.href];
    if (!flagKey) return true;
    return Boolean(flagMap[flagKey]);
  });
}
