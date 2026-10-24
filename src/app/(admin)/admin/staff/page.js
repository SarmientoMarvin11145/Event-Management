import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";

export default async function AdminStaffPage() {
  await requireFeatureEnabled("admin-staff");
  return <WorkspacePage description="Manage organization staff access." title="Staff" />;
}