import { randomBytes } from "node:crypto";
import { sendSendGridEmail } from "@/lib/sendgrid";
import {
  createGuestRegistrationServiceClient,
  getPublicAppOrigin,
  hashGuestToken,
} from "@/lib/guest-registration-server";

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A valid verification request is required." }, { status: 400 });
  }
  if (typeof body?.token !== "string" || !/^[0-9a-f]{64}$/.test(body.token)) {
    return Response.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  }

  try {
    const ticketToken = randomBytes(32).toString("hex");
    const serviceClient = createGuestRegistrationServiceClient();
    const { data, error } = await serviceClient.rpc("verify_guest_event_registration", {
      p_verification_token_hash: hashGuestToken(body.token),
      p_ticket_token_hash: hashGuestToken(ticketToken),
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    const registration = data?.[0];
    if (!registration) return Response.json({ error: "This verification link is invalid or expired." }, { status: 400 });

    const ticketUrl = new URL("/guest-ticket", getPublicAppOrigin(request));
    ticketUrl.searchParams.set("token", ticketToken);
    try {
      await sendSendGridEmail({
        to: registration.email,
        subject: `Your registration for ${registration.event_title} is ${registration.registration_status === "confirmed" ? "confirmed" : "pending"}`,
        text: [
          `Hi ${registration.attendee_name},`,
          "",
          `Your email is verified. Your registration for ${registration.event_title} is ${registration.registration_status}.`,
          `Registration ID: ${registration.registration_code}`,
          `Event date: ${new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(registration.start_date))}`,
          "",
          `Open your ticket and registration details: ${ticketUrl.toString()}`,
          "",
          "We will email your event reminders two days and one day before the event, if enabled by the organizer.",
        ].join("\n"),
      });
    } catch (emailError) {
      console.error("Unable to send guest registration confirmation email", emailError);
      return Response.json({
        verified: true,
        ticketUrl: ticketUrl.pathname + ticketUrl.search,
        emailSent: false,
        registrationCode: registration.registration_code,
      });
    }

    return Response.json({ verified: true, ticketUrl: ticketUrl.pathname + ticketUrl.search, emailSent: true });
  } catch (error) {
    console.error("Unable to verify guest event registration", error);
    return Response.json({ error: "Could not verify this registration." }, { status: 500 });
  }
}
