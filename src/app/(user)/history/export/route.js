import { createSupabaseServerClient } from "@/lib/supabase-server";
import { eventFromRelation } from "@/lib/attendee-data";
import { isFeatureEnabled } from "@/lib/features";

function csvCell(value) {
  const text = String(value ?? "");
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export async function GET() {
  if (!(await isFeatureEnabled("event-history"))) return new Response("Feature disabled", { status: 404 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await supabase
    .from("registrations")
    .select("status, registration_code, created_at, events(title, start_date, end_date), attendance_logs(check_in_time, check_out_time)")
    .eq("attendee_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`History export failed: ${error.message}`, { cause: error });

  const rows = [
    ["Event", "Start date", "Registration status", "Registration ID", "Check-in", "Check-out"],
    ...(data || []).map((row) => {
      const event = eventFromRelation(row.events);
      const attendance = Array.isArray(row.attendance_logs) ? row.attendance_logs[0] : row.attendance_logs;
      return [
        event?.title,
        event?.start_date,
        row.status,
        row.registration_code,
        attendance?.check_in_time,
        attendance?.check_out_time,
      ];
    }),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kuro-event-history.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
