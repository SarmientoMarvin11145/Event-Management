import { createHmac, timingSafeEqual } from "node:crypto";

const PAYMONGO_API_URL = "https://api.paymongo.com/v2/checkout_sessions";

export function getPayMongoTestSecret() {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    throw new Error("PAYMONGO_SECRET_KEY is not configured.");
  }
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("PayMongo checkout is restricted to test keys until live payments are explicitly enabled.");
  }
  return secretKey;
}

export async function createPayMongoCheckout({ order, origin }) {
  const secretKey = getPayMongoTestSecret();
  const response = await fetch(PAYMONGO_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [
            {
              name: order.item_name,
              amount: Number(order.amount),
              currency: order.currency,
              quantity: 1,
            },
          ],
          payment_method_types: ["card", "gcash", "qrph"],
          success_url: new URL(order.success_path, origin).toString(),
          cancel_url: new URL(order.cancel_path, origin).toString(),
          reference_number: order.reference_number,
          send_email_receipt: true,
          metadata: {
            order_id: order.order_id,
            payment_type: order.payment_type,
          },
        },
      },
    }),
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok) {
    console.error("PayMongo checkout creation failed", {
      status: response.status,
      errors: payload?.errors,
    });
    throw new Error("PayMongo could not create the checkout session.");
  }

  const session = payload?.data;
  const checkoutUrl = session?.attributes?.checkout_url;
  if (
    typeof session?.id !== "string" ||
    typeof checkoutUrl !== "string" ||
    !isPayMongoCheckoutUrl(checkoutUrl)
  ) {
    throw new Error("PayMongo returned an invalid checkout session.");
  }

  return { checkoutSessionId: session.id, checkoutUrl };
}

export async function expirePayMongoCheckoutSession(checkoutSessionId) {
  const secretKey = getPayMongoTestSecret();
  const authorization = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
  const sessionUrl = `https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(checkoutSessionId)}`;
  const response = await fetch(`${sessionUrl}/expire`, {
    method: "POST",
    headers: { Authorization: authorization },
    cache: "no-store",
  });
  if (response.ok) return true;

  const stateResponse = await fetch(sessionUrl, {
    headers: { Authorization: authorization },
    cache: "no-store",
  });
  if (!stateResponse.ok) {
    console.error("Unable to check PayMongo checkout session after expiration failed", {
      status: response.status,
      stateStatus: stateResponse.status,
    });
    throw new Error("Could not confirm the PayMongo checkout session state.");
  }
  const state = await stateResponse.json();
  return state?.data?.attributes?.status === "expired";
}

export function isPayMongoCheckoutUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.paymongo.com";
  } catch {
    return false;
  }
}

export function verifyPayMongoWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const fields = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const separator = part.indexOf("=");
      return separator < 0
        ? [part.trim(), ""]
        : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }),
  );
  const timestamp = fields.t;
  const suppliedSignature = fields.te;
  if (!timestamp || !suppliedSignature || !/^\d+$/.test(timestamp)) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    return false;
  }

  const expectedSignature = createHmacSignature(`${timestamp}.${rawBody}`, secret);
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const suppliedBuffer = Buffer.from(suppliedSignature, "hex");
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function createHmacSignature(message, secret) {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}
