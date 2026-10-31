"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/authorization";
import { isFeatureEnabled } from "@/lib/features";
import { expirePayMongoCheckoutSession, verifyPayMongoPayment } from "@/lib/paymongo";
import { getSupabaseEnv } from "@/lib/supabase-env";
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

class EventFormValidationError extends Error {}

function requiredEventText(formData, key, label, maxLength) {
  const value = String(formData.get(key) || "").trim();
  if (!value) throw new EventFormValidationError(`${label} is required.`);
  if (value.length > maxLength) {
    throw new EventFormValidationError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return value;
}

function optionalEventText(formData, key, maxLength) {
  const value = String(formData.get(key) || "").trim();
  if (value.length > maxLength) {
    throw new EventFormValidationError(`${key} must be ${maxLength} characters or fewer.`);
  }
  return value || null;
}

function dateTimeToIso(value, timezone) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new EventFormValidationError("Enter a valid date and time.");
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
  try {
    return dateTimeToIso(String(formData.get(key) || ""), timezone);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new EventFormValidationError("Enter a valid timezone, such as Asia/Manila.");
    }
    throw error;
  }
}

function submittedEventValues(formData) {
  const keys = [
    "event_id",
    "slug",
    "title",
    "category",
    "tags",
    "short_description",
    "description",
    "timezone",
    "start_date",
    "end_date",
    "registration_opens_at",
    "registration_deadline",
    "checkin_opens_at",
    "checkin_closes_at",
    "venue_id",
    "venue_name",
    "city",
    "capacity",
    "ticket_price",
    "banner_url",
    "currency",
    "registration_approval",
    "online_meeting_url",
    "status",
  ];
  return {
    ...Object.fromEntries(keys.map((key) => [key, String(formData.get(key) || "")])),
    clear_online_meeting_url: formData.get("clear_online_meeting_url") === "on",
    waitlist_enabled: formData.get("waitlist_enabled") === "on",
  };
}

function eventFormFailure(error, values, previousState) {
  return {
    error,
    values,
    attempt: (previousState?.attempt || 0) + 1,
  };
}

function createEventSlug(title) {
  const slugBase = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140)
    .replace(/-$/g, "") || "event";
  return `${slugBase}-${randomUUID().replaceAll("-", "")}`;
}

