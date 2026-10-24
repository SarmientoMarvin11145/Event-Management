import Link from "next/link";
import { Suspense } from "react";

const ADMIN_LINKS = [
  ["/profile", "My profile"],
  ["/my-tickets", "My tickets"],
  ["/certificates", "Certificates"],
  ["/settings", "Settings"],
];

import { connection } from "next/server";
import AnalyticsTrends from "@/components/superadmin/analytics-trends";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  completeSuperadminTask,
  createSuperadminTask,
  moderateEvent,
  replyToSupportRequest,
  reviewOrganizerApplication,
  saveContentItem,
  savePlatformSettings,
  saveSuperadminProfile,
  sendInAppBroadcast,
  setFeatureFlag,
  updateOrganization,
  updateSupportRequest,
  updateUserAccess,
} from "@/app/(superadmin)/superadmin/actions";

const definitions = {
  dashboard: ["Platform overview", "A live snapshot of the data currently available to KURO."],
  applications: ["Organizer applications", "Review requests to create and manage an organization."],
  organizations: ["Organizations", "Review tenant status and ownership."],
  users: ["All users", "Review accounts and manage user/admin access."],
  events: ["All events", "Review event listings and moderate content."],
  revenue: ["Payment activity", "Review PayMongo test-mode event and organization-plan payments."],
  analytics: ["Platform analytics", "Aggregate signup, event, registration, and attendance data."],
  notifications: ["Notifications", "Send in-app announcements and review broadcast history."],
  emails: ["Email delivery", "Transactional email delivery is not configured in this preview."],
  content: ["Public content", "Draft and publish announcements, FAQ entries, and blog content."],
  features: ["Feature flags", "Manage global feature availability. Organization overrides are not enabled yet."],
  system: ["System health", "Live checks use this application's database connection; infrastructure telemetry is not connected."],
  logs: ["Audit logs", "Review superadmin actions recorded by the platform."],
  security: ["Security", "Review account access status. Authentication threat telemetry is managed by Supabase."],
  integrations: ["Integrations", "See which provider credentials are configured without exposing any secret values."],
  settings: ["Platform settings", "Manage the platform defaults saved by this application."],
  profile: ["My profile", "Manage your personal superadmin profile."],
  support: ["Support requests", "Review attendee requests and respond from the platform."],
  tasks: ["Tasks & reminders", "Keep personal follow-up items in one place."],
  search: ["Platform search", "Search across the organizations, accounts, and events available to your role."],
};

function describeSupabaseError(error) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code && `code ${error.code}`,
  ].filter(Boolean).join(" — ") || "Supabase returned an error without details";
}

function failOnError(result, label) {
  if (result.error) throw new Error(`${label}: ${describeSupabaseError(result.error)}`, { cause: result.error });
  return result;
}

async function query(supabase, request, label) {
  return failOnError(await request, label).data || [];
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(date);
}

