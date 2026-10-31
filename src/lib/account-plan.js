export const ACCOUNT_PLANS = [
  { id: "free", label: "Free", activeEventLimit: 3 },
  { id: "pro", label: "Pro", activeEventLimit: 10 },
  { id: "business", label: "Business", activeEventLimit: null },
];

const planRanks = new Map(ACCOUNT_PLANS.map((plan, index) => [plan.id, index]));

export function effectivePlanTier(planTier, expiresAt) {
  const validTier = planRanks.has(planTier) ? planTier : "free";
  if (validTier === "free") return "free";
  return expiresAt && new Date(expiresAt).getTime() > Date.now() ? validTier : "free";
}

export function hasMinimumPlan(planTier, minimumTier) {
  return (planRanks.get(planTier) ?? 0) >= (planRanks.get(minimumTier) ?? Infinity);
}

export async function getProfileWithPlan(supabase, userId, profileFields) {
  const fieldsWithPlan = `${profileFields}, plan_tier, plan_expires_at`;
  const { data, error } = await supabase
    .from("profiles")
    .select(fieldsWithPlan)
    .eq("id", userId)
    .maybeSingle();

  if (!error) return { data, error: null, planSchemaMissing: false };

  const missingPlanColumn =
    (error.code === "42703" || error.code === "PGRST204") &&
    /(?:profiles\.)?plan_(?:tier|expires_at)/i.test(error.message || "");
  if (!missingPlanColumn) return { data: null, error, planSchemaMissing: false };

  const fallback = await supabase
    .from("profiles")
    .select(profileFields)
    .eq("id", userId)
    .maybeSingle();
  return { ...fallback, planSchemaMissing: !fallback.error };
}

export async function getAccountPlan(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("plan_tier, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load account plan: ${error.message}`, { cause: error });
  if (!data) throw new Error("Unable to load account plan because the user profile could not be found.");
  return {
    tier: effectivePlanTier(data.plan_tier, data.plan_expires_at),
    expiresAt: data.plan_expires_at,
  };
}
