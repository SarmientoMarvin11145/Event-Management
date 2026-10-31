import { sendSendGridEmail } from "@/lib/sendgrid";
import { createGuestRegistrationServiceClient } from "@/lib/guest-registration-server";

const HOUR = 60 * 60 * 1000;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "Reminder scheduler is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const windows = [
    { type: "one_day_before", min: new Date(now.getTime() + 23 * HOUR), max: new Date(now.getTime() + 25 * HOUR) },
    { type: "two_days_before", min: new Date(now.getTime() + 47 * HOUR), max: new Date(now.getTime() + 49 * HOUR) },
  ];
  const serviceClient = createGuestRegistrationServiceClient();
  const { data: events, error: eventsError } = await serviceClient
    .from("events")
    .select("id, title, start_date, venue_name, city, reminder_settings")
    .eq("status", "published")
    .gte("start_date", windows[0].min.toISOString())
    .lt("start_date", windows[1].max.toISOString());
  if (eventsError) {
    console.error("Unable to load events for reminders", eventsError);
    return Response.json({ error: "Could not load events for reminders." }, { status: 500 });
  }

  const summary = { eventsChecked: events?.length || 0, sent: 0, skipped: 0, failed: 0 };
  const failures = [];
  for (const event of events || []) {
    const startTime = new Date(event.start_date).getTime();
    const dueReminders = windows.filter((window) => {
      return event.reminder_settings?.[window.type] !== false
        && startTime >= window.min.getTime()
        && startTime < window.max.getTime();
    });
    for (const reminder of dueReminders) {
      const recipients = await loadRecipients(serviceClient, event.id);
      if (recipients.error) {
        console.error(`Unable to load reminder recipients for event ${event.id}`, recipients.error);
        summary.failed += 1;
        failures.push({ eventId: event.id, reminderType: reminder.type, error: "Unable to load recipients." });
        continue;
      }

      for (const recipient of recipients.data) {
        const { data: claimed, error: claimError } = await serviceClient.rpc("claim_event_email_delivery", {
          p_event_id: event.id,
          p_recipient_email: recipient.email,
          p_reminder_type: reminder.type,
        });
        if (claimError) {
          console.error(`Unable to claim event reminder for ${event.id}`, claimError);
          summary.failed += 1;
          failures.push({ eventId: event.id, reminderType: reminder.type, error: "Unable to claim reminder delivery." });
          continue;
        }
        if (!claimed) {
          summary.skipped += 1;
          continue;
        }

        try {
          await sendSendGridEmail({
            to: recipient.email,
            subject: `${reminder.type === "one_day_before" ? "Tomorrow" : "In two days"}: ${event.title}`,
            text: [
              `Hi ${recipient.name},`,
              "",
              `This is a reminder that ${event.title} is coming up ${reminder.type === "one_day_before" ? "tomorrow" : "in two days"}.`,
              `Event date: ${new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(event.start_date))}`,
              `Location: ${[event.venue_name, event.city].filter(Boolean).join(", ") || "To be announced"}`,
              recipient.registrationCode ? `Registration ID: ${recipient.registrationCode}` : "",
              "",
              "We look forward to seeing you.",
            ].filter(Boolean).join("\n"),
          });
          const { error: updateError } = await serviceClient
            .from("event_email_deliveries")
            .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
            .eq("event_id", event.id)
            .eq("recipient_email", recipient.email)
            .eq("reminder_type", reminder.type);
          if (updateError) throw new Error(`Email sent but delivery state could not be saved: ${updateError.message}`);
          summary.sent += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed.";
          const { error: updateError } = await serviceClient
            .from("event_email_deliveries")
            .update({ status: "failed", last_error: message })
            .eq("event_id", event.id)
            .eq("recipient_email", recipient.email)
            .eq("reminder_type", reminder.type);
          if (updateError) console.error("Unable to update failed reminder delivery state", updateError);
          console.error(`Unable to send ${reminder.type} reminder for event ${event.id}`, error);
          summary.failed += 1;
          failures.push({ eventId: event.id, reminderType: reminder.type, error: "Email delivery failed." });
        }
      }
    }
  }

  return Response.json({ ...summary, failures }, { status: summary.failed ? 500 : 200 });
}

async function loadRecipients(serviceClient, eventId) {
  const [guestResult, registrationResult] = await Promise.all([
    serviceClient
      .from("guest_event_registrations")
      .select("email, attendee_name, registration_code")
      .eq("event_id", eventId)
      .eq("status", "confirmed")
      .not("verified_at", "is", null),
    serviceClient.rpc("get_event_account_reminder_recipients", { p_event_id: eventId }),
  ]);
  if (guestResult.error) return { error: guestResult.error };
  if (registrationResult.error) return { error: registrationResult.error };

  if (registrationResult.error) return { error: registrationResult.error };
  const recipients = new Map();
  for (const row of guestResult.data || []) {
    recipients.set(row.email.toLowerCase(), {
      email: row.email.toLowerCase(),
      name: row.attendee_name,
      registrationCode: row.registration_code,
    });
  }
  for (const registration of registrationResult.data || []) {
    if (!registration.email) continue;
    const email = registration.email.toLowerCase();
    if (!recipients.has(email)) {
      recipients.set(email, {
        email,
        name: registration.attendee_name || "attendee",
        registrationCode: registration.registration_code,
      });
    }
  }
  return { data: [...recipients.values()] };
}
