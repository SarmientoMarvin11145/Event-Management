import { createHmac, timingSafeEqual } from "node:crypto";

const PAYMONGO_API_URL = "https://api.paymongo.com/v2/checkout_sessions";
const SUPPORTED_PAYMENT_METHODS = new Set(["card", "gcash", "paymaya", "qrph"]);

function getPaymentMethodTypes() {
  const configured = process.env.PAYMONGO_PAYMENT_METHOD_TYPES;
  if (!configured) return ["card", "gcash", "qrph"];
  const methods = [...new Set(configured.split(",").map((method) => method.trim()).filter(Boolean))];
  if (!methods.length || methods.some((method) => !SUPPORTED_PAYMENT_METHODS.has(method))) {
    throw new Error("PAYMONGO_PAYMENT_METHOD_TYPES must contain supported values: card, gcash, paymaya, qrph.");
  }
  return methods;
}

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
          payment_method_types: getPaymentMethodTypes(),
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

export async function verifyPayMongoPayment({ paymentId, amount, currency }) {
  const secretKey = getPayMongoTestSecret();
  const response = await fetch(`https://api.paymongo.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}` },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) {
    console.error("Unable to retrieve PayMongo payment", {
      status: response.status,
      errors: payload?.errors,
    });
    throw new Error("PayMongo could not verify the payment.");
  }
  const payment = payload?.data;
  const attributes = payment?.attributes;
  if (
    payment?.id !== paymentId
    || attributes?.status !== "paid"
    || attributes?.amount !== amount
    || attributes?.currency !== currency
    || attributes?.livemode !== false
  ) {
    throw new Error("PayMongo payment details do not match the registration.");
  }
  return { id: payment.id, status: attributes.status };
}

export async function verifyPayMongoCheckoutPayment({
  checkoutSessionId,
  referenceNumber,
  amount,
  currency,
}) {
  const secretKey = getPayMongoTestSecret();
  const response = await fetch(
    `https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(checkoutSessionId)}`,
    {
      headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}` },
      cache: "no-store",
    },
  );
  const payload = await response.json();
  if (!response.ok) {
    console.error("Unable to retrieve PayMongo checkout session", {
      status: response.status,
      errors: payload?.errors,
    });
    throw new Error("PayMongo could not verify the checkout session.");
  }

  const session = payload?.data;
  const attributes = session?.attributes;
  const payment = Array.isArray(attributes?.payments)
    ? attributes.payments.find((item) => item?.attributes?.status === "paid")
    : null;
  const paymentAttributes = payment?.attributes;
  if (
    session?.id !== checkoutSessionId
    || attributes?.reference_number !== referenceNumber
    || attributes?.livemode !== false
    || typeof payment?.id !== "string"
    || paymentAttributes?.status !== "paid"
    || paymentAttributes?.amount !== amount
    || paymentAttributes?.currency !== currency
  ) {
    throw new Error("PayMongo has not confirmed a successful payment matching this registration.");
  }

  return {
    id: payment.id,
    status: paymentAttributes.status,
    paymentMethod: paymentAttributes?.source?.type
      || paymentAttributes?.payment_method_used
      || paymentAttributes?.payment_method_details?.type
      || null,
  };
}

function getPayMongoRefundAttributes(payload, expected) {
  const refund = payload?.data;
  const attributes = refund?.attributes;
  if (
    typeof refund?.id !== "string"
    || attributes?.payment_id !== expected.paymentId
    || attributes?.amount !== expected.amount
    || attributes?.currency !== expected.currency
    || attributes?.livemode !== false
    || !["pending", "succeeded", "failed"].includes(attributes?.status)
  ) {
    throw new Error("PayMongo returned refund details that do not match the ticket payment.");
  }
  return { id: refund.id, status: attributes.status };
}

export async function createPayMongoRefund({ paymentId, amount, currency, notes }) {
  const secretKey = getPayMongoTestSecret();
  const response = await fetch("https://api.paymongo.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount,
          payment_id: paymentId,
          reason: "requested_by_customer",
          notes,
        },
      },
    }),
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) {
    console.error("PayMongo refund request failed", {
      status: response.status,
      errors: payload?.errors,
    });
    const error = new Error(response.status >= 500
      ? "PayMongo could not confirm whether the refund was accepted."
      : "PayMongo rejected the refund request.");
    error.refundRequestRejected = response.status >= 400 && response.status < 500;
    throw error;
  }
  return getPayMongoRefundAttributes(payload, { paymentId, amount, currency });
}

export async function getPayMongoRefund(refundId, expected) {
  const secretKey = getPayMongoTestSecret();
  const response = await fetch(`https://api.paymongo.com/v1/refunds/${encodeURIComponent(refundId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}` },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) {
    console.error("Unable to retrieve PayMongo refund", {
      status: response.status,
      errors: payload?.errors,
    });
    throw new Error("PayMongo could not retrieve the refund status.");
  }
  return getPayMongoRefundAttributes(payload, expected);
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
