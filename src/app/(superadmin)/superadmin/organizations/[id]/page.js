import SuperadminOrganizationDetail from "@/components/superadmin/organization-detail";

export default async function SuperadminOrganizationPage({ params }) {
  const { id } = await params;
  return <SuperadminOrganizationDetail id={id} />;
}
