import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";

export default async function AdminVenuesPage() {
  await requireFeatureEnabled("admin-venues");
  return <WorkspacePage description="Manage venues used by your events." title="Venues" />;
}