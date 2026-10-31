import { createHash, randomBytes } from "node:crypto";
import { sendSendGridEmail } from "@/lib/sendgrid";
import {
  createGuestRegistrationServiceClient,
  getPublicAppOrigin,
  hashGuestToken,
} from "@/lib/guest-registration-server";
import { validateRegistrationForm } from "@/lib/registration-form";

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A valid registration request is required." }, { status: 400 });
  }

  const attendeeName = typeof body?.attendeeName === "string" ? body.attendeeName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  if (
    attendeeName.length < 2 ||
    attendeeName.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)
  ) {
    return Response.json({ error: "Enter a valid name and email address." }, { status: 400 });
  }

  let answers = body.answers ?? {};
  try {
    if (JSON.stringify(answers).length > 20000) {
      return Response.json({ error: "Registration answers are too large." }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Registration answers are invalid." }, { status: 400 });
  }

  let serviceClient;
  try {
    serviceClient = createGuestRegistrationServiceClient();
  } catch (error) {
    console.error("Guest registration service is not configured", error);
    return Response.json({ error: "Guest registration is temporarily unavailable." }, { status: 500 });
  }
  const { data: event, error: eventError } = await serviceClient
    .from("events")
    .select("registration_form")
    .eq("id", eventId)
    .eq("status", "published")
    .maybeSingle();
  if (eventError) {
    console.error("Unable to load guest event registration form", eventError);
    return Response.json({ error: "Could not load event registration details." }, { status: 500 });
  }
  if (!event) return Response.json({ error: "This event is not available for registration." }, { status: 400 });
  try {
    validateRegistrationForm(event.registration_form || [], answers);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Registration answers are invalid.",
    }, { status: 400 });
  }

  const verificationToken = randomBytes(32).toString("hex");
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const emailHash = createHash("sha256").update(email).digest("hex");
  const ipHash = createHash("sha256").update(forwardedIp).digest("hex");
  const { data: registration, error } = await serviceClient.rpc("create_guest_event_registration", {
    p_event_id: eventId,
    p_attendee_name: attendeeName,
    p_email: email,
    p_seat_id: typeof body.seatId === "string" ? body.seatId : null,
    p_answers: answers,
    p_verification_token_hash: hashGuestToken(verificationToken),
    p_email_hash: emailHash,
    p_ip_hash: ipHash,
  });
  if (error) {
    if (error.message.includes("Too many attempts")) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    if (error.code === "P0001") {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Unable to create guest event registration", error);
    return Response.json({ error: "Could not start guest registration." }, { status: 500 });
  }
  const result = registration?.[0];
  if (!result) {
    console.error("Guest registration RPC returned no registration");
    return Response.json({ error: "Could not start guest registration." }, { status: 500 });
  }

  const verificationUrl = new URL("/guest-registration/verify", getPublicAppOrigin(request));
  verificationUrl.searchParams.set("token", verificationToken);
  try {
    await sendSendGridEmail({
      to: email,
      subject: `Verify your registration for ${result.event_title}`,
      text: `Hi ${attendeeName},\n\nPlease verify your email to complete your registration for ${result.event_title}:\n${verificationUrl.toString()}\n\nThis link expires in 30 minutes. If you did not request this registration, you can ignore this email.`,
    });
  } catch (emailError) {
    console.error("Unable to send guest registration verification email", emailError);
    return Response.json({ error: "Your registration was saved, but we could not send the verification email. Please try again shortly." }, { status: 502 });
  }

  return Response.json({ sent: true });
}
