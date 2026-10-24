export default function OrganizationPicker({ organizations, selectedOrganizationId, pathname }) {
  if (organizations.length < 2) return null;

  return (
    <form action={pathname} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`organization-picker-${pathname}`}>Organization</label>
      <select
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        defaultValue={selectedOrganizationId || ""}
        id={`organization-picker-${pathname}`}
        name="organization_id"
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>{organization.name}</option>
        ))}
      </select>
      <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">
        Switch
      </button>
    </form>
  );
}
