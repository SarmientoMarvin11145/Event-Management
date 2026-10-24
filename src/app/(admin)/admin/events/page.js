import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";

export default async function AdminEventsPage() {
  await requireFeatureEnabled("admin-events");
  return <WorkspacePage description="Create and manage organization events." title="Manage events" />;
}