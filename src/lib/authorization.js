import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function requireAuthenticatedUser(allowedRoles) {
  await connection();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError?.name === "AuthSessionMissingError" || !user) {
    redirect("/login");
  }
  if (authError) {
    throw authError;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (["42703", "PGRST204"].includes(profileError?.code)) {
    const { data: legacyProfile, error: legacyProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (["42703", "PGRST204"].includes(legacyProfileError?.code)) redirect("/dashboard");
    if (legacyProfileError) throw legacyProfileError;
    if (!legacyProfile || !allowedRoles.includes(legacyProfile.role)) redirect("/dashboard");
    return user;
  }
  if (profileError) {
    throw profileError;
  }
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/dashboard");
  }
  if (profile.account_status === "suspended" || profile.account_status === "banned") {
    redirect("/login?error=account-disabled");
  }

  return user;
}