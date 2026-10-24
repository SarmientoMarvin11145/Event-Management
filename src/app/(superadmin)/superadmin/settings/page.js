import SuperadminConsole from "@/components/superadmin/superadmin-console";

export default function SuperadminSettingsPage({ searchParams }) {
  return <SuperadminConsole searchParams={searchParams} section="settings" />;
}