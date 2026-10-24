"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/authorization";
import { FEATURE_KEY_SET } from "@/lib/features";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function getSuperadminClient() {
  const user = await requireAuthenticatedUser(["superadmin"]);
  return { supabase: await createSupabaseServerClient(), user };
}

function requiredText(formData, key, label, maxLength = 200) {
  const value = String(formData.get(key) || "").trim();
  if (!value) throw new Error(`${label} is required.`);
  if (value.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  return value;
}

function optionalText(formData, key, maxLength = 500) {
  const value = String(formData.get(key) || "").trim();
  if (value.length > maxLength) throw new Error(`${key} must be ${maxLength} characters or fewer.`);
  return value || null;
}

async function writeAudit(supabase, action, entityType, entityId, details = {}) {
  const { error } = await supabase.rpc("superadmin_write_log", {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_details: details,
  });
  if (error) throw new Error(`Action completed but audit logging failed: ${error.message}`, { cause: error });
}

function refreshConsole(paths = []) {
  for (const path of ["/superadmin", "/superadmin/dashboard", ...paths]) revalidatePath(path);
}

export async function updateOrganization(formData) {
  const { supabase } = await getSuperadminClient();
  const id = requiredText(formData, "id", "Organization");
  const status = String(formData.get("status") || "");
  if (!["active", "suspended", "pending"].includes(status)) throw new Error("Invalid organization status.");

  const { data, error } = await supabase
    .from("organizations")
    .update({ status })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not update organization: ${error.message}`, { cause: error });
  if (!data) throw new Error("Organization not found or access was denied.");
  await writeAudit(supabase, "organization.updated", "organization", id, { status });
  refreshConsole(["/superadmin/organizations"]);
}

export async function updateUserAccess(formData) {
  const { supabase } = await getSuperadminClient();
  const userId = requiredText(formData, "user_id", "User");
  const role = String(formData.get("role") || "");
  const accountStatus = String(formData.get("account_status") || "");
  const { error } = await supabase.rpc("superadmin_update_user", {
    p_user_id: userId,
    p_role: role,
    p_account_status: accountStatus,
  });
  if (error) throw new Error(`Could not update user access: ${error.message}`, { cause: error });
  refreshConsole(["/superadmin/users"]);
}

export async function reviewOrganizerApplication(formData) {
  const { supabase } = await getSuperadminClient();
  const applicationId = requiredText(formData, "application_id", "Application");
  const decision = String(formData.get("decision") || "");
  const note = optionalText(formData, "note", 2000);
  const { error } = await supabase.rpc("superadmin_review_application", {
    p_application_id: applicationId,
    p_decision: decision,
    p_note: note,
  });
  if (error) throw new Error(`Could not review application: ${error.message}`, { cause: error });
  refreshConsole(["/superadmin/applications", "/superadmin/organizations", "/superadmin/users"]);
}

export async function moderateEvent(formData) {
  const { supabase } = await getSuperadminClient();
  const id = requiredText(formData, "event_id", "Event");
  const moderationStatus = String(formData.get("moderation_status") || "");
  const eventStatus = String(formData.get("status") || "");
  const reason = optionalText(formData, "reason", 1000);
  if (!["normal", "flagged", "under_review", "removed"].includes(moderationStatus)) {
    throw new Error("Invalid moderation status.");
  }
  if (!["draft", "published", "cancelled"].includes(eventStatus)) throw new Error("Invalid event status.");
  const savedStatus = moderationStatus === "removed" ? "cancelled" : eventStatus;
  const { data, error } = await supabase
    .from("events")
    .update({ moderation_status: moderationStatus, moderation_reason: reason, status: savedStatus })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not moderate event: ${error.message}`, { cause: error });
  if (!data) throw new Error("Event not found or access was denied.");
  await writeAudit(supabase, "event.moderated", "event", id, { moderation_status: moderationStatus, status: savedStatus });
  refreshConsole(["/superadmin/events"]);
}

