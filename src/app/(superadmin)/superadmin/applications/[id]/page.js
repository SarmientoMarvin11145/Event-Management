import SuperadminApplicationDetail from "@/components/superadmin/application-detail";

export default async function SuperadminApplicationPage({ params }) {
  const { id } = await params;
  return <SuperadminApplicationDetail id={id} />;
}
