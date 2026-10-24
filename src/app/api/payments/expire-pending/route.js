import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { expirePayMongoCheckoutSession } from "@/lib/paymongo";
import { getSupabaseEnv } from "@/lib/supabase-env";

function hasValidCronToken(request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function POST(request) {
  if (!hasValidCronToken(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.PAYMONGO_SECRET_KEY?.startsWith("sk_test_")) {
    return Response.json({ error: "Configure a PayMongo test secret key first." }, { status: 503 });
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return Response.json({ error: "Payment processing is not configured on the server." }, { status: 503 });
  }

  const { supabaseUrl } = getSupabaseEnv();
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: orders, error } = await serviceClient
    .from("payment_transactions")
    .select("id, checkout_session_id, registration_id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    console.error("Unable to load stale PayMongo checkouts", error);
    return Response.json({ error: "Could not load pending checkout sessions." }, { status: 500 });
  }

  let expiredCount = 0;
  let waitingCount = 0;
  for (const order of orders || []) {
    if (order.checkout_session_id) {
      let expired;
      try {
        expired = await expirePayMongoCheckoutSession(order.checkout_session_id);
      } catch (expireError) {
        console.error("Unable to expire a PayMongo checkout session", {
          orderId: order.id,
          error: expireError instanceof Error ? expireError.message : "Unknown provider error",
        });
        return Response.json({ error: "A PayMongo checkout session could not be safely expired." }, { status: 502 });
      }
      if (!expired) {
        waitingCount += 1;
        continue;
      }
    }

    const { data: updatedOrder, error: updateError } = await serviceClient
      .from("payment_transactions")
      .update({ status: "failed" })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.error("Unable to mark expired PayMongo order", updateError);
      return Response.json({ error: "Could not release an expired checkout order." }, { status: 500 });
    }
    if (!updatedOrder) continue;

    if (order.registration_id) {
      const { error: registrationError } = await serviceClient
        .from("registrations")
        .update({ status: "cancelled" })
        .eq("id", order.registration_id)
        .eq("status", "pending");
      if (registrationError) {
        console.error("Unable to release expired ticket reservation", registrationError);
        return Response.json({ error: "The expired order was closed but its ticket reservation could not be released." }, { status: 500 });
      }
    }
    expiredCount += 1;
  }

  return Response.json({ expired: expiredCount, stillActive: waitingCount });
}
