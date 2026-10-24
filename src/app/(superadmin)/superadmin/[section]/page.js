import SuperadminConsole from "@/components/superadmin/superadmin-console";
import { notFound } from "next/navigation";

const sections = new Set([
  "applications",
  "organizations",
  "users",
  "events",
  "revenue",
  "analytics",
  "notifications",
  "emails",
  "content",
  "features",
  "system",
  "logs",
  "security",
  "integrations",
  "settings",
  "profile",
  "support",
  "tasks",
  "search",
]);

export default async function SuperadminSectionPage({ params, searchParams }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <SuperadminConsole searchParams={searchParams} section={section} />;
}
