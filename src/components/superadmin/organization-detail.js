import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { updateOrganization } from "@/app/(superadmin)/superadmin/actions";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export default async function SuperadminOrganizationDetail({ id }) {
  const supabase = await createSupabaseServerClient();
  const { data: organization, error } = await supabase
    .from("organizations")
    .select("id, name, slug, sector, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load organization: ${error.message}`, { cause: error });
  if (!organization) notFound();

  const [{ data: events, error: eventsError }, { data: owners, error: ownerError }] = await Promise.all([
    supabase.from("events").select("id, title, status, moderation_status, start_date, venue_name, city, registrations(count)").eq("organization_id", organization.id).order("start_date", { ascending: false }).limit(100),
    supabase.from("superadmin_organization_owners").select("user_id").eq("organization_id", organization.id).maybeSingle(),
  ]);
  if (eventsError) throw new Error(`Unable to load organization events: ${eventsError.message}`, { cause: eventsError });
  if (ownerError) throw new Error(`Unable to load organization owner: ${ownerError.message}`, { cause: ownerError });
  const { data: users, error: usersError } = owners
    ? await supabase.rpc("superadmin_list_users", { p_limit: 1, p_user_ids: [owners.user_id] })
    : { data: [], error: null };
  if (usersError) throw new Error(`Unable to load organization owner profile: ${usersError.message}`, { cause: usersError });
  const owner = users.find((user) => user.id === owners?.user_id);

  return (
    <div className="space-y-6">
      <Link className="text-sm font-bold text-[#245c55] hover:underline" href="/superadmin/organizations">← All organizations</Link>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b34d37]">Organization details</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{organization.name}</h1>
        <p className="mt-2 text-sm text-slate-600">{organization.slug} · Created {formatDate(organization.created_at)}</p>
      </header>
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold">Overview</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Type</dt><dd className="mt-1 font-semibold">{organization.sector}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Owner</dt><dd className="mt-1 font-semibold">{owner?.full_name || "Not assigned"}{owner?.email && <span className="mt-1 block text-xs font-normal text-slate-500">{owner.email}</span>}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Status</dt><dd className="mt-1 font-semibold">{organization.status}</dd></div>
          </dl>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold">Update status</h2>
          <form action={updateOrganization} className="mt-4 grid gap-4">
            <input name="id" type="hidden" value={organization.id} />
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Organization status<select className="rounded-md border border-slate-300 px-3 py-2.5 font-normal" defaultValue={organization.status} name="status"><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select></label>
            <button className="rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#245c55]" type="submit">Save changes</button>
          </form>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold">Events ({events.length})</h2>
        {events.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="px-3 py-3">Event</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Registrations</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Moderation</th></tr></thead><tbody className="divide-y">{events.map((event) => <tr key={event.id}><td className="px-3 py-3 font-semibold">{event.title}<span className="mt-1 block text-xs font-normal text-slate-500">{[event.venue_name, event.city].filter(Boolean).join(", ") || "No venue"}</span></td><td className="px-3 py-3">{formatDate(event.start_date)}</td><td className="px-3 py-3">{event.registrations?.[0]?.count ?? 0}</td><td className="px-3 py-3">{event.status}</td><td className="px-3 py-3">{event.moderation_status}</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-500">No events for this organization.</p>}
      </section>
    </div>
  );
}
