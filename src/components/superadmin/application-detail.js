import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { reviewOrganizerApplication } from "@/app/(superadmin)/superadmin/actions";

export default async function SuperadminApplicationDetail({ id }) {
  const supabase = await createSupabaseServerClient();
  const { data: application, error } = await supabase
    .from("organizer_applications")
    .select("id, user_id, organization_name, organization_type, details, status, review_notes, created_at, reviewed_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load application: ${error.message}`, { cause: error });
  if (!application) notFound();
  const { data: users, error: usersError } = await supabase.rpc("superadmin_list_users", {
    p_limit: 1,
    p_user_ids: [application.user_id],
  });
  if (usersError) throw new Error(`Unable to load applicant profile: ${usersError.message}`, { cause: usersError });
  const applicant = users.find((user) => user.id === application.user_id);

  return (
    <div className="space-y-6">
      <Link className="text-sm font-bold text-[#245c55] hover:underline" href="/superadmin/applications">← All applications</Link>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b34d37]">Organizer application</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{application.organization_name}</h1>
        <p className="mt-2 text-sm text-slate-600">Submitted {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(application.created_at))} · {application.status.replaceAll("_", " ")}</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold">Applicant and organization</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Applicant</dt><dd className="mt-1 font-semibold">{applicant?.full_name || "Name not provided"}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Email</dt><dd className="mt-1 font-semibold">{applicant?.email || "Unavailable"}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Phone</dt><dd className="mt-1 font-semibold">{applicant?.phone || "Not provided"}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Organization type</dt><dd className="mt-1 font-semibold">{application.organization_type}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Applicant ID</dt><dd className="mt-1 font-mono text-xs">{application.user_id}</dd></div>
          </dl>
          <div className="mt-5"><h3 className="text-xs font-bold uppercase text-slate-500">Application details</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{application.details || "No additional details submitted."}</p></div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold">Review decision</h2>
          {["approved", "rejected"].includes(application.status) ? (
            <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">This application has been finalized. {application.review_notes || ""}</p>
          ) : (
            <form action={reviewOrganizerApplication} className="mt-4 grid gap-4">
              <input name="application_id" type="hidden" value={application.id} />
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Decision<select className="rounded-md border border-slate-300 px-3 py-2.5 font-normal" defaultValue={application.status === "pending" ? "under_review" : application.status} name="decision"><option value="under_review">Under review</option><option value="needs_info">Request more information</option><option value="approved">Approve and create organization</option><option value="rejected">Reject</option></select></label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Review note / rejection reason<textarea className="min-h-32 rounded-md border border-slate-300 px-3 py-2.5 font-normal" defaultValue={application.review_notes || ""} maxLength={2000} name="note" /></label>
              <button className="rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#245c55]" type="submit">Save review</button>
            </form>
          )}
          <p className="mt-4 text-xs leading-5 text-slate-500">Approval creates the organization, assigns the applicant as owner, and promotes them to admin. Email is not sent because no email delivery workflow is configured.</p>
        </section>
      </div>
    </div>
  );
}
