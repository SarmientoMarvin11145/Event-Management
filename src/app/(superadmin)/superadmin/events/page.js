import SuperadminConsole from "@/components/superadmin/superadmin-console";

export default function SuperadminEventsPage({ searchParams }) {
  return <SuperadminConsole searchParams={searchParams} section="events" />;
}