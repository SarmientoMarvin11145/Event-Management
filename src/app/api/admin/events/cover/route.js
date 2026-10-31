import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getOrganizationAdminContext } from "@/lib/admin-data";
import { getSupabaseEnv } from "@/lib/supabase-env";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "A valid multipart image upload is required." }, { status: 400 });
  }
  const image = formData.get("image");
  const organizationId = String(formData.get("organization_id") || "");
  const eventId = String(formData.get("event_id") || "");
  if (!(image instanceof File) || !IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_SIZE) {
    return Response.json({ error: "Choose a JPG, PNG, or WebP image up to 5 MB." }, { status: 400 });
  }
  if (!organizationId) return Response.json({ error: "Organization is required." }, { status: 400 });

  const context = await getOrganizationAdminContext(organizationId);
  if (eventId) {
    const { data: canManage, error } = await context.supabase.rpc("can_manage_event", { p_event_id: eventId });
    if (error) throw new Error(`Unable to verify event permissions: ${error.message}`, { cause: error });
    if (!canManage) return Response.json({ error: "You cannot update this event's cover image." }, { status: 403 });
    const { data: event, error: eventError } = await context.supabase
      .from("events")
      .select("organization_id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) throw new Error(`Unable to verify event organization: ${eventError.message}`, { cause: eventError });
    if (!event || event.organization_id !== organizationId) {
      return Response.json({ error: "The event does not belong to the selected organization." }, { status: 403 });
    }
  } else if (!context.canManageOrganization) {
    return Response.json({ error: "Organization administrators can upload covers for new events." }, { status: 403 });
  }

  const { supabaseUrl } = getSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return Response.json({ error: "Event image uploads are not configured." }, { status: 503 });
  const imageBytes = Buffer.from(await image.arrayBuffer());
  const isValidImage = image.type === "image/jpeg"
    ? imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff
    : image.type === "image/png"
      ? imageBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : imageBytes.toString("ascii", 0, 4) === "RIFF"
        && imageBytes.toString("ascii", 8, 12) === "WEBP";
  if (!isValidImage) return Response.json({ error: "The uploaded file is not a valid image of the selected type." }, { status: 400 });
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const path = `${organizationId}/${eventId || "new"}/${randomUUID()}.${IMAGE_TYPES.get(image.type)}`;
  const { error: uploadError } = await serviceClient.storage
    .from("event-covers")
    .upload(path, imageBytes, { contentType: image.type, upsert: false });
  if (uploadError) {
    console.error("Unable to upload event cover", uploadError);
    return Response.json({ error: "Could not upload the event cover image." }, { status: 502 });
  }
  const { data } = serviceClient.storage.from("event-covers").getPublicUrl(path);
  return Response.json({ url: data.publicUrl });
}
