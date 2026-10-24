import OrganizationPicker from "@/components/admin/organization-picker";
import WorkspacePage from "@/components/workspace-page";
import { saveOrganizationSettings } from "@/app/(admin)/admin/actions";
import { requireFeatureEnabled } from "@/lib/features";
import { getOrganizationAdminContext } from "@/lib/admin-data";

function Field({ children, label, hint }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass = "rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#245c55] focus:ring-2 focus:ring-[#245c55]/15";

export default async function AdminSettingsPage({ searchParams }) {
  await requireFeatureEnabled("admin-settings");
  const params = await searchParams;
  const context = await getOrganizationAdminContext(params?.organization_id || null);
  if (!context.organization) {
    return <WorkspacePage description="Manage real organization settings and contact details." title="Settings" />;
  }
  const organization = context.organization;

  return (
    <WorkspacePage description={`Organization profile, branding, and defaults for ${organization.name}.`} title="Settings">
      <div className="mb-5">
        <OrganizationPicker organizations={context.organizations} pathname="/admin/settings" selectedOrganizationId={organization.id} />
      </div>
      {context.canManageOrganization ? (
        <form action={saveOrganizationSettings} className="space-y-5">
          <input name="organization_id" type="hidden" value={organization.id} />
          <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
            <div className="sm:col-span-2">
              <h2 className="font-semibold text-slate-900">Organization profile</h2>
              <p className="mt-1 text-sm text-slate-500">These details are stored on your organization account.</p>
            </div>
            <Field label="Organization name">
              <input className={inputClass} defaultValue={organization.name || ""} maxLength={120} name="name" required />
            </Field>
            <Field hint="Use an HTTPS URL. Image uploads are not configured." label="Logo URL">
              <input className={inputClass} defaultValue={organization.logo_url || ""} maxLength={1000} name="logo_url" type="url" />
            </Field>
            <Field label="Description">
              <textarea className={inputClass} defaultValue={organization.description || ""} maxLength={5000} name="description" rows={4} />
            </Field>
            <Field label="Address">
              <textarea className={inputClass} defaultValue={organization.address || ""} maxLength={1000} name="address" rows={4} />
            </Field>
          </section>
          <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
            <div className="sm:col-span-2">
              <h2 className="font-semibold text-slate-900">Contact and regional defaults</h2>
            </div>
            <Field label="Contact email">
              <input className={inputClass} defaultValue={organization.contact_email || ""} maxLength={254} name="contact_email" type="email" />
            </Field>
            <Field label="Contact phone">
              <input className={inputClass} defaultValue={organization.contact_phone || ""} maxLength={40} name="contact_phone" type="tel" />
            </Field>
            <Field hint="Must use HTTPS." label="Website">
              <input className={inputClass} defaultValue={organization.website || ""} maxLength={500} name="website" type="url" />
            </Field>
            <Field hint="IANA timezone, for example Asia/Manila." label="Timezone">
              <input className={inputClass} defaultValue={organization.timezone || "Asia/Manila"} maxLength={100} name="timezone" required />
            </Field>
            <Field label="Default language">
              <select className={inputClass} defaultValue={organization.default_language || "en"} name="default_language">
                <option value="en">English</option>
                <option value="fil">Filipino</option>
                <option value="ceb">Cebuano</option>
              </select>
            </Field>
          </section>
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
            <h2 className="font-semibold">Integrations not connected</h2>
            <p className="mt-1">Payments, custom email/SMS delivery, image uploads, PDF generation, and external analytics are not configured. No payment or delivery statuses are simulated.</p>
          </section>
          <button className="rounded-md bg-[#173d39] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#245c55]" type="submit">Save organization settings</button>
        </form>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
          <h2 className="font-semibold text-slate-900">Organization settings</h2>
          <p className="mt-1">Only organization administrators can update these settings. Contact an administrator if organization details need changes.</p>
        </section>
      )}
    </WorkspacePage>
  );
}
