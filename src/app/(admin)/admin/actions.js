"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/authorization";
import { isFeatureEnabled } from "@/lib/features";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getOrganizationAdminContext } from "@/lib/admin-data";

async function getVenueAdminContext() {
  if (!(await isFeatureEnabled("seating-plans"))) {
    throw new Error("Venue seating plans are currently disabled by the platform team.");
  }
  await requireAuthenticatedUser(["admin", "user"]);
  return createSupabaseServerClient();
}

function requiredText(formData, key, label, maxLength) {
  const value = String(formData.get(key) || "").trim();
  if (!value) throw new Error(`${label} is required.`);
  if (value.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  return value;
}

export async function saveVenueSeatPlan(formData) {
  const supabase = await getVenueAdminContext();
  const organizationId = requiredText(formData, "organization_id", "Organization", 64);
  const name = requiredText(formData, "name", "Venue name", 120);
  const venueId = String(formData.get("venue_id") || "").trim() || null;
  let seatPlan;
  try {
    seatPlan = JSON.parse(requiredText(formData, "seat_plan", "Seat plan", 100000));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("The seat plan is invalid. Reload the page and try again.", { cause: error });
    throw error;
  }

  const { error } = await supabase.rpc("admin_save_venue_seat_plan", {
    p_venue_id: venueId,
    p_organization_id: organizationId,
    p_name: name,
    p_seat_plan: seatPlan,
  });
  if (error) throw new Error(`Could not save venue seating plan: ${error.message}`, { cause: error });
  revalidatePath("/admin/venues");
  revalidatePath("/admin/events");
}

export async function assignVenueToEvent(formData) {
  const supabase = await getVenueAdminContext();
  const eventId = requiredText(formData, "event_id", "Event", 64);
  const venueId = String(formData.get("venue_id") || "").trim() || null;
  const { error } = await supabase.rpc("admin_assign_venue_to_event", {
    p_event_id: eventId,
    p_venue_id: venueId,
  });
  if (error) throw new Error(`Could not assign venue to event: ${error.message}`, { cause: error });
  revalidatePath("/admin/venues");
  revalidatePath("/admin/events");
  revalidatePath("/events");
}

function optionalText(formData, key, maxLength) {
  const value = String(formData.get(key) || "").trim();
  if (value.length > maxLength) throw new Error(`${key} must be ${maxLength} characters or fewer.`);
  return value || null;
}

function dateTimeToIso(value, timezone) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid date and time.");
  const [, year, month, day, hour, minute] = match.map(Number);
  const nominalUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = (instant) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(instant);
    const offset = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
    const values = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
    if (!values) return 0;
    const sign = values[1] === "+" ? 1 : -1;
    return sign * (Number(values[2]) * 60 + Number(values[3]));
  };
  let utcValue = nominalUtc - offsetMinutes(new Date(nominalUtc)) * 60_000;
  utcValue = nominalUtc - offsetMinutes(new Date(utcValue)) * 60_000;
  return new Date(utcValue).toISOString();
}

function submittedDate(formData, key, timezone) {
  return dateTimeToIso(String(formData.get(key) || ""), timezone);
}

