import { getOrganizationAdminContext } from "@/lib/admin-data";
import { hasMinimumPlan } from "@/lib/account-plan";

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(rows, filename) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  const context = await getOrganizationAdminContext(organizationId);
  if (!context.organization) return new Response("No organization data connected.", { status: 404 });
  const kind = url.searchParams.get("kind") || "reports";

  if (kind === "attendees") {
    if (!context.canManageOrganization) {
      if (!["event_manager", "check_in_staff"].includes(context.membership?.role)) {
        return new Response("Attendee export access required.", { status: 403 });
      }
      const { data: assignments, error: assignmentError } = await context.supabase
        .from("organization_member_events")
        .select("event_id")
        .eq("membership_id", context.membership.membership_id);
      if (assignmentError) throw new Error(`Unable to verify attendee export access: ${assignmentError.message}`, { cause: assignmentError });
      if (!assignments?.length) return new Response("Attendee export access requires an event assignment.", { status: 403 });
    }
    const status = url.searchParams.get("status") || null;
    if (status && !["confirmed", "pending", "cancelled", "waitlisted", "invited"].includes(status)) {
      return new Response("Invalid registration status.", { status: 400 });
    }
    const search = url.searchParams.get("q") || null;
    if (search && search.length > 100) return new Response("Search query must be 100 characters or fewer.", { status: 400 });
    const data = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: page, error } = await context.supabase.rpc("admin_list_organization_attendees", {
        p_organization_id: context.organization.id,
        p_search: search,
        p_event_id: url.searchParams.get("event_id") || null,
        p_status: status,
        p_limit: 1000,
        p_offset: offset,
      });
      if (error) throw new Error(`Unable to export attendee data: ${error.message}`, { cause: error });
      data.push(...(page || []));
      if (!page || page.length < 1000) break;
    }
    const rows = [
      ["Attendee", "Email (consent required)", "Event", "Event start", "Registration status", "Registered at", "Check-in time", "Seat", "Registration code"],
      ...(data || []).map((item) => [
        item.attendee_name, item.attendee_email, item.event_title, item.event_start,
        item.registration_status, item.registered_at, item.checked_in_at, item.seat_number, item.registration_code,
      ]),
    ];
    return csvResponse(rows, "kuro-attendees.csv");
  }

  if (kind !== "reports") return new Response("Invalid export type.", { status: 400 });
  if (!hasMinimumPlan(context.planTier, "business")) {
    return new Response("Advanced reports require a Business account plan.", { status: 403 });
  }
  if (!context.canManageOrganization) return new Response("Organization admin permission required.", { status: 403 });
  const { data: reports, error } = await context.supabase.rpc("admin_get_organization_reports", {
    p_organization_id: context.organization.id,
  });
  if (error) throw new Error(`Unable to export organization reports: ${error.message}`, { cause: error });
  return csvResponse([
    ["Event", "Start date", "Status", "Capacity", "Price", "Currency", "Registrations", "Confirmed", "Attended"],
    ...(reports?.events || []).map((event) => [
      event.title, event.start_date, event.status, event.capacity ?? "Unlimited",
      event.ticket_price, event.currency, event.registrations, event.confirmed, event.attended,
    ]),
  ], "kuro-event-reports.csv");
}
