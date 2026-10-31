export function effectivePlanTier() {
  return "free";
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
