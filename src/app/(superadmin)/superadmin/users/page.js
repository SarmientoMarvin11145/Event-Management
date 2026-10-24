import SuperadminConsole from "@/components/superadmin/superadmin-console";

export default function SuperadminUsersPage({ searchParams }) {
  return <SuperadminConsole searchParams={searchParams} section="users" />;
}