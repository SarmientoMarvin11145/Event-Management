import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function getAttendeeSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error?.name === "AuthSessionMissingError" || (!error && !user)) {
    redirect("/login");
  }
  if (error) {
    throw error;
  }
  if (!user) redirect("/login");

  return { supabase, user };
}

export function throwOnSupabaseError(error) {
  if (error) {
    throw new Error(`Unable to load attendee data: ${error.message}`, {
      cause: error,
    });
  }
}

export function eventFromRelation(event) {
  return Array.isArray(event) ? event[0] : event;
}

export function organizationFromRelation(organization) {
  return Array.isArray(organization) ? organization[0] : organization;
}

export function formatEventDate(value, options = {}) {
  if (!value) return "Date to be announced";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(value));
}

export function getFirstName(fullName, email) {
  const name = fullName?.trim();
  return name ? name.split(/\s+/)[0] : email?.split("@")[0] || "there";
}
