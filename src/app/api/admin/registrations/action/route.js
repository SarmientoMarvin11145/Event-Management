import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  expirePayMongoCheckoutSession,
  verifyPayMongoCheckoutPayment,
  verifyPayMongoPayment,
} from "@/lib/paymongo";
import { getSupabaseEnv } from "@/lib/supabase-env";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Payment processing is not configured on the server.");
  const { supabaseUrl } = getSupabaseEnv();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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
  const registrationId = typeof body?.registrationId === "string" ? body.registrationId : "";
  const action = body?.action;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!UUID_PATTERN.test(registrationId) || !["confirm", "cancel"].includes(action)) {
    return Response.json({ error: "A valid registration and action are required." }, { status: 400 });
  }
  if (action === "cancel" && (!reason || reason.length > 500)) {
    return Response.json({ error: "A cancellation reason of 1 to 500 characters is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError?.name !== "AuthSessionMissingError" && authError) throw authError;
  if (!user) return Response.json({ error: "Sign in with an authorized admin account." }, { status: 401 });

  const { data: details, error: detailError } = await supabase.rpc(
    "admin_get_registration_management_detail",
    { p_registration_id: registrationId },
  );
  if (detailError) {
    return Response.json({ error: "Registration not found or access was denied." }, { status: 404 });
  }
  const registration = details?.registration;
  let payment = details?.payment;
  if (!registration) return Response.json({ error: "Registration not found." }, { status: 404 });

  if (action === "confirm" && Number(registration.unit_price) > 0) {
    if (payment?.status === "pending") {
      if (!payment.checkout_session_id || !payment.reference_number) {
        return Response.json({ error: "The PayMongo checkout is not ready to verify yet." }, { status: 409 });
      }
      let verifiedCheckoutPayment;
      try {
        verifiedCheckoutPayment = await verifyPayMongoCheckoutPayment({
          checkoutSessionId: payment.checkout_session_id,
          referenceNumber: payment.reference_number,
          amount: Number(payment.amount),
          currency: payment.currency,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "PayMongo could not verify the checkout.";
        return Response.json({ error: message }, { status: message.includes("has not confirmed") ? 409 : 502 });
      }

      let serviceClient;
      try {
        serviceClient = createServiceClient();
      } catch (error) {
        return Response.json({
          error: error instanceof Error ? error.message : "Payment processing is not configured.",
        }, { status: 503 });
      }
      const { data: applied, error: applyError } = await serviceClient.rpc("complete_paymongo_payment", {
        p_reference_number: payment.reference_number,
        p_checkout_session_id: payment.checkout_session_id,
        p_payment_id: verifiedCheckoutPayment.id,
        p_amount: Number(payment.amount),
        p_currency: payment.currency,
        p_payment_method: verifiedCheckoutPayment.paymentMethod,
      });
      if (applyError) {
        console.error("Unable to reconcile verified PayMongo registration payment", applyError);
        return Response.json({ error: "PayMongo verified the payment, but Supabase could not update it. Retry or contact support." }, { status: 500 });
      }
      if (!applied) {
        return Response.json({ error: "The registration payment changed during verification. Refresh the page and retry." }, { status: 409 });
      }

      const { data: refreshedDetails, error: refreshError } = await supabase.rpc(
        "admin_get_registration_management_detail",
        { p_registration_id: registrationId },
      );
      if (refreshError) {
        return Response.json({ error: "Payment was verified, but registration details could not be refreshed. Reload the page." }, { status: 500 });
      }
      payment = refreshedDetails?.payment;
    }

    if (payment?.status !== "paid" || !payment.payment_id) {
      return Response.json({ error: `Registration cannot be confirmed: payment status is ${payment?.status || "unverified"}.` }, { status: 409 });
    }
    try {
      await verifyPayMongoPayment({
        paymentId: payment.payment_id,
        amount: Number(payment.amount),
        currency: payment.currency,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "PayMongo could not verify the payment.";
      const status = message.includes("details do not match") ? 409 : 502;
      return Response.json({ error: message }, { status });
    }
  }

  if (action === "cancel" && payment?.status === "pending") {
    if (!payment.checkout_session_id) {
      return Response.json({ error: "The PayMongo checkout is still being prepared. Refresh and retry." }, { status: 409 });
    }
    try {
      const expired = await expirePayMongoCheckoutSession(payment.checkout_session_id);
      if (!expired) {
        return Response.json({ error: "The PayMongo checkout is still active. The registration was not cancelled." }, { status: 409 });
      }
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : "Could not verify the checkout status.",
      }, { status: 502 });
    }
    const { error } = await supabase.rpc("admin_cancel_pending_registration", {
      p_registration_id: registrationId,
      p_checkout_session_id: payment.checkout_session_id,
      p_cancellation_reason: reason,
    });
    if (error) return Response.json({ error: error.message }, { status: 409 });
  } else {
    const { error } = await supabase.rpc("admin_update_registration", {
      p_registration_id: registrationId,
      p_status: action === "confirm" ? "confirmed" : "cancelled",
      p_cancellation_reason: action === "cancel" ? reason : null,
    });
    if (error) return Response.json({ error: error.message }, { status: 409 });
  }

  revalidatePath("/admin/registrations");
  revalidatePath(`/admin/registrations/${registrationId}`);
  revalidatePath("/admin/attendees");
  revalidatePath("/my-tickets");
  revalidatePath("/notifications");
  return Response.json({ success: true });
}