export async function updateSupportRequest(formData) {
  const { supabase, user } = await getSuperadminClient();
  const id = requiredText(formData, "request_id", "Support request");
  const status = String(formData.get("status") || "");
  const priority = String(formData.get("priority") || "");
  if (!["open", "in_progress", "resolved", "closed"].includes(status)) throw new Error("Invalid support status.");
  if (!["low", "medium", "high", "urgent"].includes(priority)) throw new Error("Invalid priority.");

  const { data, error } = await supabase
    .from("support_requests")
    .update({ status, priority, assigned_to: user.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not update support request: ${error.message}`, { cause: error });
  if (!data) throw new Error("Support request not found or access was denied.");
  await writeAudit(supabase, "support_request.updated", "support_request", id, { status, priority });
  refreshConsole(["/superadmin/support"]);
}

export async function replyToSupportRequest(formData) {
  const { supabase, user } = await getSuperadminClient();
  const requestId = requiredText(formData, "request_id", "Support request");
  const message = requiredText(formData, "message", "Reply", 5000);
  const { error } = await supabase.from("support_messages").insert({
    request_id: requestId,
    author_id: user.id,
    message,
  });
  if (error) throw new Error(`Could not send support reply: ${error.message}`, { cause: error });
  await writeAudit(supabase, "support_request.replied", "support_request", requestId);
  refreshConsole(["/superadmin/support"]);
}

export async function sendInAppBroadcast(formData) {
  const { supabase } = await getSuperadminClient();
  const title = requiredText(formData, "title", "Title", 160);
  const message = requiredText(formData, "message", "Message", 5000);
  const target = String(formData.get("target_role") || "");
  if (target && !["user", "admin", "superadmin"].includes(target)) throw new Error("Invalid target role.");
  const link = optionalText(formData, "link", 500);
  if (link && (!link.startsWith("/") || link.startsWith("//") || link.includes("\\"))) {
    throw new Error("The link must be a path within this application.");
  }
  const { error } = await supabase.rpc("superadmin_send_broadcast", {
    p_title: title,
    p_message: message,
    p_target_role: target || null,
    p_link: link,
  });
  if (error) throw new Error(`Could not send in-app broadcast: ${error.message}`, { cause: error });
  refreshConsole(["/superadmin/notifications"]);
}

export async function savePlatformSettings(formData) {
  const { supabase, user } = await getSuperadminClient();
  const entries = [
    ["platform_name", requiredText(formData, "platform_name", "Platform name", 100)],
    ["support_email", optionalText(formData, "support_email", 254) || ""],
    ["timezone", requiredText(formData, "timezone", "Timezone", 100)],
    ["default_language", String(formData.get("default_language") || "en")],
    ["maintenance_mode", formData.get("maintenance_mode") === "on"],
    ["maintenance_message", optionalText(formData, "maintenance_message", 500) || ""],
  ];
  if (entries[1][1] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entries[1][1])) {
    throw new Error("Enter a valid support email address.");
  }
  if (!["en", "fil", "ceb"].includes(entries[3][1])) throw new Error("Invalid default language.");

  const { error } = await supabase.from("platform_settings").upsert(
    entries.map(([setting_key, setting_value]) => ({
      setting_key,
      setting_value,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "setting_key" },
  );
  if (error) throw new Error(`Could not save platform settings: ${error.message}`, { cause: error });
  await writeAudit(supabase, "platform_settings.updated", "platform_settings", null, { keys: entries.map(([key]) => key) });
  refreshConsole(["/superadmin/settings"]);
}

export async function setFeatureFlag(formData) {
  const { supabase, user } = await getSuperadminClient();
  const key = requiredText(formData, "flag_key", "Feature flag", 100);
  if (!FEATURE_KEY_SET.has(key)) throw new Error("Unknown feature flag.");
  const enabled = formData.get("enabled") === "true";
  const { data, error } = await supabase
    .from("feature_flags")
    .update({ enabled, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("flag_key", key)
    .select("flag_key")
    .maybeSingle();
  if (error) throw new Error(`Could not update feature flag: ${error.message}`, { cause: error });
  if (!data) throw new Error("Feature flag not found or access was denied.");
  await writeAudit(supabase, "feature_flag.updated", "feature_flag", key, { enabled });
  refreshConsole(["/superadmin/features"]);
}

export async function saveContentItem(formData) {
  const { supabase, user } = await getSuperadminClient();
  const title = requiredText(formData, "title", "Title", 200);
  const slug = requiredText(formData, "slug", "Slug", 200)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const contentType = String(formData.get("content_type") || "");
  const status = String(formData.get("status") || "");
  const body = requiredText(formData, "body", "Content", 20000);
  if (!slug) throw new Error("Enter a valid slug.");
  if (!["announcement", "faq", "blog"].includes(contentType)) throw new Error("Invalid content type.");
  if (!["draft", "published", "archived"].includes(status)) throw new Error("Invalid content status.");
  const { error } = await supabase.from("platform_content").upsert(
    { title, slug, content_type: contentType, status, body, updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: "slug" },
  );
  if (error) throw new Error(`Could not save content: ${error.message}`, { cause: error });
  await writeAudit(supabase, "platform_content.saved", "platform_content", slug, { content_type: contentType, status });
  refreshConsole(["/superadmin/content"]);
}

export async function createSuperadminTask(formData) {
  const { supabase, user } = await getSuperadminClient();
  const title = requiredText(formData, "title", "Task", 240);
  const dueValue = String(formData.get("due_at") || "");
  const dueAt = dueValue ? new Date(dueValue) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Enter a valid due date.");
  const { error } = await supabase.from("superadmin_tasks").insert({
    user_id: user.id,
    title,
    due_at: dueAt?.toISOString() || null,
  });
  if (error) throw new Error(`Could not create task: ${error.message}`, { cause: error });
  refreshConsole(["/superadmin/dashboard", "/superadmin/tasks"]);
}

export async function completeSuperadminTask(formData) {
  const { supabase, user } = await getSuperadminClient();
  const id = requiredText(formData, "task_id", "Task");
  const completed = formData.get("completed") === "true";
  const { data, error } = await supabase
    .from("superadmin_tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not update task: ${error.message}`, { cause: error });
  if (!data) throw new Error("Task not found or access was denied.");
  refreshConsole(["/superadmin/dashboard", "/superadmin/tasks"]);
}

export async function saveSuperadminProfile(formData) {
  const { supabase, user } = await getSuperadminClient();
  const fullName = requiredText(formData, "full_name", "Name", 120);
  const phone = optionalText(formData, "phone", 40);
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not update profile: ${error.message}`, { cause: error });
  if (!data) throw new Error("Profile not found or access was denied.");
  refreshConsole(["/superadmin/profile"]);
  redirect("/superadmin/profile?saved=1");
}
