"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isFeatureEnabled } from "@/lib/features";

async function requireEnabledFeature(key, label) {
  if (!(await isFeatureEnabled(key))) throw new Error(`${label} is currently disabled by the platform team.`);
}

async function getActionContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error?.name !== "AuthSessionMissingError" && error) throw error;
  if (!user) redirect("/login");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError && !["42703", "PGRST204"].includes(profileError.code)) {
    throw new Error(`Unable to verify account status: ${profileError.message}`, { cause: profileError });
  }
  if (profile?.account_status && profile.account_status !== "active") {
    redirect("/login?error=account-disabled");
  }
  return { supabase, user };
}

function requiredText(formData, key, label, maxLength = 200) {
  const value = String(formData.get(key) || "").trim();
  if (!value) throw new Error(`${label} is required.`);
  if (value.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return value;
}

export async function registerForEvent(formData) {
  await requireEnabledFeature("event-registration", "Event registration");
  const { supabase } = await getActionContext();
  const eventId = requiredText(formData, "event_id", "Event");
  const seatId = String(formData.get("seat_id") || "").trim();
  const result = seatId
    ? await supabase.rpc("register_for_event_with_seat", {
      p_event_id: eventId,
      p_seat_id: seatId,
    })
    : await supabase.rpc("register_for_event", { p_event_id: eventId });
  const { error } = result;
  if (error) throw new Error(`Registration failed: ${error.message}`, { cause: error });
  revalidatePath("/dashboard");
  revalidatePath("/my-events");
  revalidatePath("/my-tickets");
  redirect("/my-tickets");
}

export async function cancelRegistration(formData) {
  await requireEnabledFeature("my-tickets", "Ticket cancellation");
  const { supabase, user } = await getActionContext();
  const registrationId = requiredText(formData, "registration_id", "Registration");
  const { data: registration, error: registrationError } = await supabase
    .from("registrations")
    .select("id, status, events(ticket_price)")
    .eq("id", registrationId)
    .eq("attendee_id", user.id)
    .maybeSingle();
  if (registrationError) throw new Error(`Unable to check ticket cancellation: ${registrationError.message}`, { cause: registrationError });
  const event = Array.isArray(registration?.events) ? registration.events[0] : registration?.events;
  if (Number(event?.ticket_price || 0) > 0) {
    throw new Error("Paid tickets cannot be cancelled online because refunds are not integrated. Contact the event organizer.");
  }
  const { data, error } = await supabase
    .from("registrations")
    .update({ status: "cancelled" })
    .eq("id", registrationId)
    .eq("attendee_id", user.id)
    .in("status", ["confirmed", "pending", "waitlisted", "invited"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Cancellation failed: ${error.message}`, { cause: error });
  if (!data) {
    throw new Error("This registration cannot be cancelled. The event may have started or the ticket is no longer active.");
  }
  revalidatePath("/dashboard");
  revalidatePath("/my-events");
  revalidatePath("/my-tickets");
  revalidatePath("/history");
  redirect("/my-tickets");
}

export async function addFavorite(formData) {
  await requireEnabledFeature("favorites", "Saved events");
  const { supabase, user } = await getActionContext();
  const eventId = requiredText(formData, "event_id", "Event");
  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: user.id, event_id: eventId });
  if (error) throw new Error(`Could not save event: ${error.message}`, { cause: error });
  revalidatePath("/dashboard");
  revalidatePath("/favorites");
  revalidatePath("/events");
  redirect("/favorites");
}

export async function removeFavorite(formData) {
  await requireEnabledFeature("favorites", "Saved events");
  const { supabase, user } = await getActionContext();
  const eventId = requiredText(formData, "event_id", "Event");
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("event_id", eventId);
  if (error) throw new Error(`Could not remove saved event: ${error.message}`, { cause: error });
  revalidatePath("/dashboard");
  revalidatePath("/favorites");
  redirect("/favorites");
}

export async function saveProfile(formData) {
  await requireEnabledFeature("user-profile", "Profile editing");
  const { supabase, user } = await getActionContext();
  const fullName = requiredText(formData, "full_name", "Full name", 120);
  const dateOfBirth = String(formData.get("date_of_birth") || "").trim();
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new Error("Enter a valid date of birth.");
  }
  const optional = (key, length = 160) => String(formData.get(key) || "").trim().slice(0, length) || null;
  const values = {
    full_name: fullName,
    phone: optional("phone", 40),
    date_of_birth: dateOfBirth || null,
    gender: optional("gender", 60),
    country: optional("country"),
    province: optional("province"),
    city: optional("city"),
    barangay: optional("barangay"),
    street_address: optional("street_address", 300),
    occupation: optional("occupation"),
    company: optional("company"),
    job_title: optional("job_title"),
    linkedin_url: optional("linkedin_url", 300),
    emergency_contact_name: optional("emergency_contact_name"),
    emergency_contact_relationship: optional("emergency_contact_relationship", 80),
    emergency_contact_phone: optional("emergency_contact_phone", 40),
    dietary_restrictions: optional("dietary_restrictions", 500),
    accessibility_needs: optional("accessibility_needs", 500),
    t_shirt_size: optional("t_shirt_size", 30),
    language_preference: ["en", "fil", "ceb"].includes(String(formData.get("language_preference")))
      ? String(formData.get("language_preference"))
      : "en",
    interests: formData.getAll("interests").map((value) => String(value).slice(0, 50)).slice(0, 20),
  };
  const { data, error } = await supabase.from("profiles").update(values).eq("id", user.id).select("id").maybeSingle();
  if (error) throw new Error(`Profile update failed: ${error.message}`, { cause: error });
  if (!data) throw new Error("Profile update failed because your account profile could not be found.");
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  redirect("/profile?saved=1");
}

export async function saveSettings(formData) {
  await requireEnabledFeature("user-settings", "Settings");
  const { supabase, user } = await getActionContext();
  const notifications = {
    event_reminders: formData.get("event_reminders") === "on",
    registration_confirmations: formData.get("registration_confirmations") === "on",
    certificate_issued: formData.get("certificate_issued") === "on",
    organization_events: formData.get("organization_events") === "on",
    platform_updates: formData.get("platform_updates") === "on",
    promotions: formData.get("promotions") === "on",
  };
  const privacy = {
    profile_visibility: formData.get("profile_visibility") === "public" ? "public" : "private",
    show_in_attendee_lists: formData.get("show_in_attendee_lists") === "on",
    share_contact_with_organizers: formData.get("share_contact_with_organizers") === "on",
  };
  const appearance = {
    theme: ["system", "light", "dark"].includes(String(formData.get("theme")))
      ? String(formData.get("theme"))
      : "system",
    language: ["en", "fil", "ceb"].includes(String(formData.get("language")))
      ? String(formData.get("language"))
      : "en",
    timezone: "Asia/Manila",
    date_format: "medium",
  };
  const { error } = await supabase.from("attendee_settings").upsert({
    user_id: user.id,
    notification_preferences: notifications,
    privacy_preferences: privacy,
    appearance_preferences: appearance,
  });
  if (error) throw new Error(`Settings update failed: ${error.message}`, { cause: error });
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function markNotificationRead(formData) {
  await requireEnabledFeature("notifications", "Notifications");
  const { supabase, user } = await getActionContext();
  const notificationId = requiredText(formData, "notification_id", "Notification");
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id);
  if (error) throw new Error(`Could not update notification: ${error.message}`, { cause: error });
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  revalidatePath("/admin/dashboard");
}

export async function submitSupportRequest(formData) {
  await requireEnabledFeature("support", "Support requests");
  const { supabase, user } = await getActionContext();
  const subject = requiredText(formData, "subject", "Subject", 160);
  const message = requiredText(formData, "message", "Message", 5000);
  const { error } = await supabase.from("support_requests").insert({
    user_id: user.id,
    subject,
    message,
  });
  if (error) throw new Error(`Support request could not be submitted: ${error.message}`, { cause: error });
  revalidatePath("/help");
  redirect("/help?submitted=1");
}

export async function applyAsOrganizer(formData) {
  await requireEnabledFeature("organizer-applications", "Organizer applications");
  const { supabase, user } = await getActionContext();
  const organizationName = requiredText(formData, "organization_name", "Organization name", 160);
  const organizationType = requiredText(formData, "organization_type", "Organization type", 60);
  const details = String(formData.get("details") || "").trim().slice(0, 3000) || null;
  const { error } = await supabase.from("organizer_applications").insert({
    user_id: user.id,
    organization_name: organizationName,
    organization_type: organizationType,
    details,
  });
  if (error) throw new Error(`Application could not be submitted: ${error.message}`, { cause: error });
  revalidatePath("/apply-organizer");
  redirect("/apply-organizer?submitted=1");
}

export async function submitEventReview(formData) {
  await requireEnabledFeature("reviews", "Event reviews");
  const { supabase, user } = await getActionContext();
  const eventId = requiredText(formData, "event_id", "Event");
  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Choose a rating from 1 to 5.");
  }
  const comment = String(formData.get("comment") || "").trim().slice(0, 2000) || null;
  const { data: existing, error: lookupError } = await supabase
    .from("event_reviews")
    .select("id")
    .eq("user_id", user.id)
    .eq("event_id", eventId)
    .maybeSingle();
  if (lookupError) throw new Error(`Review could not be loaded: ${lookupError.message}`, { cause: lookupError });

  const result = existing
    ? await supabase.from("event_reviews").update({ rating, comment }).eq("id", existing.id).eq("user_id", user.id)
    : await supabase.from("event_reviews").insert({ user_id: user.id, event_id: eventId, rating, comment });
  if (result.error) throw new Error(`Review could not be saved: ${result.error.message}`, { cause: result.error });
  revalidatePath("/history");
  redirect("/history?reviewed=1");
}