export async function saveAdminEvent(_previousState, formData) {
  const context = await getOrganizationAdminContext(
    String(formData.get("organization_id") || "") || null,
  );
  if (!context.organization) throw new Error("An organization must be linked before creating events.");
  const organizationId = context.organization.id;
  const values = submittedEventValues(formData);
  try {
    const eventId = String(formData.get("event_id") || "").trim() || null;
    const timezone = requiredEventText(formData, "timezone", "Timezone", 100);
    const title = requiredEventText(formData, "title", "Event title", 200);
    const submittedSlug = String(formData.get("slug") || "").trim();
    const slug = submittedSlug
      ? submittedSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      : createEventSlug(title);
    const category = String(formData.get("category") || "other");
    const capacityText = String(formData.get("capacity") || "").trim();
    const priceText = String(formData.get("ticket_price") || "0").trim();
    const capacity = capacityText ? Number(capacityText) : null;
    const ticketPrice = Number(priceText);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      throw new EventFormValidationError("Capacity must be a positive whole number.");
    }
    if (!Number.isFinite(ticketPrice) || ticketPrice < 0) {
      throw new EventFormValidationError("Ticket price must be zero or greater.");
    }
    const clearOnlineMeetingUrl = formData.get("clear_online_meeting_url") === "on";
    const onlineMeetingUrl = clearOnlineMeetingUrl
      ? null
      : optionalEventText(formData, "online_meeting_url", 1000);
    if (onlineMeetingUrl && !/^https:\/\/\S+$/i.test(onlineMeetingUrl)) {
      throw new EventFormValidationError("Meeting links must use HTTPS.");
    }

    const { data: eventData, error } = await context.supabase.rpc("admin_save_event", {
      p_event_id: eventId,
      p_organization_id: organizationId,
      p_title: title,
      p_slug: slug,
      p_short_description: optionalEventText(formData, "short_description", 280) || "",
      p_description: optionalEventText(formData, "description", 10000) || "",
      p_category: category,
      p_tags: String(formData.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
      p_start_date: submittedDate(formData, "start_date", timezone),
      p_end_date: submittedDate(formData, "end_date", timezone),
      p_registration_opens_at: submittedDate(formData, "registration_opens_at", timezone),
      p_registration_deadline: submittedDate(formData, "registration_deadline", timezone),
      p_checkin_opens_at: submittedDate(formData, "checkin_opens_at", timezone),
      p_checkin_closes_at: submittedDate(formData, "checkin_closes_at", timezone),
      p_venue_id: String(formData.get("venue_id") || "").trim() || null,
      p_venue_name: optionalEventText(formData, "venue_name", 200),
      p_city: optionalEventText(formData, "city", 120),
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
    if (error) {
      const message = error.message === "Only future events can be published"
        ? "Only future events can be published. Choose a future start date and time, or save as a draft."
        : `Could not save event: ${error.message}`;
      return eventFormFailure(message, values, _previousState);
    }
    const savedValues = { ...values, event_id: eventData, slug };
    const { error: coverError } = await context.supabase.rpc("admin_set_event_cover", {
      p_event_id: eventData,
      p_banner_url: String(formData.get("banner_url") || "").trim() || null,
    });
    if (coverError) {
      return eventFormFailure(`Could not save event cover: ${coverError.message}`, savedValues, _previousState);
    }

    const { data: existingPlans, error: plansError } = await context.supabase
      .from("event_ticket_plans")
      .select("id")
      .eq("event_id", eventData)
      .limit(1);
    if (plansError) {
      return eventFormFailure(`Could not load event ticket plans: ${plansError.message}`, savedValues, _previousState);
    }
    if (!existingPlans?.length) {
      const { error: planError } = await context.supabase.rpc("admin_save_event_ticket_plan", {
        p_plan_id: null,
        p_event_id: eventData,
        p_name: "General admission",
        p_description: "",
        p_price: ticketPrice,
        p_capacity: capacity,
        p_requires_address: false,
      });
      if (planError) {
        return eventFormFailure(`Event saved, but its initial ticket plan could not be created: ${planError.message}`, savedValues, _previousState);
      }
    }
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/events");
    revalidatePath("/events");
    revalidatePath(`/e/${slug}`);
    redirect(`/admin/events/${eventData}?organization_id=${organizationId}`);
  } catch (error) {
    if (error instanceof EventFormValidationError) {
      return eventFormFailure(error.message, values, _previousState);
    }
    throw error;
  }
}

function submittedTicketPlanValues(formData) {
  return {
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
    price: String(formData.get("price") || "0"),
    capacity: String(formData.get("capacity") || ""),
    requires_address: formData.get("requires_address") === "on",
  };
}

export async function saveEventTicketPlan(_previousState, formData) {
  const values = submittedTicketPlanValues(formData);
  const eventId = requiredText(formData, "event_id", "Event", 64);
  const organizationId = requiredText(formData, "organization_id", "Organization", 64);
  const planId = String(formData.get("plan_id") || "").trim() || null;
  const capacityText = values.capacity.trim();
  const price = Number(values.price);
  const capacity = capacityText ? Number(capacityText) : null;
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Ticket price must be zero or greater.", values, attempt: (_previousState?.attempt || 0) + 1 };
  }
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    return { error: "Available quantity must be a positive whole number.", values, attempt: (_previousState?.attempt || 0) + 1 };
  }
  const context = await getOrganizationAdminContext(organizationId);
  const { error } = await context.supabase.rpc("admin_save_event_ticket_plan", {
    p_plan_id: planId,
    p_event_id: eventId,
    p_name: values.name,
    p_description: values.description,
    p_price: price,
    p_capacity: capacity,
    p_requires_address: values.requires_address,
  });
  if (error) {
    return { error: `Could not save ticket plan: ${error.message}`, values, attempt: (_previousState?.attempt || 0) + 1 };
  }
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/e/${String(formData.get("slug") || "")}`);
  revalidatePath("/events");
  return {
    error: "",
    values: planId ? values : { name: "", description: "", price: "0", capacity: "", requires_address: false },
    saved: true,
    attempt: (_previousState?.attempt || 0) + 1,
  };
}

export async function deleteEventTicketPlan(_previousState, formData) {
  const eventId = requiredText(formData, "event_id", "Event", 64);
  const organizationId = requiredText(formData, "organization_id", "Organization", 64);
  const planId = requiredText(formData, "plan_id", "Ticket plan", 64);
  const context = await getOrganizationAdminContext(organizationId);
  const { error } = await context.supabase.rpc("admin_delete_event_ticket_plan", {
    p_event_id: eventId,
    p_plan_id: planId,
  });
  if (error) {
    return { error: `Could not delete ticket plan: ${error.message}`, attempt: (_previousState?.attempt || 0) + 1 };
  }
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/events");
  return { error: "", deleted: true, attempt: (_previousState?.attempt || 0) + 1 };
}

export async function changeAdminEventStatus(_previousState, formData) {
  const organizationId = String(formData.get("organization_id") || "").trim();
  const context = await getOrganizationAdminContext(organizationId || null);
  const eventId = requiredText(formData, "event_id", "Event", 64);
  const status = String(formData.get("status") || "");
  if (!["draft", "published", "cancelled"].includes(status)) throw new Error("Invalid event status.");
  const { error } = await context.supabase.rpc("admin_change_event_status", {
    p_event_id: eventId,
    p_status: status,
  });
  if (error) {
    return {
      error: `Could not update event status: ${error.message}`,
      status,
      attempt: (_previousState?.attempt || 0) + 1,
    };
  }
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/events");
  return {
    error: "",
    status,
    attempt: (_previousState?.attempt || 0) + 1,
  };
}

export async function updateAdminRegistration(formData) {
  const context = await getOrganizationAdminContext();
  const registrationId = requiredText(formData, "registration_id", "Registration", 64);
  const status = String(formData.get("status") || "");
  const reason = optionalText(formData, "reason", 500);
  if (status === "cancelled" && !reason) throw new Error("A cancellation reason is required.");
  if (status === "confirmed") {
    const { data: details, error: detailError } = await context.supabase.rpc("admin_get_registration_management_detail", {
      p_registration_id: registrationId,
    });
    if (detailError) throw new Error(`Could not load registration payment details: ${detailError.message}`, { cause: detailError });
    const registration = details?.registration;
    const payment = details?.payment;
    if (!registration) throw new Error("Registration not found or access was denied.");
    if (Number(registration.unit_price) > 0) {
      if (payment?.status !== "paid" || !payment.payment_id) {
        throw new Error("Only a verified successful payment can be confirmed.");
      }
      await verifyPayMongoPayment({
        paymentId: payment.payment_id,
        amount: Number(payment.amount),
        currency: payment.currency,
      });
    }
  }
  if (status === "cancelled") {
    const { data: checkoutRows, error: checkoutError } = await context.supabase.rpc("admin_get_registration_checkout", {
      p_registration_id: registrationId,
    });
    if (checkoutError) throw new Error(`Could not load registration checkout: ${checkoutError.message}`, { cause: checkoutError });
    const checkout = checkoutRows?.[0];
    if (checkout?.payment_status === "pending") {
      if (!checkout.checkout_session_id) throw new Error("The PayMongo checkout is still being prepared. Refresh and retry.");
      const expired = await expirePayMongoCheckoutSession(checkout.checkout_session_id);
      if (!expired) throw new Error("The PayMongo checkout is still active. The registration was not cancelled.");
      const { error: cancelError } = await context.supabase.rpc("admin_cancel_pending_registration", {
        p_registration_id: registrationId,
        p_checkout_session_id: checkout.checkout_session_id,
        p_cancellation_reason: reason,
      });
      if (cancelError) throw new Error(`Could not cancel pending checkout: ${cancelError.message}`, { cause: cancelError });
    } else {
      const { error } = await context.supabase.rpc("admin_update_registration", {
        p_registration_id: registrationId,
        p_status: status,
        p_cancellation_reason: reason,
      });
      if (error) throw new Error(`Could not update registration: ${error.message}`, { cause: error });
    }
  } else {
    const { error } = await context.supabase.rpc("admin_update_registration", {
      p_registration_id: registrationId,
      p_status: status,
      p_cancellation_reason: reason,
    });
    if (error) throw new Error(`Could not update registration: ${error.message}`, { cause: error });
  }
  revalidatePath("/admin/attendees");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/registrations");
  revalidatePath(`/admin/registrations/${registrationId}`);
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
