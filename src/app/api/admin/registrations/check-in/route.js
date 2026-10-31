import { createSupabaseServerClient } from "@/lib/supabase-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A valid JSON request is required." }, { status: 400 });
  }
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const qrToken = typeof body?.qrToken === "string" ? body.qrToken : "";
  if (!UUID_PATTERN.test(eventId) || !UUID_PATTERN.test(qrToken)) {
    return Response.json({ error: "Scan a valid event ticket QR code." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError?.name !== "AuthSessionMissingError" && authError) throw authError;
  if (!user) return Response.json({ error: "Sign in to check in tickets." }, { status: 401 });

  const { data, error } = await supabase.rpc("admin_check_in_ticket", {
    p_event_id: eventId,
    p_qr_token: qrToken,
  });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ ticket: data });
}