export async function saveAdminEvent(formData) {
  const context = await getOrganizationAdminContext(
    String(formData.get("organization_id") || "") || null,
  );
  if (!context.organization) throw new Error("An organization must be linked before creating events.");
  const organizationId = context.organization.id;
  const eventId = String(formData.get("event_id") || "").trim() || null;
  const timezone = requiredText(formData, "timezone", "Timezone", 100);
  const title = requiredText(formData, "title", "Event title", 200);
  const slug = requiredText(formData, "slug", "Event URL", 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const category = String(formData.get("category") || "other");
  const capacityText = String(formData.get("capacity") || "").trim();
  const priceText = String(formData.get("ticket_price") || "0").trim();
  const capacity = capacityText ? Number(capacityText) : null;
  const ticketPrice = Number(priceText);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) throw new Error("Capacity must be a positive whole number.");
  if (!Number.isFinite(ticketPrice) || ticketPrice < 0) throw new Error("Ticket price must be zero or greater.");
  const clearOnlineMeetingUrl = formData.get("clear_online_meeting_url") === "on";
  const onlineMeetingUrl = clearOnlineMeetingUrl
    ? null
    : optionalText(formData, "online_meeting_url", 1000);
  if (onlineMeetingUrl && !/^https:\/\/\S+$/i.test(onlineMeetingUrl)) throw new Error("Meeting links must use HTTPS.");

  const { data: eventData, error } = await context.supabase.rpc("admin_save_event", {
    p_event_id: eventId,
    p_organization_id: organizationId,
    p_title: title,
    p_slug: slug,
    p_short_description: optionalText(formData, "short_description", 280) || "",
    p_description: optionalText(formData, "description", 10000) || "",
    p_category: category,
    p_tags: String(formData.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    p_start_date: submittedDate(formData, "start_date", timezone),
    p_end_date: submittedDate(formData, "end_date", timezone),
    p_registration_opens_at: submittedDate(formData, "registration_opens_at", timezone),
    p_registration_deadline: submittedDate(formData, "registration_deadline", timezone),
    p_checkin_opens_at: submittedDate(formData, "checkin_opens_at", timezone),
    p_checkin_closes_at: submittedDate(formData, "checkin_closes_at", timezone),
    p_venue_id: String(formData.get("venue_id") || "").trim() || null,
    p_venue_name: optionalText(formData, "venue_name", 200),
    p_city: optionalText(formData, "city", 120),
    p_capacity: capacity,
    p_ticket_price: ticketPrice,
    p_currency: String(formData.get("currency") || "PHP").toUpperCase(),
    p_status: String(formData.get("status") || "draft"),
    p_approval: String(formData.get("registration_approval") || "automatic"),
    p_waitlist: formData.get("waitlist_enabled") === "on",
    p_online_meeting_url: onlineMeetingUrl,
    p_timezone: timezone,
    p_clear_online_meeting_url: clearOnlineMeetingUrl,
  });
  if (error) throw new Error(`Could not save event: ${error.message}`, { cause: error });
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath(`/e/${slug}`);
  redirect(`/admin/events/${eventData}?organization_id=${organizationId}`);
}

export async function changeAdminEventStatus(formData) {
  const context = await getOrganizationAdminContext();
  const eventId = requiredText(formData, "event_id", "Event", 64);
  const status = String(formData.get("status") || "");
  if (!["draft", "published", "cancelled"].includes(status)) throw new Error("Invalid event status.");
  const { error } = await context.supabase.rpc("admin_change_event_status", {
    p_event_id: eventId,
    p_status: status,
  });
  if (error) throw new Error(`Could not update event status: ${error.message}`, { cause: error });
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/events");
}

export async function updateAdminRegistration(formData) {
  const context = await getOrganizationAdminContext();
  const registrationId = requiredText(formData, "registration_id", "Registration", 64);
  const status = String(formData.get("status") || "");
  const reason = optionalText(formData, "reason", 500);
  const { error } = await context.supabase.rpc("admin_update_registration", {
    p_registration_id: registrationId,
    p_status: status,
    p_cancellation_reason: reason,
  });
  if (error) throw new Error(`Could not update registration: ${error.message}`, { cause: error });
  revalidatePath("/admin/attendees");
  revalidatePath("/admin/dashboard");
  revalidatePath("/my-tickets");
}

export async function recordAdminAttendance(formData) {
  const context = await getOrganizationAdminContext();
  const registrationId = requiredText(formData, "registration_id", "Registration", 64);
  const { error } = await context.supabase.rpc("admin_record_attendance", {
    p_registration_id: registrationId,
  });
  if (error) throw new Error(`Could not record attendance: ${error.message}`, { cause: error });
  revalidatePath("/admin/attendees");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/dashboard");
}

export async function saveOrganizationSettings(formData) {
  const context = await getOrganizationAdminContext(
    String(formData.get("organization_id") || "") || null,
  );
  if (!context.organization || !context.canManageOrganization) throw new Error("Organization admin permission required.");
  const timezone = requiredText(formData, "timezone", "Timezone", 100);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
  } catch (error) {
    if (error instanceof RangeError) throw new Error("Enter a valid timezone, such as Asia/Manila.", { cause: error });
    throw error;
  }
  const logoUrl = optionalText(formData, "logo_url", 1000);
  const website = optionalText(formData, "website", 500);
  if (logoUrl && !/^https:\/\/\S+$/i.test(logoUrl)) throw new Error("Organization logo URLs must use HTTPS.");
  if (website && !/^https:\/\/\S+$/i.test(website)) throw new Error("Organization websites must use HTTPS.");
  const contactEmail = optionalText(formData, "contact_email", 254);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Enter a valid organization contact email.");
  const { error } = await context.supabase.rpc("admin_update_organization_settings", {
    p_organization_id: context.organization.id,
    p_name: requiredText(formData, "name", "Organization name", 120),
    p_logo_url: logoUrl,
    p_description: optionalText(formData, "description", 5000) || "",
    p_contact_email: contactEmail,
    p_contact_phone: optionalText(formData, "contact_phone", 40),
    p_website: website,
    p_address: optionalText(formData, "address", 1000),
    p_timezone: timezone,
    p_default_language: String(formData.get("default_language") || "en"),
  });
  if (error) throw new Error(`Could not save organization settings: ${error.message}`, { cause: error });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/dashboard");
}

export async function manageOrganizationMember(formData) {
  const context = await getOrganizationAdminContext(
    String(formData.get("organization_id") || "") || null,
  );
  if (!context.organization || !context.canManageOrganization) throw new Error("Organization admin permission required.");
  const action = String(formData.get("action") || "");
  const role = String(formData.get("role") || "");
  const { error } = await context.supabase.rpc("admin_manage_organization_member", {
    p_organization_id: context.organization.id,
    p_email: optionalText(formData, "email", 254),
    p_role: role,
    p_action: action,
    p_member_id: String(formData.get("member_id") || "").trim() || null,
  });
  if (error) throw new Error(`Could not update organization staff: ${error.message}`, { cause: error });
  revalidatePath("/admin/staff");
  revalidatePath("/admin/dashboard");
}

export async function assignStaffToEvent(formData) {
  const context = await getOrganizationAdminContext(
    String(formData.get("organization_id") || "") || null,
  );
  if (!context.organization || !context.canManageOrganization) throw new Error("Organization admin permission required.");
  const { error } = await context.supabase.rpc("admin_assign_staff_to_event", {
    p_organization_id: context.organization.id,
    p_membership_id: requiredText(formData, "membership_id", "Staff member", 64),
    p_event_id: requiredText(formData, "event_id", "Event", 64),
    p_assign: formData.get("assigned") === "true",
  });
  if (error) throw new Error(`Could not update event assignment: ${error.message}`, { cause: error });
  revalidatePath("/admin/staff");
}
