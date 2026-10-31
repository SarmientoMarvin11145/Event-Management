import {
  createGuestRegistrationServiceClient,
  hashGuestToken,
} from "@/lib/guest-registration-server";

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  const headers = { "Cache-Control": "no-store, max-age=0" };
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return Response.json({ error: "This ticket link is invalid or expired." }, { status: 400, headers });
  }

  try {
    const serviceClient = createGuestRegistrationServiceClient();
    const { data, error } = await serviceClient.rpc("get_guest_event_ticket", {
      p_ticket_token_hash: hashGuestToken(token),
    });
    if (error) throw new Error(`Unable to load guest ticket: ${error.message}`, { cause: error });
    const ticket = data?.[0];
    if (!ticket) {
      return Response.json({ error: "This ticket link is invalid or has expired." }, { status: 404, headers });
    }
    return Response.json({ ticket }, { headers });
  } catch (error) {
    console.error("Unable to load guest event ticket", error);
    return Response.json({ error: "Could not load this ticket. Please try again later." }, { status: 500, headers });
  }
}
