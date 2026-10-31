import { getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import AccountPlan from "@/components/user/account-plan";

export const instant = false;
export const metadata = { title: "Account plan | KURO" };

export default async function AccountPlanPage({ searchParams }) {
  const params = await searchParams;
  const { supabase } = await getAttendeeSession();
  const { data, error } = await supabase.rpc("get_my_plan_entitlements");
  throwOnSupabaseError(error);
  const plan = data?.[0];
  if (!plan) throw new Error("Unable to load account plan details.");

  return (
    <AccountPlan
      activeEventCount={Number(plan.active_event_count || 0)}
      activeEventLimit={plan.active_event_limit}
      expiresAt={plan.plan_expires_at}
      paymentState={Array.isArray(params?.payment) ? params.payment[0] : params?.payment}
      tier={plan.plan_tier}
    />
  );
}
