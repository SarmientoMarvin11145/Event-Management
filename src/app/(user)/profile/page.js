import Link from "next/link";
import SignOutButton from "@/components/sign-out-button";
import { saveProfile } from "@/app/(user)/actions";
import { getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { getFeatureFlagMap, requireFeatureEnabled } from "@/lib/features";
import { isMissingOrganizationMembershipFunction } from "@/lib/admin-data";
import { Panel, StatusMessage } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Profile | KURO" };

const interests = ["Technology", "Business", "Arts", "Sports", "Health", "Education", "Community", "Food"];

export default async function ProfilePage({ searchParams }) {
  await requireFeatureEnabled("user-profile");
  const params = await searchParams;
  const { supabase, user } = await getAttendeeSession();
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  throwOnSupabaseError(error);
  const { data: memberships, error: membershipsError } = await supabase.rpc("get_my_organization_memberships");
  if (isMissingOrganizationMembershipFunction(membershipsError)) {
    throw new Error("Unable to determine your organization access. Apply the organization admin database migrations and refresh the Supabase API schema cache.", { cause: membershipsError });
  }
  if (membershipsError) {
    throw new Error(`Unable to load your organization access: ${membershipsError.message}`, { cause: membershipsError });
  }
  const organizationIds = [...new Set((memberships || []).map(({ organization_id }) => organization_id).filter(Boolean))];
  const { data: organizations, error: organizationsError } = organizationIds.length
    ? await supabase.from("organizations").select("id, name").in("id", organizationIds).order("name")
    : { data: [], error: null };
  throwOnSupabaseError(organizationsError);
  const hasOrganization = (organizations || []).length > 0;
  const featureFlags = await getFeatureFlagMap();
  const showOrganizerApplication = !hasOrganization
    && !["admin", "superadmin"].includes(profile?.role)
    && featureFlags["organizer-applications"];
  const adminWorkspace = hasOrganization || ["admin", "superadmin"].includes(profile?.role);
  const adminWorkspaceHref = profile?.role === "superadmin" ? "/superadmin/dashboard" : "/admin/dashboard";

  const fullName = profile?.full_name || user.email?.split("@")[0] || "KURO attendee";
  const initial = fullName.trim().charAt(0).toUpperCase() || "U";
  const profileLinks = [
    { href: "/my-tickets", label: "My tickets", icon: "ticket" },
    { href: "/favorites", label: "Saved events", icon: "heart" },
    { href: "/my-events", label: "My bookings", icon: "calendar" },
    ...(adminWorkspace
      ? [{ href: adminWorkspaceHref, label: "Admin workspace", icon: "company" }]
      : showOrganizerApplication
        ? [{ href: "/apply-organizer", label: "Apply as an organizer", icon: "company" }]
        : []),
    ...(featureFlags["event-history"] ? [{ href: "/history", label: "History", icon: "history" }] : []),
    ...(featureFlags.certificates ? [{ href: "/certificates", label: "Certificates", icon: "certificate" }] : []),
    ...(featureFlags.messaging ? [{ href: "/messages", label: "Messages", icon: "message" }] : []),
    { href: "/notifications", label: "Notifications", icon: "bell" },
    { href: "/help", label: "Help & support", icon: "help" },
    { href: "/settings#appearance-language", label: "Language & region", detail: "Manage language", icon: "globe" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-4 sm:space-y-6" data-profile-screen>
      <div className="flex items-center justify-between border-b border-[#e2e8e1] pb-3">
        <Link aria-label="Back to dashboard" className="flex size-10 items-center justify-center rounded-full text-2xl text-[#173d39] hover:bg-white" href="/dashboard">
          <span aria-hidden="true">&#8592;</span>
        </Link>
        <h1 className="text-base font-bold text-[#173d39]">Profile</h1>
        <Link aria-label="Settings" className="flex size-10 items-center justify-center rounded-full text-lg text-[#173d39] hover:bg-white" href="/settings">
          <ProfileIcon name="settings" />
        </Link>
      </div>

      {params?.saved && <StatusMessage tone="success">Your profile has been saved.</StatusMessage>}

      <section aria-label="Account profile" className="flex items-center gap-4 px-2 py-2 sm:px-4">
        <div
          aria-label={profile?.avatar_url ? `${fullName}'s profile photo` : undefined}
          className="flex size-[76px] shrink-0 items-center justify-center rounded-full bg-[#7542d8] bg-cover bg-center text-3xl font-semibold text-white shadow-sm sm:size-20"
          role="img"
          style={profile?.avatar_url ? { backgroundImage: `url("${profile.avatar_url}")` } : undefined}
        >
          {!profile?.avatar_url && initial}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-[#17201f] sm:text-xl">{fullName}</h2>
          <p className="mt-1 truncate text-sm text-[#71817b]">{user.email}</p>
          {profile?.phone && <p className="mt-1 text-sm text-[#526864]">{profile.phone}</p>}
        </div>
      </section>

      <nav aria-label="Profile links" className="overflow-hidden rounded-2xl border border-[#edf0eb] bg-white shadow-sm">
        {profileLinks.map(({ href, label, detail, icon }) => (
          <Link className="flex min-h-12 items-center gap-3 border-b border-[#edf0eb] px-4 py-3 last:border-b-0 hover:bg-[#fafbf8] sm:px-5" href={href} key={href}>
            <span className="flex size-6 shrink-0 items-center justify-center text-[#526864]">
              <ProfileIcon name={icon} />
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-[#293432]">{label}</span>
            {detail && <span className="max-w-32 truncate text-xs text-[#87938f]">{detail}</span>}
            <span aria-hidden="true" className="text-xl leading-none text-[#a2aca8]">&#8250;</span>
          </Link>
        ))}
        <SignOutButton
          className="flex min-h-12 w-full items-center justify-between rounded-none border-0 px-4 py-3 text-left text-sm font-medium text-[#293432] hover:bg-[#fafbf8] sm:px-5"
          containerClassName="w-full"
          icon={<ProfileIcon name="logout" />}
          label="Log out"
          trailingIcon={<span aria-hidden="true" className="text-xl leading-none text-[#a2aca8]">&#8250;</span>}
        />
      </nav>

      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-[#dce4dc] bg-white px-4 py-3 text-sm font-semibold text-[#245c55] shadow-sm hover:bg-[#fafbf8]">
          Edit profile details
          <span aria-hidden="true" className="transition group-open:rotate-180">&#8964;</span>
        </summary>
        <form action={saveProfile} className="mt-4 space-y-5">
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
      </details>
    </div>
  );
}

function ProfileIcon({ name }) {
  const paths = {
    ticket: <><path d="M4 8V5.8A1.8 1.8 0 0 1 5.8 4h12.4A1.8 1.8 0 0 1 20 5.8V8a2 2 0 0 0 0 4v2.2a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 14.2V12a2 2 0 0 0 0-4Z" /><path d="M12 6v1m0 3v1m0 3v1" /></>,
    heart: <path d="M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.8 4.8 0 0 1 12 6.3a4.8 4.8 0 0 1 8.8 2.5Z" />,
    calendar: <><rect height="16" rx="2" width="17" x="3.5" y="5" /><path d="M7.5 3v4m9-4v4M3.5 10h17" /></>,
    history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5m4-1v5l3 2" /></>,
    certificate: <><circle cx="12" cy="8" r="5" /><path d="m8 12-1 9 5-3 5 3-1-9" /></>,
    message: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.2 1.8c-1.1 1-1.8 1.2-1.8 3m0 3h.01" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18m0-18a14 14 0 0 0 0 18" /></>,
    company: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10 21v-4h4v4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.2 1-1.5 2.6-1.5-.6a7.7 7.7 0 0 1-1.7 1l-.2 1.6h-3l-.2-1.6a7.7 7.7 0 0 1-1.7-1l-1.5.6-1.5-2.6 1.2-1a7.2 7.2 0 0 1 0-2l-1.2-1 1.5-2.6 1.5.6a7.7 7.7 0 0 1 1.7-1L12.8 7h3l.2 1.6a7.7 7.7 0 0 1 1.7 1l1.5-.6 1.5 2.6-1.2 1a7.2 7.2 0 0 1-.1 2.4Z" transform="translate(-1 -1) scale(1.08)" /></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  };

  return (
    <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
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
