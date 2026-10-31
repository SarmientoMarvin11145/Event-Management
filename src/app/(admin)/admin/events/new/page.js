import { notFound } from "next/navigation";
import EventForm from "@/components/admin/event-form";
import OrganizationPicker from "@/components/admin/organization-picker";
import WorkspacePage from "@/components/workspace-page";
import { requireFeatureEnabled } from "@/lib/features";
import { getOrganizationAdminContext } from "@/lib/admin-data";

export default async function NewAdminEventPage({ searchParams }) {
  await requireFeatureEnabled("admin-events");
  const params = await searchParams;
  const context = await getOrganizationAdminContext(params?.organization_id || null);
  if (!context.organization) {
    return <WorkspacePage description="Create a real organization event." title="Create event" />;
  }
  if (!context.canManageOrganization) notFound();
  const { data: venues, error } = await context.supabase
    .from("venues")
    .select("id, name")
    .eq("organization_id", context.organization.id)
    .order("name");
  if (error) throw new Error(`Unable to load organization venues: ${error.message}`, { cause: error });

  return (
    <WorkspacePage description="Set up an event using your organization's real event and venue data." title="Create event">
      <div className="mb-5">
        <OrganizationPicker organizations={context.organizations} pathname="/admin/events/new" selectedOrganizationId={context.organization.id} />
      </div>
      <EventForm organization={context.organization} planTier={context.planTier} venues={venues || []} />
    </WorkspacePage>
  );
}
