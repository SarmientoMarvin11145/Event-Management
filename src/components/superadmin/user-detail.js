import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function Table({ headers, children }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500">{headers.map((header) => <th className="px-3 py-3" key={header}>{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(value)) : "—";
}

export default async function SuperadminUserDetail({ id }) {
  const supabase = await createSupabaseServerClient();
  const { data: users, error: usersError } = await supabase.rpc("superadmin_list_users", {
    p_limit: 1,
    p_user_ids: [id],
  });
  if (usersError) throw new Error(`Unable to load user: ${usersError.message}`, { cause: usersError });
  const user = users.find((item) => item.id === id);
  if (!user) notFound();

  const [registrationsResult, attendanceResult, certificatesResult, supportResult] = await Promise.all([
    supabase.from("registrations").select("id, status, registration_code, created_at, events(title, start_date)").eq("attendee_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("attendance_logs").select("id, check_in_time, registrations!inner(attendee_id, events(title))").eq("registrations.attendee_id", id).order("check_in_time", { ascending: false }).limit(100),
    supabase.from("certificates").select("id, certificate_type, issued_at, verification_code, events(title)").eq("user_id", id).order("issued_at", { ascending: false }).limit(100),
    supabase.from("support_requests").select("id, subject, status, priority, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  for (const [result, label] of [[registrationsResult, "registrations"], [attendanceResult, "attendance history"], [certificatesResult, "certificates"], [supportResult, "support requests"]]) {
    if (result.error) throw new Error(`Unable to load user ${label}: ${result.error.message}`, { cause: result.error });
  }

  return (
    <div className="space-y-6">
      <Link className="text-sm font-bold text-[#245c55] hover:underline" href="/superadmin/users">← All users</Link>
      <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b34d37]">User profile</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{user.full_name || "Name not set"}</h1><p className="mt-2 text-sm text-slate-600">{user.email || "No email"} · Joined {formatDate(user.created_at)}</p></header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Role", user.role], ["Account status", user.account_status], ["Registrations shown (max 100)", registrationsResult.data.length], ["Check-ins shown (max 100)", attendanceResult.data.length]].map(([label, value]) => <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={label}><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>)}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold">Contact</h2><p className="text-sm text-slate-700">Email: {user.email || "—"}</p><p className="mt-2 text-sm text-slate-700">Phone: {user.phone || "—"}</p><p className="mt-2 text-xs text-slate-500">Account access is managed from the user directory. Password reset links are handled by Supabase Auth.</p></section>
      <section className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold">Registrations</h2>{registrationsResult.data.length ? <Table headers={["Event", "Status", "Code", "Registered"]}>{registrationsResult.data.map((row) => <tr key={row.id}><td className="px-3 py-3">{row.events?.title || "Event"}</td><td className="px-3 py-3">{row.status}</td><td className="px-3 py-3 font-mono text-xs">{row.registration_code}</td><td className="px-3 py-3">{formatDate(row.created_at)}</td></tr>)}</Table> : <p className="text-sm text-slate-500">No registrations.</p>}</section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold">Attendance</h2>{attendanceResult.data.length ? <Table headers={["Event", "Check-in"]}>{attendanceResult.data.map((row) => <tr key={row.id}><td className="px-3 py-3">{row.registrations?.events?.title || "Event"}</td><td className="px-3 py-3">{formatDate(row.check_in_time)}</td></tr>)}</Table> : <p className="text-sm text-slate-500">No check-ins recorded.</p>}</section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold">Certificates</h2>{certificatesResult.data.length ? <Table headers={["Event", "Type", "Issued", "Verification"]}>{certificatesResult.data.map((row) => <tr key={row.id}><td className="px-3 py-3">{row.events?.title || "Event"}</td><td className="px-3 py-3">{row.certificate_type}</td><td className="px-3 py-3">{formatDate(row.issued_at)}</td><td className="px-3 py-3 font-mono text-xs">{row.verification_code}</td></tr>)}</Table> : <p className="text-sm text-slate-500">No certificates.</p>}</section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold">Support history</h2>{supportResult.data.length ? <Table headers={["Subject", "Status", "Priority", "Created"]}>{supportResult.data.map((row) => <tr key={row.id}><td className="px-3 py-3">{row.subject}</td><td className="px-3 py-3">{row.status}</td><td className="px-3 py-3">{row.priority}</td><td className="px-3 py-3">{formatDate(row.created_at)}</td></tr>)}</Table> : <p className="text-sm text-slate-500">No support requests.</p>}</section>
      </section>
    </div>
  );
}
