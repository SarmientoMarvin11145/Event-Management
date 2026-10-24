import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";

export default async function AdminAttendeesPage() {
  await requireFeatureEnabled("admin-attendees");
  return <WorkspacePage description="View and manage event attendees." title="Attendees" />;
}