function PageHeading({ title, description, action }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b34d37]">KURO platform control</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Panel({ title, description, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-base font-bold text-slate-900">{title}</h2>}
          {description && <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function Metric({ label, value, detail, accent = "bg-[#173d39]" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <span aria-hidden="true" className={`block size-2.5 rounded-full ${accent}`} />
      <p className="mt-4 text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      {detail && <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>}
    </div>
  );
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-rose-50 text-rose-800",
    blue: "bg-sky-50 text-sky-800",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone] || tones.neutral}`}>{String(children || "unknown").replaceAll("_", " ")}</span>;
}

function Table({ headers, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">{headers.map((header) => <th className="px-3 py-3 font-bold" key={header}>{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

function Cell({ children, className = "" }) {
  return <td className={`px-3 py-3 align-top text-slate-700 ${className}`}>{children}</td>;
}

function Empty({ children = "No records yet." }) {
  return <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

function SetupNotice() {
  return (
    <Panel title="Apply the superadmin console migration">
      <p className="text-sm leading-6 text-slate-600">
        This workspace requires <code className="rounded bg-slate-100 px-1.5 py-0.5">supabase/migrations/20261016130000_create_superadmin_console.sql</code>.
        Apply it after the existing profile, roles, public events, policy-consent, and attendee-portal migrations, then refresh the Supabase API schema cache.
      </p>
    </Panel>
  );
}

function Notice({ children, tone = "info" }) {
  const classes = tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-sky-950";
  return <p className={`rounded-lg border px-4 py-3 text-sm leading-6 ${classes}`}>{children}</p>;
}

function TextInput({ name, label, defaultValue = "", type = "text", required = false, maxLength }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      <input className="rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#245c55] focus:ring-2 focus:ring-[#245c55]/15" defaultValue={defaultValue ?? ""} maxLength={maxLength} name={name} required={required} type={type} />
    </label>
  );
}

function SelectInput({ name, label, options, defaultValue }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      <select className="rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#245c55] focus:ring-2 focus:ring-[#245c55]/15" defaultValue={defaultValue} name={name}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
}

function ActionButton({ children = "Save changes" }) {
  return <button className="inline-flex items-center justify-center rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#245c55] focus:outline-none focus:ring-2 focus:ring-[#245c55] focus:ring-offset-2" type="submit">{children}</button>;
}

function MissingMigration(error) {
  return ["PGRST205", "PGRST204", "42P01", "42703"].includes(error?.code) ||
    ["PGRST205", "PGRST204", "42P01", "42703"].includes(error?.cause?.code);
}

function Overview({ stats, organizations, events, applications, support, tasks }) {
  const actionCount = applications.length + support.length + (stats.flaggedEvents || 0);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Organizations" value={stats.organizations} detail="All organization records" />
        <Metric label="User accounts" value={stats.users} detail="From profiles linked to Supabase Auth" accent="bg-sky-600" />
        <Metric label="Events" value={stats.events} detail="Draft, published, and cancelled" accent="bg-violet-600" />
        <Metric label="Registrations" value={stats.registrations} detail="Attendee registrations" accent="bg-amber-500" />
        <Metric label="Check-ins" value={stats.checkins} detail="Recorded attendance logs" accent="bg-emerald-600" />
        <Metric label="Pending applications" value={stats.pendingApplications} detail="Awaiting a platform review" accent="bg-orange-500" />
        <Metric label="Open support" value={stats.openSupport} detail="Requests needing follow-up" accent="bg-rose-500" />
        <Metric label="New accounts (7d)" value={stats.newUsers} detail="Based on profile creation date" accent="bg-cyan-600" />
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Action required" description="Open the relevant queue to review each item.">
          {actionCount || stats.flaggedEvents === null ? (
            <ul className="divide-y divide-slate-100">
              <li className="flex items-center justify-between gap-3 py-3 text-sm"><span>{stats.pendingApplications} pending organizer applications</span><Link className="font-bold text-[#245c55] hover:underline" href="/superadmin/applications">Review</Link></li>
              <li className="flex items-center justify-between gap-3 py-3 text-sm"><span>{stats.openSupport} open support requests</span><Link className="font-bold text-[#245c55] hover:underline" href="/superadmin/support">Respond</Link></li>
              <li className="flex items-center justify-between gap-3 py-3 text-sm"><span>{stats.flaggedEvents === null ? "Flagged-event count unavailable" : `${stats.flaggedEvents} flagged events`}</span><Link className="font-bold text-[#245c55] hover:underline" href="/superadmin/events">Moderate</Link></li>
            </ul>
          ) : <Empty>No pending applications, support requests, or flagged events.</Empty>}
          {stats.flaggedEvents === null && <Notice tone="warning">The event moderation count could not be loaded. Apply the superadmin console migration and refresh the Supabase API schema cache. {stats.flaggedEventsError}</Notice>}
        </Panel>
        <Panel title="Database connection" description="Live query against the KURO Supabase project.">
          <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-4">
            <span aria-hidden="true" className="size-3 rounded-full bg-emerald-500" />
            <div><p className="font-bold text-emerald-950">Connected</p><p className="mt-1 text-xs text-emerald-800">Counts loaded successfully for this request.</p></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Uptime, query latency, storage usage, background jobs, and backup status are not exposed by the current application.</p>
        </Panel>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Panel title="Recently added organizations">
          {organizations.length ? <Table headers={["Organization", "Type", "Status", "Created"]}>{organizations.map((org) => <tr key={org.id}><Cell className="font-semibold">{org.name}</Cell><Cell>{org.sector}</Cell><Cell><Badge tone={org.status === "active" ? "green" : "amber"}>{org.status}</Badge></Cell><Cell>{formatDate(org.created_at)}</Cell></tr>)}</Table> : <Empty>No organizations have been created.</Empty>}
        </Panel>
        <Panel title="Recent events">
          {events.length ? <Table headers={["Event", "Organization", "Date", "Status"]}>{events.map((event) => <tr key={event.id}><Cell className="font-semibold">{event.title}</Cell><Cell>{event.organizations?.name || "—"}</Cell><Cell>{formatDate(event.start_date)}</Cell><Cell><Badge tone={event.status === "published" ? "green" : "neutral"}>{event.status}</Badge></Cell></tr>)}</Table> : <Empty>No events have been created.</Empty>}
        </Panel>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <TaskPanel tasks={tasks} />
        <Panel title="Platform activity preview" description="Latest organizer requests and support messages.">
          <ul className="space-y-3">
            {applications.slice(0, 3).map((item) => <li className="flex justify-between gap-3 text-sm" key={item.id}><span>{item.organization_name}</span><Badge tone="amber">{item.status}</Badge></li>)}
            {support.slice(0, 3).map((item) => <li className="flex justify-between gap-3 text-sm" key={item.id}><span className="truncate">{item.subject}</span><Badge tone={item.priority === "urgent" ? "red" : "neutral"}>{item.priority}</Badge></li>)}
            {!applications.length && !support.length && <li className="text-sm text-slate-500">No recent application or support activity.</li>}
          </ul>
        </Panel>
      </div>
      <div className="mt-6"><Notice tone="warning">Email/SMS delivery, real-time event streams, and infrastructure metrics are intentionally not estimated. Connect the corresponding provider and data workflow before reporting those values.</Notice></div>
    </>
  );
}

function TaskPanel({ tasks }) {
  return (
    <Panel title="My tasks" description="Private reminders for this superadmin account." >
      <form action={createSuperadminTask} className="mb-4 flex flex-col gap-3 sm:flex-row">
        <TextInput label="New task" name="title" required maxLength={240} />
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Due date<input className="rounded-md border border-slate-300 px-3 py-2.5 font-normal" name="due_at" type="datetime-local" /></label>
        <div className="self-end"><ActionButton>Add task</ActionButton></div>
      </form>
      {tasks.length ? <ul className="divide-y divide-slate-100">{tasks.map((task) => <li className="flex items-start justify-between gap-4 py-3" key={task.id}><div><p className={`text-sm font-semibold ${task.completed_at ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.due_at ? `Due ${formatDate(task.due_at)}` : "No due date"}</p></div><form action={completeSuperadminTask}><input name="task_id" type="hidden" value={task.id} /><input name="completed" type="hidden" value={task.completed_at ? "false" : "true"} /><button className="text-xs font-bold text-[#245c55] hover:underline" type="submit">{task.completed_at ? "Reopen" : "Complete"}</button></form></li>)}</ul> : <Empty>No tasks yet. Add a reminder above.</Empty>}
    </Panel>
  );
}

function OrganizationsPage({ rows }) {
  return (
    <Panel title="Organization directory" description="Organization status is stored in KURO.">
      {rows.length ? <Table headers={["Organization", "Owner", "Type", "Status", "Created", "Save"]}>
        {rows.map((org) => <tr key={org.id}>
          <Cell className="font-semibold"><Link className="text-[#245c55] hover:underline" href={`/superadmin/organizations/${org.id}`}>{org.name}</Link><span className="mt-1 block text-xs font-normal text-slate-500">{org.slug}</span></Cell>
          <Cell>{org.ownerName || "Owner not assigned"}<span className="mt-1 block text-xs text-slate-500">{org.ownerEmail || ""}</span></Cell>
          <Cell>{org.sector}</Cell>
          <Cell>
            <form action={updateOrganization} className="flex flex-wrap items-center gap-2">
              <input name="id" type="hidden" value={org.id} />
              <select aria-label={`Status for ${org.name}`} className="rounded border border-slate-300 px-2 py-1.5" defaultValue={org.status} name="status">
                <option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option>
              </select>
              <ActionButton>Save</ActionButton>
            </form>
          </Cell>
          <Cell>{formatDate(org.created_at)}</Cell>
        </tr>)}
      </Table> : <Empty>No organizations have been created.</Empty>}
    </Panel>
  );
}

