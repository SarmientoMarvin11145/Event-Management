import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { expirePayMongoCheckoutSession } from "@/lib/paymongo";
import { getSupabaseEnv } from "@/lib/supabase-env";

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A valid JSON request is required." }, { status: 400 });
  }
  const referenceNumber = typeof body?.referenceNumber === "string" ? body.referenceNumber.trim() : "";
  if (!referenceNumber || referenceNumber.length > 64) {
    return Response.json({ error: "A valid payment reference is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError?.name !== "AuthSessionMissingError" && authError) throw authError;
  if (!user) return Response.json({ error: "Sign in to manage this checkout." }, { status: 401 });

  const { data: order, error: orderError } = await supabase
    .from("payment_transactions")
    .select("reference_number, checkout_session_id, status")
    .eq("reference_number", referenceNumber)
    .eq("user_id", user.id)
    .eq("payment_type", "event_ticket")
    .maybeSingle();
  if (orderError) throw new Error(`Unable to load payment order: ${orderError.message}`, { cause: orderError });
  if (!order) return Response.json({ error: "Payment order not found." }, { status: 404 });
  if (order.status !== "pending" || !order.checkout_session_id) {
    return Response.json({ status: order.status });
  }
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return Response.json({ error: "Payment processing is not configured." }, { status: 503 });

  let expired;
  try {
    expired = await expirePayMongoCheckoutSession(order.checkout_session_id);
  } catch (error) {
    console.error("Unable to verify cancelled PayMongo checkout", {
      referenceNumber,
      error: error instanceof Error ? error.message : "Unknown provider error",
    });
    return Response.json({ error: "Could not safely verify checkout cancellation." }, { status: 502 });
  }
  if (!expired) return Response.json({ status: "pending" });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: cancelled, error: cancelError } = await serviceClient.rpc("set_paymongo_order_terminal_status", {
    p_reference_number: referenceNumber,
    p_checkout_session_id: order.checkout_session_id,
    p_status: "cancelled",
  });
  if (cancelError) {
    console.error("Unable to mark cancelled PayMongo checkout", cancelError);
    return Response.json({ error: "Could not release the cancelled ticket reservation." }, { status: 500 });
  }
  return Response.json({ status: cancelled ? "cancelled" : "pending" });
}
