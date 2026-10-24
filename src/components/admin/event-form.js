"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveAdminEvent } from "@/app/(admin)/admin/actions";

const categories = [
  ["academic", "Academic"],
  ["technology", "Technology"],
  ["sports", "Sports"],
  ["entertainment", "Entertainment"],
  ["conference", "Conference"],
  ["workshop", "Workshop"],
  ["seminar", "Seminar"],
  ["competition", "Competition"],
  ["community", "Community"],
  ["other", "Other"],
];

function localDateTime(value, timezone) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function Field({ label, children, hint }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      {children}
      {hint && <span className="text-xs font-normal leading-5 text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass = "min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#245c55] focus:ring-2 focus:ring-[#245c55]/15";

export default function EventForm({ organization, event = null, venues = [], initialStatus = "draft", onlineMeetingUrl = "" }) {
  const [state, formAction] = useActionState(saveAdminEvent, { error: "" });
  const timezone = event?.timezone || organization.timezone || "Asia/Manila";

  return (
    <form action={formAction} className="space-y-7">
      <input name="event_id" type="hidden" value={event?.id || ""} />
      <input name="organization_id" type="hidden" value={organization.id} />
      <input name="slug" type="hidden" value={event?.slug || ""} />
      {state.error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800" role="alert">
          {state.error}
        </p>
      )}
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <h2 className="font-bold text-slate-900">Basic information</h2>
          <p className="mt-1 text-sm text-slate-500">Public details used on the event listing.</p>
        </div>
        <Field label="Event title">
          <input className={inputClass} defaultValue={event?.title || ""} maxLength={200} name="title" required />
        </Field>
        <Field label="Category">
          <select className={inputClass} defaultValue={event?.category || "other"} name="category">
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Tags" hint="Separate tags with commas.">
          <input className={inputClass} defaultValue={event?.tags?.join(", ") || ""} maxLength={1000} name="tags" />
        </Field>
        <Field label="Short description">
          <textarea className={inputClass} defaultValue={event?.short_description || ""} maxLength={280} name="short_description" rows={2} />
        </Field>
        <Field label="Full description">
          <textarea className={inputClass} defaultValue={event?.description || ""} maxLength={10000} name="description" rows={5} />
        </Field>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <h2 className="font-bold text-slate-900">Date, time, and check-in</h2>
          <p className="mt-1 text-sm text-slate-500">Registration deadlines and check-in windows are separate. Times use the selected event timezone.</p>
        </div>
        <Field label="Event timezone">
          <input className={inputClass} defaultValue={timezone} maxLength={100} name="timezone" required />
        </Field>
        <Field label="Start date and time" hint="Use a future date and time to publish this event. Past or ongoing events can be saved as drafts.">
          <input className={inputClass} defaultValue={localDateTime(event?.start_date, timezone)} name="start_date" required type="datetime-local" />
        </Field>
        <Field label="End date and time">
          <input className={inputClass} defaultValue={localDateTime(event?.end_date, timezone)} name="end_date" type="datetime-local" />
        </Field>
        <Field label="Registration opens">
          <input className={inputClass} defaultValue={localDateTime(event?.registration_opens_at, timezone)} name="registration_opens_at" type="datetime-local" />
        </Field>
        <Field label="Registration deadline">
          <input className={inputClass} defaultValue={localDateTime(event?.registration_deadline, timezone)} name="registration_deadline" type="datetime-local" />
        </Field>
        <Field label="Check-in opens">
          <input className={inputClass} defaultValue={localDateTime(event?.checkin_opens_at, timezone)} name="checkin_opens_at" type="datetime-local" />
        </Field>
        <Field label="Check-in closes">
          <input className={inputClass} defaultValue={localDateTime(event?.checkin_closes_at, timezone)} name="checkin_closes_at" type="datetime-local" />
        </Field>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <h2 className="font-bold text-slate-900">Venue and registration</h2>
        </div>
        <Field label="Saved venue and seating plan" hint="Select a venue to require attendee seat selection.">
          <select className={inputClass} defaultValue={event?.venue_id || ""} name="venue_id">
            <option value="">No venue seat plan</option>
            {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
          </select>
        </Field>
        <Field label="Venue name (when no saved venue)">
          <input className={inputClass} defaultValue={!event?.venue_id ? event?.venue_name || "" : ""} maxLength={200} name="venue_name" />
        </Field>
        <Field label="City">
          <input className={inputClass} defaultValue={event?.city || ""} maxLength={120} name="city" />
        </Field>
        <Field label="Capacity" hint="Leave blank for unlimited capacity.">
          <input className={inputClass} defaultValue={event?.capacity || ""} min="1" name="capacity" type="number" />
        </Field>
        <Field label="Registration fee" hint="Paid checkout is unavailable until a payment provider is configured.">
          <input className={inputClass} defaultValue={event?.ticket_price || "0"} min="0" name="ticket_price" step="0.01" type="number" />
        </Field>
        <Field label="Currency">
          <input className={inputClass} defaultValue={event?.currency || "PHP"} maxLength={3} minLength={3} name="currency" pattern="[A-Za-z]{3}" required />
        </Field>
        <Field label="Registration approval">
          <select className={inputClass} defaultValue={event?.registration_approval || "automatic"} name="registration_approval">
            <option value="automatic">Automatic</option>
            <option value="manual">Manual approval</option>
          </select>
        </Field>
        <Field label="Private online meeting link" hint="Visible only to eligible registrants and organization members. HTTPS required.">
          <input className={inputClass} defaultValue={onlineMeetingUrl} name="online_meeting_url" pattern="https://.+" title="Enter a full URL that starts with https://" type="url" />
        </Field>
        {onlineMeetingUrl && (
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input name="clear_online_meeting_url" type="checkbox" />
            Remove the saved private meeting link
          </label>
        )}
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input defaultChecked={event?.waitlist_enabled || false} name="waitlist_enabled" type="checkbox" />
          Enable waitlist when full
        </label>
      </section>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <Field label="Event status" hint={!event ? "Only future events can be published. Choose Save as draft for an event that has already started." : undefined}>
          {event ? (
            <>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium capitalize text-slate-700">{event.status}</span>
              <input name="status" type="hidden" value={event.status} />
            </>
          ) : (
            <select className={inputClass} defaultValue={initialStatus} name="status">
              <option value="draft">Save as draft</option>
              <option value="published">Publish event</option>
            </select>
          )}
        </Field>
        <button className="rounded-md bg-[#173d39] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#245c55]" type="submit">
          {event ? "Save event" : "Create event"}
        </button>
        <Link className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={event ? `/admin/events/${event.id}?organization_id=${organization.id}` : `/admin/events?organization_id=${organization.id}`}>
          Cancel
        </Link>
        {Number(event?.ticket_price) > 0 && (
          <p className="basis-full text-sm text-amber-800">Paid event registration will be rejected until payment checkout is available.</p>
        )}
      </section>
    </form>
  );
}