function ApplicationsPage({ rows, userLookup }) {
  const statusOptions = [["under_review", "Under review"], ["needs_info", "Needs information"], ["approved", "Approve and create organization"], ["rejected", "Reject"]];
  return (
    <Panel title="Organizer applications" description="Approval creates an organization, promotes the applicant to admin, and adds an in-app notification. Email delivery is not configured.">
      {rows.length ? <Table headers={["Organization", "Applicant", "Type", "Status", "Submitted", "Review"]}>
        {rows.map((item) => <tr key={item.id}>
          <Cell className="font-semibold"><Link className="text-[#245c55] hover:underline" href={`/superadmin/applications/${item.id}`}>{item.organization_name}</Link><span className="mt-1 block text-xs font-normal text-slate-500">{item.details || ""}</span></Cell>
          <Cell>{userLookup.get(item.user_id)?.full_name || "—"}<span className="mt-1 block text-xs text-slate-500">{userLookup.get(item.user_id)?.email || ""}</span></Cell>
          <Cell>{item.organization_type}</Cell>
          <Cell><Badge tone={item.status === "approved" ? "green" : item.status === "rejected" ? "red" : "amber"}>{item.status}</Badge></Cell>
          <Cell>{formatDate(item.created_at)}</Cell>
          <Cell>{["approved", "rejected"].includes(item.status) ? <span className="text-xs text-slate-500">Finalized {formatDate(item.reviewed_at)}</span> : <form action={reviewOrganizerApplication} className="grid min-w-52 gap-2"><input name="application_id" type="hidden" value={item.id} /><select aria-label={`Decision for ${item.organization_name}`} className="rounded border border-slate-300 px-2 py-2" defaultValue={item.status === "pending" ? "under_review" : item.status} name="decision">{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label="Review note" className="rounded border border-slate-300 px-2 py-2" defaultValue={item.review_notes || ""} name="note" placeholder="Optional note / rejection reason" /><ActionButton>Save review</ActionButton></form>}</Cell>
        </tr>)}
      </Table> : <Empty>No organizer applications have been submitted.</Empty>}
    </Panel>
  );
}

function UsersPage({ rows }) {
  return (
    <Panel title="User directory" description="Email is retrieved through a role-checked server function. Existing superadmin accounts cannot be changed from this screen.">
      {rows.length ? <Table headers={["Name", "Email", "Phone", "Role", "Status", "Joined", "Access"]}>
        {rows.map((item) => <tr key={item.id}>
          <Cell className="font-semibold"><Link className="text-[#245c55] hover:underline" href={`/superadmin/users/${item.id}`}>{item.full_name || "Name not set"}</Link></Cell><Cell>{item.email || "—"}</Cell><Cell>{item.phone || "—"}</Cell><Cell><Badge>{item.role}</Badge></Cell><Cell><Badge tone={item.account_status === "active" ? "green" : "red"}>{item.account_status}</Badge></Cell><Cell>{formatDate(item.created_at)}</Cell>
          <Cell>{item.role === "superadmin" ? <span className="text-xs text-slate-500">Protected</span> : <form action={updateUserAccess} className="grid min-w-44 gap-2"><input name="user_id" type="hidden" value={item.id} /><select aria-label={`Role for ${item.email}`} className="rounded border border-slate-300 px-2 py-1.5" defaultValue={item.role} name="role"><option value="user">User</option><option value="admin">Admin</option></select><select aria-label={`Account status for ${item.email}`} className="rounded border border-slate-300 px-2 py-1.5" defaultValue={item.account_status} name="account_status"><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select><ActionButton>Save access</ActionButton></form>}</Cell>
        </tr>)}
      </Table> : <Empty>No user profiles found.</Empty>}
    </Panel>
  );
}

function SecurityPage({ rows }) {
  const active = rows.filter((row) => row.account_status === "active").length;
  const suspended = rows.filter((row) => row.account_status === "suspended").length;
  const banned = rows.filter((row) => row.account_status === "banned").length;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3"><Metric label="Active accounts" value={active} accent="bg-emerald-600" /><Metric label="Suspended" value={suspended} accent="bg-amber-500" /><Metric label="Banned" value={banned} accent="bg-rose-600" /></div>
      <Panel title="Account access status" description="Changing an account to suspended or banned blocks protected app pages and server actions. Auth provider-level lockout, failed-login IP telemetry, and session revocation are not configured here.">
        {rows.length ? <Table headers={["Name", "Email", "Role", "Status", "Created"]}>{rows.slice(0, 100).map((row) => <tr key={row.id}><Cell className="font-semibold">{row.full_name || "Name not set"}</Cell><Cell>{row.email || "—"}</Cell><Cell><Badge>{row.role}</Badge></Cell><Cell><Badge tone={row.account_status === "active" ? "green" : "red"}>{row.account_status}</Badge></Cell><Cell>{formatDate(row.created_at)}</Cell></tr>)}</Table> : <Empty>No accounts found.</Empty>}
      </Panel>
      <Notice tone="warning">Impersonation, forced logout, blocked IP lists, API key rotation, and 2FA enforcement are deliberately not exposed: the current project has no secure provider-side control plane for them.</Notice>
    </div>
  );
}

