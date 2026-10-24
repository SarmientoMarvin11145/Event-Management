import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";

export default async function AdminSettingsPage() {
  await requireFeatureEnabled("admin-settings");
  return <WorkspacePage description="Configure organization preferences." title="Organization settings" />;
}