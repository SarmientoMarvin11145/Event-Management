import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase-env";

export function createGuestRegistrationServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(getSupabaseEnv().supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hashGuestToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function getPublicAppOrigin(request) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredOrigin) return new URL(configuredOrigin).origin;
  return new URL(request.url).origin;
}