function EventsPage({ rows }) {
  const eventStatuses = [["draft", "Draft"], ["published", "Published"], ["cancelled", "Cancelled"]];
  const moderationStatuses = [["normal", "Normal"], ["flagged", "Flagged"], ["under_review", "Under review"], ["removed", "Removed"]];
  return (
    <Panel title="Event moderation" description="Review all event records and change publishing or moderation state. Removing an event from public listings does not delete its data.">
      {rows.length ? <Table headers={["Event", "Organization", "Date", "Registrations", "Status", "Moderation"]}>
        {rows.map((event) => <tr key={event.id}>
          <Cell className="font-semibold">{event.title}<span className="mt-1 block text-xs font-normal text-slate-500">{event.city || event.venue_name || "No venue"}</span></Cell>
          <Cell>{event.organizations?.name || "—"}</Cell><Cell>{formatDate(event.start_date)}</Cell>
          <Cell>{event.registrations?.[0]?.count ?? 0}</Cell>
          <Cell colSpan={2}>
            <form action={moderateEvent} className="grid min-w-52 gap-2">
              <input name="event_id" type="hidden" value={event.id} />
              <select aria-label={`Publishing status for ${event.title}`} className="rounded border border-slate-300 px-2 py-1.5" defaultValue={event.status} name="status">{eventStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select aria-label={`Moderation status for ${event.title}`} className="rounded border border-slate-300 px-2 py-1.5" defaultValue={event.moderation_status} name="moderation_status">{moderationStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <input aria-label="Moderation reason" className="rounded border border-slate-300 px-2 py-1.5" defaultValue={event.moderation_reason || ""} name="reason" placeholder="Reason (optional)" />
              <ActionButton>Save</ActionButton>
            </form>
          </Cell>
        </tr>)}
      </Table> : <Empty>No event records found.</Empty>}
    </Panel>
  );
}

function BroadcastsPage({ rows }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Panel title="Create in-app broadcast" description="Delivers an in-app notification immediately to active accounts. Email, SMS, and push delivery are unavailable.">
        <form action={sendInAppBroadcast} className="grid gap-4">
          <TextInput label="Title" name="title" maxLength={160} required />
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Message<textarea className="min-h-28 rounded-md border border-slate-300 px-3 py-2.5 font-normal" maxLength={5000} name="message" required /></label>
          <SelectInput label="Target" name="target_role" defaultValue="" options={[["", "All active accounts"], ["user", "Attendees"], ["admin", "Organization admins"], ["superadmin", "Superadmins"]]} />
          <TextInput label="Optional in-app link (local path)" name="link" maxLength={500} />
          <ActionButton>Send in-app announcement</ActionButton>
        </form>
      </Panel>
      <Panel title="Broadcast history">
        {rows.length ? <Table headers={["Title", "Target", "Recipients", "Sent"]}>{rows.map((item) => <tr key={item.id}><Cell className="font-semibold">{item.title}<span className="mt-1 block text-xs font-normal text-slate-500">{item.message}</span></Cell><Cell>{item.target_role || "All active accounts"}</Cell><Cell>{item.recipient_count}</Cell><Cell>{formatDate(item.created_at)}</Cell></tr>)}</Table> : <Empty>No broadcasts sent yet.</Empty>}
      </Panel>
    </div>
  );
}

function SupportPage({ rows, messagesByRequest }) {
  const statusOptions = [["open", "Open"], ["in_progress", "In progress"], ["resolved", "Resolved"], ["closed", "Closed"]];
  const priorityOptions = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["urgent", "Urgent"]];
  return (
    <Panel title="Support inbox" description="Replies are saved to the support thread; the user sees them in their account. No email or SMS notification is sent.">
      {rows.length ? <div className="space-y-4">{rows.map((item) => <article className="rounded-lg border border-slate-200 p-4" key={item.id}>
        <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-bold">{item.subject}</h2><p className="mt-1 text-xs text-slate-500">{item.requester?.full_name || item.profiles?.full_name || "Account"} · {formatDate(item.created_at)}</p></div><Badge tone={item.priority === "urgent" ? "red" : "neutral"}>{item.priority}</Badge></div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.message}</p>
        {(messagesByRequest.get(item.id) || []).map((reply) => <div className="mt-3 rounded-md bg-slate-50 p-3" key={reply.id}><p className="text-xs font-bold text-slate-600">{reply.author?.full_name || reply.profiles?.full_name || "Platform team"} · {formatDate(reply.created_at)}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{reply.message}</p></div>)}
        <form action={updateSupportRequest} className="mt-4 flex flex-wrap items-end gap-3"><input name="request_id" type="hidden" value={item.id} /><SelectInput label="Status" name="status" defaultValue={item.status} options={statusOptions} /><SelectInput label="Priority" name="priority" defaultValue={item.priority} options={priorityOptions} /><ActionButton>Update ticket</ActionButton></form>
        <form action={replyToSupportRequest} className="mt-4 flex flex-col gap-2 sm:flex-row"><input name="request_id" type="hidden" value={item.id} /><label className="sr-only" htmlFor={`reply-${item.id}`}>Reply</label><textarea className="min-h-12 flex-1 rounded border border-slate-300 px-3 py-2 text-sm" id={`reply-${item.id}`} maxLength={5000} name="message" placeholder="Write an in-app reply..." required /><ActionButton>Reply</ActionButton></form>
      </article>)}</div> : <Empty>No support requests have been submitted.</Empty>}
    </Panel>
  );
}

function FeaturesPage({ rows }) {
  const byKey = new Map(rows.map((row) => [row.flag_key, row]));
  const groups = [
    ["Shared features (admin + user)", ["event-discovery", "event-registration", "notifications", "messaging", "support", "certificates", "reviews"]],
    ["Admin workspace", ["admin-overview", "admin-events", "admin-attendees", "admin-staff", "admin-venues", "admin-reports", "admin-settings"]],
    ["User workspace", ["user-dashboard", "my-tickets", "my-events", "event-history", "favorites", "organizer-applications", "user-profile", "user-settings"]],
    ["Preview / optional capabilities", ["ai-chatbot", "seating-plans", "booth-management", "facial-check-in", "payment-gateway", "offline-mode", "advanced-analytics"]],
  ];
  return (
    <div className="space-y-5">
      <Panel title="Global feature availability" description="Turning a flag off hides it from admin and user navigation and blocks direct page and action access. Turning it on restores it for both workspaces.">
        <p className="text-sm leading-6 text-slate-600">Shared flags affect both workspaces. Admin and User groups control each workspace. Preview flags stay off until their workflow is connected.</p>
      </Panel>
      {groups.map(([title, keys]) => (
        <Panel key={title} title={title}>
          <Table headers={["Feature", "Description", "Status", "Change"]}>
            {keys.map((key) => {
              const flag = byKey.get(key);
              if (!flag) return null;
              return <tr key={flag.flag_key}><Cell className="font-semibold">{flag.label}<span className="mt-1 block font-mono text-xs font-normal text-slate-500">{flag.flag_key}</span></Cell><Cell>{flag.description}</Cell><Cell><Badge tone={flag.enabled ? "green" : "neutral"}>{flag.enabled ? "enabled" : "disabled"}</Badge></Cell><Cell><form action={setFeatureFlag}><input name="flag_key" type="hidden" value={flag.flag_key} /><input name="enabled" type="hidden" value={flag.enabled ? "false" : "true"} /><ActionButton>{flag.enabled ? "Disable" : "Enable"}</ActionButton></form></Cell></tr>;
            })}
          </Table>
        </Panel>
      ))}
    </div>
  );
}

