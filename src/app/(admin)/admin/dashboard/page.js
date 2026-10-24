import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";

export default async function AdminDashboardPage() {
  await requireFeatureEnabled("admin-overview");
  return <WorkspacePage description="Organization-wide activity and event performance." title="Organization overview" />;
}