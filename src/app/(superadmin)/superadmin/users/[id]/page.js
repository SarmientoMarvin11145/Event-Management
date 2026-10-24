import SuperadminUserDetail from "@/components/superadmin/user-detail";

export default async function SuperadminUserPage({ params }) {
  const { id } = await params;
  return <SuperadminUserDetail id={id} />;
}