function ContentPage({ rows }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <Panel title="Create or update content" description="Saving an existing slug updates that item; published items are stored but are not automatically rendered on the public site.">
        <form action={saveContentItem} className="grid gap-4">
          <SelectInput label="Content type" name="content_type" defaultValue="announcement" options={[["announcement", "Announcement"], ["faq", "FAQ"], ["blog", "Blog post"]]} />
          <TextInput label="Title" name="title" maxLength={200} required />
          <TextInput label="Slug" name="slug" maxLength={200} required />
          <SelectInput label="Status" name="status" defaultValue="draft" options={[["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]]} />
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Content<textarea className="min-h-48 rounded-md border border-slate-300 px-3 py-2.5 font-normal" maxLength={20000} name="body" required /></label>
          <ActionButton>Save content</ActionButton>
        </form>
      </Panel>
      <Panel title="Content records">
        {rows.length ? <Table headers={["Title", "Type", "Slug", "Status", "Updated"]}>{rows.map((item) => <tr key={item.id}><Cell className="font-semibold">{item.title}</Cell><Cell>{item.content_type}</Cell><Cell><code>{item.slug}</code></Cell><Cell><Badge tone={item.status === "published" ? "green" : "neutral"}>{item.status}</Badge></Cell><Cell>{formatDate(item.updated_at)}</Cell></tr>)}</Table> : <Empty>No content has been created.</Empty>}
      </Panel>
    </div>
  );
}

function SettingsPage({ rows }) {
  const values = new Map(rows.map((row) => [row.setting_key, row.setting_value]));
  const value = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  return (
    <Panel title="General platform defaults" description="These settings are persisted in the database. Maintenance mode is informational until a maintenance gate is wired into public routes.">
      <form action={savePlatformSettings} className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Platform name" name="platform_name" defaultValue={value("platform_name", "KURO")} maxLength={100} required />
        <TextInput label="Support email" name="support_email" defaultValue={value("support_email", "")} maxLength={254} type="email" />
        <TextInput label="Timezone" name="timezone" defaultValue={value("timezone", "Asia/Manila")} maxLength={100} required />
        <SelectInput label="Default language" name="default_language" defaultValue={value("default_language", "en")} options={[["en", "English"], ["fil", "Filipino"], ["ceb", "Cebuano"]]} />
        <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm font-semibold"><input defaultChecked={value("maintenance_mode", false) === true} name="maintenance_mode" type="checkbox" /> Maintenance mode setting</label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">Maintenance message<textarea className="min-h-20 rounded-md border border-slate-300 px-3 py-2.5 font-normal" defaultValue={value("maintenance_message", "")} maxLength={500} name="maintenance_message" /></label>
        <div><ActionButton>Save platform settings</ActionButton></div>
      </form>
      <p className="mt-4 text-xs leading-5 text-slate-500">Social login, verification policy, domain records, legal URLs, and scheduled maintenance are still controlled in the corresponding provider or deployment configuration.</p>
    </Panel>
  );
}

function ProfilePage({ profile, email, saved }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.6fr)]">
      <Panel title="Personal details">
        {saved && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Profile saved.</p>}
        <form action={saveSuperadminProfile} className="grid gap-4">
          <TextInput label="Name" name="full_name" defaultValue={profile?.full_name || ""} maxLength={120} required />
          <div className="grid gap-1.5 text-sm font-semibold text-slate-700">Email address<div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal text-slate-600">{email || "Not available"}</div></div>
          <TextInput label="Phone" name="phone" defaultValue={profile?.phone || ""} maxLength={40} />
          <ActionButton>Save profile</ActionButton>
        </form>
      </Panel>
      <Panel title="Authentication">
        <p className="text-sm leading-6 text-slate-600">Password reset and multi-factor authentication are managed by Supabase Auth. Active session inventory and forced logout are not available through the current app configuration.</p>
        <Link className="mt-4 inline-flex text-sm font-bold text-[#245c55] hover:underline" href="/forgot-password">Request a password reset</Link>
      </Panel>
    </div>
  );
}

function BroadcastEmailsPage({ rows, providerReady }) {
  return (
    <div className="space-y-5">
      <Notice tone="warning">Email delivery is not integrated. KURO does not send campaign or transactional email, and this screen does not report fictional delivery logs.</Notice>
      <Panel title="Email configuration">
        <p className="text-sm text-slate-600">Email provider credential present: <Badge tone={providerReady ? "green" : "amber"}>{providerReady ? "yes, not wired to delivery" : "no"}</Badge></p>
        <p className="mt-3 text-sm leading-6 text-slate-600">Configure a supported provider in the server environment and implement consent, bounce handling, unsubscribe rules, and delivery logging before enabling sending.</p>
      </Panel>
      <Panel title="In-app broadcast history">{rows.length ? <Table headers={["Title", "Target", "Recipients", "Created"]}>{rows.map((item) => <tr key={item.id}><Cell>{item.title}</Cell><Cell>{item.target_role || "All active users"}</Cell><Cell>{item.recipient_count}</Cell><Cell>{formatDate(item.created_at)}</Cell></tr>)}</Table> : <Empty>No email or broadcast delivery logs.</Empty>}</Panel>
    </div>
  );
}

function RevenuePage({ rows, paidAmount, paidCount, pendingCount }) {
  const money = (amount, currency) => new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "PHP",
  }).format(Number(amount || 0) / 100);
  return (
    <div className="space-y-5">
      <Notice tone="warning">This ledger contains PayMongo test-mode transactions only. Plan renewals are manual, and this view does not represent payouts, refunds, taxes, or live revenue.</Notice>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Paid transactions" value={paidCount} detail="Verified by signed PayMongo webhooks." />
        <Metric label="Paid total" value={money(paidAmount, "PHP")} detail="From the 100 most recent transactions." accent="bg-emerald-500" />
        <Metric label="Awaiting payment" value={pendingCount} detail="Checkout sessions not yet confirmed." accent="bg-amber-500" />
      </div>
      <Panel title="Recent payments">
        {rows.length ? (
          <Table headers={["Reference", "Type", "Organization", "Amount", "Status", "Created", "Paid"]}>
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell className="font-mono text-xs">{row.reference_number}</Cell>
                <Cell>{row.payment_type === "event_ticket" ? "Event ticket" : `${row.plan_tier} plan`}</Cell>
                <Cell>{row.organizations?.name || "—"}</Cell>
                <Cell>{money(row.amount, row.currency)}</Cell>
                <Cell><Badge tone={row.status === "paid" ? "green" : row.status === "pending" ? "amber" : row.status === "failed" ? "red" : "neutral"}>{row.status}</Badge></Cell>
                <Cell>{formatDate(row.created_at)}</Cell>
                <Cell>{row.paid_at ? formatDate(row.paid_at) : "—"}</Cell>
              </tr>
            ))}
          </Table>
        ) : <Empty>No payment transactions recorded yet.</Empty>}
      </Panel>
    </div>
  );
}

