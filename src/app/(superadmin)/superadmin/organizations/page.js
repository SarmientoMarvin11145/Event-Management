import SuperadminConsole from "@/components/superadmin/superadmin-console";

export default function OrganizationsPage({ searchParams }) {
  return <SuperadminConsole searchParams={searchParams} section="organizations" />;
}