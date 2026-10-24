import { applyAsOrganizer } from "@/app/(user)/actions";
import { getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { Panel, PortalHeading, StatusMessage } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Apply as organizer | KURO" };

export default async function ApplyOrganizerPage({ searchParams }) {
  await requireFeatureEnabled("organizer-applications");
  const params = await searchParams;
  const { supabase, user } = await getAttendeeSession();
  const { data, error } = await supabase.from("organizer_applications").select("id, organization_name, organization_type, details, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
  throwOnSupabaseError(error);
  const applications = data || [];
  const pending = applications.find((application) => application.status === "pending");

  return (
    <div className="space-y-6">
      <PortalHeading title="Apply as an organizer" description="Tell KURO about your organization to request organizer access." />
      {params?.submitted && <StatusMessage tone="success">Your application was submitted for review.</StatusMessage>}
      {pending ? (
        <Panel>
          <p className="text-xs font-bold uppercase tracking-wide text-[#d6533d]">Under review</p>
          <h2 className="mt-2 text-lg font-bold text-[#173d39]">{pending.organization_name}</h2>
          <p className="mt-1 text-sm text-[#61736e]">Submitted {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(pending.created_at))}</p>
        </Panel>
      ) : (
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Organization details</h2>
          <form action={applyAsOrganizer} className="mt-4 grid gap-4 sm:max-w-2xl">
            <label className="text-sm font-semibold text-[#526864]" htmlFor="organization_name">Organization name<input className="kuro-input mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 font-normal" id="organization_name" maxLength={160} name="organization_name" required /></label>
            <label className="text-sm font-semibold text-[#526864]" htmlFor="organization_type">Organization type
              <select className="kuro-input mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 font-normal" id="organization_type" name="organization_type" required>
                <option value="">Select a type</option><option>School</option><option>Restaurant</option><option>Barangay / LGU</option><option>Webinar</option><option>Expo</option><option>Private organization</option><option>Other</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-[#526864]" htmlFor="details">Additional details<textarea className="kuro-input mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 font-normal" id="details" maxLength={3000} name="details" rows={4} /></label>
            <button className="justify-self-start rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white" type="submit">Submit application</button>
          </form>
        </Panel>
      )}
      {applications.length > 0 && (
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Application history</h2>
          <ul className="mt-3 divide-y divide-[#e8eee7]">
            {applications.map((application) => <li className="flex flex-wrap justify-between gap-2 py-3" key={application.id}><span className="text-sm font-semibold text-[#526864]">{application.organization_name}</span><span className="text-sm capitalize text-[#61736e]">{application.status.replaceAll("_", " ")}</span></li>)}
          </ul>
        </Panel>
      )}
      <p className="text-xs leading-5 text-[#7a8b84]">Applications are recorded for review; this preview does not grant organizer access or provide an approval workflow.</p>
    </div>
  );
}