function AvailabilityPage({ title, description, items }) {
  return (
    <div className="space-y-5">
      <Notice tone="warning">{description}</Notice>
      <Panel title={title}>
        <ul className="divide-y divide-slate-100">
          {items.map(([label, state, detail]) => <li className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center" key={label}><div><p className="text-sm font-semibold text-slate-800">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><Badge tone={state === "configured" ? "green" : "amber"}>{state}</Badge></li>)}
        </ul>
      </Panel>
    </div>
  );
}

function TasksPage({ rows }) {
  return <TaskPanel tasks={rows} />;
}

function LogsPage({ rows }) {
  return <Panel title="Recent platform actions" description="The latest 100 logged actions. Review events, access changes, broadcasts, and configuration updates.">{rows.length ? <Table headers={["When", "Actor", "Action", "Entity", "Details"]}>{rows.map((row) => <tr key={row.id}><Cell>{formatDate(row.created_at)}</Cell><Cell>{row.actor_id ? row.actor_id.slice(0, 8) : "System"}</Cell><Cell className="font-semibold">{row.action}</Cell><Cell>{row.entity_type}{row.entity_id ? <span className="mt-1 block font-mono text-xs text-slate-500">{row.entity_id}</span> : ""}</Cell><Cell><code className="whitespace-pre-wrap text-xs">{JSON.stringify(row.details)}</code></Cell></tr>)}</Table> : <Empty>No audit records yet.</Empty>}</Panel>;
}

function SearchPage({ queryText, organizations, users, events, applications, support }) {
  if (!queryText) return <Panel title="Search the platform"><form action="/superadmin/search" className="flex gap-2"><TextInput label="Search query" name="q" required maxLength={100} /><ActionButton>Search</ActionButton></form></Panel>;
  return (
    <div className="grid gap-5">
      <Panel title="Organizations">{organizations.length ? <Table headers={["Name", "Type", "Status"]}>{organizations.map((row) => <tr key={row.id}><Cell><Link className="font-semibold text-[#245c55] hover:underline" href={`/superadmin/organizations/${row.id}`}>{row.name}</Link></Cell><Cell>{row.sector}</Cell><Cell><Badge>{row.status}</Badge></Cell></tr>)}</Table> : <Empty>No matching organizations.</Empty>}</Panel>
      <Panel title="Users">{users.length ? <Table headers={["Name", "Email", "Role"]}>{users.map((row) => <tr key={row.id}><Cell>{row.full_name}</Cell><Cell>{row.email}</Cell><Cell><Badge>{row.role}</Badge></Cell></tr>)}</Table> : <Empty>No matching users.</Empty>}</Panel>
      <Panel title="Events">{events.length ? <Table headers={["Event", "Organization", "Status"]}>{events.map((row) => <tr key={row.id}><Cell>{row.title}</Cell><Cell>{row.organizations?.name || "—"}</Cell><Cell><Badge>{row.status}</Badge></Cell></tr>)}</Table> : <Empty>No matching events.</Empty>}</Panel>
      <Panel title="Applications">{applications.length ? <Table headers={["Organization", "Status", "Submitted"]}>{applications.map((row) => <tr key={row.id}><Cell><Link className="font-semibold text-[#245c55] hover:underline" href={`/superadmin/applications/${row.id}`}>{row.organization_name}</Link></Cell><Cell><Badge>{row.status}</Badge></Cell><Cell>{formatDate(row.created_at)}</Cell></tr>)}</Table> : <Empty>No matching applications.</Empty>}</Panel>
      <Panel title="Support requests">{support.length ? <Table headers={["Subject", "Status", "Priority", "Created"]}>{support.map((row) => <tr key={row.id}><Cell>{row.subject}</Cell><Cell><Badge>{row.status}</Badge></Cell><Cell><Badge>{row.priority}</Badge></Cell><Cell>{formatDate(row.created_at)}</Cell></tr>)}</Table> : <Empty>No matching support requests.</Empty>}</Panel>
    </div>
  );
}

async function loadSection(supabase, section, searchParams) {
  const searchValue = String(searchParams?.q || "").trim().slice(0, 100);
  if (section === "dashboard") {
    const [orgs, users, events, regs, attendance, applications, support, flagged, newUsers, recentOrgs, recentEvents, appRows, supportRows, tasks] = await Promise.all([
      supabase.from("organizations").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("events").select("id", { count: "exact", head: true }),
      supabase.from("registrations").select("id", { count: "exact", head: true }),
      supabase.from("attendance_logs").select("id", { count: "exact", head: true }),
      supabase.from("organizer_applications").select("id", { count: "exact", head: true }).in("status", ["pending", "under_review", "needs_info"]),
      supabase.from("support_requests").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
      supabase.from("events").select("id", { count: "exact", head: true }).in("moderation_status", ["flagged", "under_review"]),
      supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      supabase.from("organizations").select("id, name, slug, sector, status, created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("events").select("id, title, status, start_date, organizations(name)").order("created_at", { ascending: false }).limit(5),
      supabase.from("organizer_applications").select("id, organization_name, status, created_at").order("created_at", { ascending: false }).limit(3),
      supabase.from("support_requests").select("id, subject, priority, status, created_at").in("status", ["open", "in_progress"]).order("created_at", { ascending: false }).limit(3),
      supabase.from("superadmin_tasks").select("id, title, due_at, completed_at").order("completed_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }).limit(5),
    ]);
    [orgs, users, events, regs, attendance, applications, support, newUsers].forEach((result, index) => failOnError(result, `Unable to load overview metric ${index + 1}`));
    const lists = [recentOrgs, recentEvents, appRows, supportRows, tasks].map((result, index) => query(supabase, Promise.resolve(result), `Unable to load overview list ${index + 1}`));
    const [orgList, eventList, applicationList, supportList, taskList] = await Promise.all(lists);
    return { stats: { organizations: orgs.count || 0, users: users.count || 0, events: events.count || 0, registrations: regs.count || 0, checkins: attendance.count || 0, pendingApplications: applications.count || 0, openSupport: support.count || 0, flaggedEvents: flagged.error ? null : flagged.count || 0, flaggedEventsError: flagged.error ? describeSupabaseError(flagged.error) : null, newUsers: newUsers.count || 0 }, organizations: orgList, events: eventList, applications: applicationList, support: supportList, tasks: taskList };
  }
  if (section === "organizations") {
    let request = supabase.from("organizations").select("id, name, slug, sector, status, created_at").order("created_at", { ascending: false }).limit(100);
    if (searchValue) request = request.ilike("name", `%${searchValue}%`);
    const rows = await query(supabase, request, "Unable to load organizations");
    const owners = rows.length ? await query(
      supabase,
      supabase.from("superadmin_organization_owners").select("organization_id, user_id").in("organization_id", rows.map((row) => row.id)),
      "Unable to load organization owners",
    ) : [];
    const ownerIds = [...new Set(owners.map((owner) => owner.user_id))];
    const users = ownerIds.length ? await query(
      supabase,
      supabase.rpc("superadmin_list_users", { p_user_ids: ownerIds, p_limit: 100 }),
      "Unable to load organization owner profiles",
    ) : [];
    const userLookup = new Map(users.map((user) => [user.id, user]));
    const ownerLookup = new Map(owners.map((owner) => [owner.organization_id, userLookup.get(owner.user_id)]));
    return { rows: rows.map((org) => ({ ...org, ownerName: ownerLookup.get(org.id)?.full_name, ownerEmail: ownerLookup.get(org.id)?.email })) };
  }
  if (section === "applications") {
    const rows = await query(supabase, supabase.from("organizer_applications").select("id, user_id, organization_name, organization_type, details, status, review_notes, reviewed_at, created_at").order("created_at", { ascending: false }).limit(100), "Unable to load applications");
    const applicantIds = [...new Set(rows.map((row) => row.user_id))];
    const users = applicantIds.length ? await query(
      supabase,
      supabase.rpc("superadmin_list_users", { p_user_ids: applicantIds, p_limit: 100 }),
      "Unable to load applicant profiles",
    ) : [];
    return { rows: searchValue ? rows.filter((row) => row.organization_name.toLowerCase().includes(searchValue.toLowerCase())) : rows, userLookup: new Map(users.map((user) => [user.id, user])) };
  }
  if (section === "users" || section === "security") {
    const rows = await query(supabase, supabase.rpc("superadmin_list_users", { p_search: searchValue || null, p_limit: 100 }), "Unable to load user directory");
    return { rows };
  }
  if (section === "events") {
    let request = supabase.from("events").select("id, title, slug, status, moderation_status, moderation_reason, start_date, venue_name, city, organizations(name), registrations(count)").order("created_at", { ascending: false }).limit(100);
    if (searchValue) request = request.ilike("title", `%${searchValue}%`);
    return { rows: await query(supabase, request, "Unable to load events") };
  }
  if (section === "revenue") {
    const rows = await query(
      supabase,
      supabase.from("payment_transactions")
        .select("id, reference_number, payment_type, plan_tier, amount, currency, status, created_at, paid_at, organizations(name)")
        .order("created_at", { ascending: false })
        .limit(100),
      "Unable to load PayMongo payment activity",
    );
    const paidAmount = rows
      .filter((row) => row.status === "paid")
      .reduce((total, row) => total + Number(row.amount || 0), 0);
    return {
      rows,
      paidAmount,
      paidCount: rows.filter((row) => row.status === "paid").length,
      pendingCount: rows.filter((row) => row.status === "pending").length,
    };
  }
  if (section === "analytics") {
    const [profiles, organizations, events, registrations, attendance, recentProfiles, recentEvents, recentRegistrations] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("organizations").select("id", { count: "exact", head: true }),
      supabase.from("events").select("id", { count: "exact", head: true }),
      supabase.from("registrations").select("id", { count: "exact", head: true }),
      supabase.from("attendance_logs").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("events").select("id, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("registrations").select("id, created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    [profiles, organizations, events, registrations, attendance].forEach((result, index) => failOnError(result, `Unable to load analytics metric ${index + 1}`));
    const recent = [recentProfiles, recentEvents, recentRegistrations].map((result, index) => query(supabase, Promise.resolve(result), `Unable to load analytics trend ${index + 1}`));
    const [profileRows, eventRows, registrationRows] = await Promise.all(recent);
    return { stats: { profiles: profiles.count || 0, organizations: organizations.count || 0, events: events.count || 0, registrations: registrations.count || 0, attendance: attendance.count || 0 }, recent: { profiles: profileRows, events: eventRows, registrations: registrationRows } };
  }
  if (section === "support") {
    const [rows, messages] = await Promise.all([
      query(supabase, supabase.from("support_requests").select("id, user_id, subject, message, status, priority, created_at, updated_at, requester:profiles!support_requests_user_id_fkey(full_name)").order("created_at", { ascending: false }).limit(100), "Unable to load support requests"),
      query(supabase, supabase.from("support_messages").select("id, request_id, author_id, message, created_at, author:profiles!support_messages_author_id_fkey(full_name)").order("created_at", { ascending: false }).limit(1000), "Unable to load support messages"),
    ]);
    const messagesByRequest = new Map();
    for (const message of messages) {
      const thread = messagesByRequest.get(message.request_id) || [];
      thread.push(message);
      messagesByRequest.set(message.request_id, thread);
    }
    for (const thread of messagesByRequest.values()) thread.reverse();
    return { rows, messagesByRequest };
  }
  if (section === "notifications" || section === "emails") {
    const rows = await query(supabase, supabase.from("platform_broadcasts").select("id, title, message, target_role, recipient_count, created_at").order("created_at", { ascending: false }).limit(100), "Unable to load broadcast history");
    return { rows };
  }
  if (section === "features") return { rows: await query(supabase, supabase.from("feature_flags").select("flag_key, label, description, enabled, updated_at").order("label"), "Unable to load feature flags") };
  if (section === "content") return { rows: await query(supabase, supabase.from("platform_content").select("id, content_type, title, slug, status, updated_at").order("updated_at", { ascending: false }).limit(100), "Unable to load public content") };
  if (section === "settings") return { rows: await query(supabase, supabase.from("platform_settings").select("setting_key, setting_value, updated_at").order("setting_key"), "Unable to load platform settings") };
  if (section === "logs") return { rows: await query(supabase, supabase.from("superadmin_audit_logs").select("id, actor_id, action, entity_type, entity_id, details, created_at").order("created_at", { ascending: false }).limit(100), "Unable to load audit logs") };
  if (section === "tasks") return { rows: await query(supabase, supabase.from("superadmin_tasks").select("id, title, due_at, completed_at, created_at").order("completed_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }).limit(100), "Unable to load tasks") };
  if (section === "profile") {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const profile = failOnError(await supabase.from("profiles").select("full_name, phone").eq("id", authData.user.id).maybeSingle(), "Unable to load superadmin profile").data;
    return { profile, email: authData.user.email || "", saved: searchParams?.saved === "1" };
  }
  if (section === "search") {
    if (!searchValue) return { queryText: "", organizations: [], users: [], events: [], applications: [], support: [] };
    const [organizations, users, events, applications, support] = await Promise.all([
      query(supabase, supabase.from("organizations").select("id, name, sector, status").ilike("name", `%${searchValue}%`).limit(20), "Unable to search organizations"),
      query(supabase, supabase.rpc("superadmin_list_users", { p_search: searchValue, p_limit: 20 }), "Unable to search users"),
      query(supabase, supabase.from("events").select("id, title, status, organizations(name)").ilike("title", `%${searchValue}%`).limit(20), "Unable to search events"),
      query(supabase, supabase.from("organizer_applications").select("id, organization_name, status, created_at").ilike("organization_name", `%${searchValue}%`).limit(20), "Unable to search applications"),
      query(supabase, supabase.from("support_requests").select("id, subject, status, priority, created_at").ilike("subject", `%${searchValue}%`).limit(20), "Unable to search support requests"),
    ]);
    return { queryText: searchValue, organizations, users, events, applications, support };
  }
  if (section === "system") {
    const result = failOnError(await supabase.from("profiles").select("id", { count: "exact", head: true }), "Supabase database health check failed");
    return { databaseConnected: true, accountCount: result.count || 0 };
  }
  return {};
}

function ConsoleFallback({ section }) {
  const [title, description] = definitions[section];
  return (
    <>
      <PageHeading title={title} description={description} />
      <div aria-busy="true" className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" key={index} />)}</div>
        <div className="grid gap-5 xl:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" key={index} />)}</div>
      </div>
    </>
  );
}

export default function SuperadminConsole({ section, searchParams }) {
  return (
    <Suspense fallback={<ConsoleFallback section={section} />}>
      <SuperadminConsoleContent section={section} searchParams={searchParams} />
    </Suspense>
  );
}

async function SuperadminConsoleContent({ section, searchParams }) {
  await connection();
  const definition = definitions[section];
  if (!definition) throw new Error(`Unknown superadmin section: ${section}`);
  const params = searchParams ? await searchParams : {};
  const supabase = await createSupabaseServerClient();
  let data;
  try {
    data = await loadSection(supabase, section, params);
  } catch (error) {
    if (MissingMigration(error)) {
      return <><PageHeading title={definition[0]} description={definition[1]} /><SetupNotice /></>;
    }
    throw error;
  }
  const [title, description] = definition;
  return (
    <>
      <PageHeading title={title} description={description} />
      {section === "dashboard" && <Overview {...data} />}
      {section === "organizations" && <OrganizationsPage {...data} />}
      {section === "applications" && <ApplicationsPage {...data} />}
      {section === "users" && <UsersPage {...data} />}
      {section === "events" && <EventsPage {...data} />}
      {section === "analytics" && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Accounts" value={data.stats.profiles} /><Metric label="Organizations" value={data.stats.organizations} /><Metric label="Events" value={data.stats.events} /><Metric label="Registrations" value={data.stats.registrations} /><Metric label="Check-ins" value={data.stats.attendance} /></div>
          <Panel title="Last 30 days" description="Counts are calculated from the 500 most recent rows. Values are actual records, not estimates.">
            <AnalyticsTrends events={data.recent.events} profiles={data.recent.profiles} registrations={data.recent.registrations} />
          </Panel>
          <Notice tone="warning">Retention cohorts, conversion funnels, revenue, regional reports, AI usage, performance, and uptime need additional data collection or provider integrations.</Notice>
        </div>
      )}
      {section === "notifications" && <BroadcastsPage {...data} />}
      {section === "emails" && <BroadcastEmailsPage {...data} providerReady={Boolean(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY || process.env.MAILGUN_API_KEY)} />}
      {section === "content" && <ContentPage {...data} />}
      {section === "features" && <FeaturesPage {...data} />}
      {section === "logs" && <LogsPage {...data} />}
      {section === "settings" && <SettingsPage {...data} />}
      {section === "profile" && <ProfilePage {...data} />}
      {section === "support" && <SupportPage {...data} />}
      {section === "tasks" && <TasksPage {...data} />}
      {section === "search" && <SearchPage {...data} />}
      {section === "revenue" && <RevenuePage {...data} />}
      {section === "system" && <AvailabilityPage title="Infrastructure telemetry" description="This application can confirm whether its Supabase queries succeed. It cannot inspect internal database pool metrics, queues, backups, or restart infrastructure." items={[["Supabase database query", data.databaseConnected ? "configured" : "unavailable", `${data.accountCount} account profiles were counted in this request.`], ["Authentication", "configured", "The superadmin session was validated by Supabase Auth."], ["Email / SMS services", "unavailable", "No delivery provider is connected."], ["Backups, queues, storage metrics", "unavailable", "Use Supabase project operations and monitoring."]]} />}
      {section === "security" && <SecurityPage {...data} />}
      {section === "integrations" && <AvailabilityPage title="Provider configuration status" description="Only the presence of server environment variables is checked. Secret values are never returned to the page." items={[
        ["Supabase", "configured", "Database and authentication client."],
        ["Resend", process.env.RESEND_API_KEY ? "configured" : "unavailable", "Email delivery."],
        ["SendGrid", process.env.SENDGRID_API_KEY ? "configured" : "unavailable", "Email delivery."],
        ["Stripe", process.env.STRIPE_SECRET_KEY ? "configured" : "unavailable", "Payment processing."],
        ["PayMongo checkout", process.env.PAYMONGO_SECRET_KEY?.startsWith("sk_test_") ? "test mode" : "unavailable", "Test-mode checkout only; live keys are deliberately rejected."],
        ["PayMongo webhook", process.env.PAYMONGO_WEBHOOK_SECRET ? "configured" : "unavailable", "Required to confirm payments securely."],
        ["Payment ledger", process.env.SUPABASE_SERVICE_ROLE_KEY ? "configured" : "unavailable", "Server-only key required to process signed webhooks."],
        ["Twilio", process.env.TWILIO_AUTH_TOKEN ? "configured" : "unavailable", "SMS."],
        ["AI provider", process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY ? "configured" : "unavailable", "AI-assisted features."],
      ]} />}
    </>
  );
}
