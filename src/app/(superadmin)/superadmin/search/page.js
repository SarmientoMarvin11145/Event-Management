import SuperadminConsole from "@/components/superadmin/superadmin-console";

export default function SuperadminSearchPage({ searchParams }) {
  return <SuperadminConsole searchParams={searchParams} section="search" />;
}
