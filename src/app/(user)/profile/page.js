import { saveProfile } from "@/app/(user)/actions";
import { getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { Panel, PortalHeading, StatusMessage } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Profile | KURO" };

const interests = ["Technology", "Business", "Arts", "Sports", "Health", "Education", "Community", "Food"];

export default async function ProfilePage({ searchParams }) {
  await requireFeatureEnabled("user-profile");
  const params = await searchParams;
  const { supabase, user } = await getAttendeeSession();
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  throwOnSupabaseError(error);

  return (
    <div className="space-y-6">
      <PortalHeading title="Your profile" description="Manage the information used for event registration. Identity document uploads and phone verification are not enabled." />
      {params?.saved && <StatusMessage tone="success">Your profile has been saved.</StatusMessage>}
      <form action={saveProfile} className="space-y-5">
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Personal information</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="full_name" required value={profile?.full_name || ""} />
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#526864]" htmlFor="email">Email</label>
              <input className="kuro-input w-full rounded-md border border-[#cbd8d1] bg-[#f4f6f1] px-3 py-2.5 text-sm text-[#61736e]" id="email" readOnly value={user.email || ""} />
              <p className="mt-1 text-xs text-[#7a8b84]">{user.email_confirmed_at ? "Verified" : "Not verified"}</p>
            </div>
            <Field label="Phone" name="phone" type="tel" value={profile?.phone || ""} />
            <Field label="Date of birth" name="date_of_birth" type="date" value={profile?.date_of_birth || ""} />
            <Field label="Gender (optional)" name="gender" value={profile?.gender || ""} />
          </div>
        </Panel>
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Address</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Country" name="country" value={profile?.country || "Philippines"} />
            <Field label="Province" name="province" value={profile?.province || ""} />
            <Field label="City" name="city" value={profile?.city || ""} />
            <Field label="Barangay" name="barangay" value={profile?.barangay || ""} />
            <Field label="Street address" name="street_address" value={profile?.street_address || ""} />
          </div>
        </Panel>
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Professional details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Occupation" name="occupation" value={profile?.occupation || ""} />
            <Field label="Company or school" name="company" value={profile?.company || ""} />
            <Field label="Job title" name="job_title" value={profile?.job_title || ""} />
            <Field label="LinkedIn URL" name="linkedin_url" type="url" value={profile?.linkedin_url || ""} />
          </div>
        </Panel>
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Emergency contact & preferences</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Emergency contact name" name="emergency_contact_name" value={profile?.emergency_contact_name || ""} />
            <Field label="Relationship" name="emergency_contact_relationship" value={profile?.emergency_contact_relationship || ""} />
            <Field label="Emergency contact phone" name="emergency_contact_phone" type="tel" value={profile?.emergency_contact_phone || ""} />
            <Field label="Dietary restrictions" name="dietary_restrictions" value={profile?.dietary_restrictions || ""} />
            <Field label="Accessibility needs" name="accessibility_needs" value={profile?.accessibility_needs || ""} />
            <Field label="T-shirt size" name="t_shirt_size" value={profile?.t_shirt_size || ""} />
            <label className="block text-sm font-semibold text-[#526864]">Language
              <select className="kuro-input mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 font-normal" defaultValue={profile?.language_preference || "en"} name="language_preference">
                <option value="en">English</option><option value="fil">Filipino</option><option value="ceb">Cebuano</option>
              </select>
            </label>
          </div>
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-[#526864]">Interests for event discovery</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {interests.map((interest) => (
                <label className="inline-flex items-center gap-2 rounded-md border border-[#dce4dc] px-3 py-2 text-sm text-[#526864]" key={interest}>
                  <input defaultChecked={profile?.interests?.includes(interest)} name="interests" type="checkbox" value={interest} />
                  {interest}
                </label>
              ))}
            </div>
          </fieldset>
        </Panel>
        <div className="flex justify-end">
          <button className="rounded-md bg-[#173d39] px-5 py-3 text-sm font-bold text-white hover:bg-[#245c55]" type="submit">Save profile</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, required = false, type = "text", value }) {
  return (
    <label className="block text-sm font-semibold text-[#526864]" htmlFor={name}>
      {label}
      <input className="kuro-input mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 font-normal" id={name} maxLength={type === "url" ? 300 : undefined} name={name} required={required} type={type} defaultValue={value} />
    </label>
  );
}
