import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";

export default async function AdminReportsPage() {
  await requireFeatureEnabled("admin-reports");
  return <WorkspacePage description="Review attendance and event reports." title="Reports" />;
}