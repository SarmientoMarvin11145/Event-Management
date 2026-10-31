import { notFound, redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/authorization";
import { effectivePlanTier, getProfileWithPlan } from "@/lib/account-plan";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function getOrganizationAdminContext(selectedOrganizationId = null) {
  const user = await requireAuthenticatedUser(["admin", "user"]);
  const supabase = await createSupabaseServerClient();
  const [
    { data: profile, error: profileError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    getProfileWithPlan(supabase, user.id, "full_name, avatar_url, role"),
    supabase.rpc("get_my_organization_memberships"),
  ]);

  if (profileError) throw new Error(`Unable to load administrator profile: ${profileError.message}`, { cause: profileError });
  const missingMembershipFunction = isMissingOrganizationMembershipFunction(membershipsError);
  if (membershipsError && !missingMembershipFunction) {
    throw new Error(`Unable to load organization memberships: ${membershipsError.message}`, { cause: membershipsError });
  }
  if (missingMembershipFunction && profile?.role !== "admin") redirect("/dashboard");

  const membershipList = memberships || [];
  const organizationIds = membershipList.map((item) => item.organization_id);
  const { data: organizations, error: organizationsError } = organizationIds.length
    ? await supabase
      .from("organizations")
      .select("id, name, logo_url, description, contact_email, contact_phone, website, address, timezone, default_language")
      .in("id", organizationIds)
      .order("name")
    : { data: [], error: null };
  if (organizationsError) throw new Error(`Unable to load accessible organizations: ${organizationsError.message}`, { cause: organizationsError });

  const accessibleOrganizations = organizations || [];
  const membershipsByOrganization = new Map(membershipList.map((item) => [item.organization_id, item]));
  const selectedOrganization = selectedOrganizationId
    ? accessibleOrganizations.find((item) => item.id === selectedOrganizationId) || null
    : accessibleOrganizations[0] || null;
  if (selectedOrganizationId && !selectedOrganization) notFound();
  const membership = selectedOrganization ? membershipsByOrganization.get(selectedOrganization.id) || null : null;
  const canManageOrganization = membership?.role === "organization_admin";

  if (profile?.role !== "admin" && !accessibleOrganizations.length) {
    redirect("/dashboard");
  }

  return {
    supabase,
    user,
    profile,
    planTier: effectivePlanTier(profile?.plan_tier, profile?.plan_expires_at),
    planExpiresAt: profile?.plan_expires_at,
    organizations: accessibleOrganizations,
    memberships: membershipList,
    organization: selectedOrganization,
    membership,
    canManageOrganization: Boolean(canManageOrganization),
  };
}

export function getOrganizationRole(context, organizationId) {
  return context.memberships?.find((membership) => membership.organization_id === organizationId)?.role || null;
}

export function isMissingOrganizationMembershipFunction(error) {
  return error?.code === "PGRST202"
    && error.message?.includes("get_my_organization_memberships");
}
